import { Op } from 'sequelize';

import { Finding, FindingOccurrence, GithubInstallation, Repository, Scan } from '../../db/models';
import crypto from 'crypto';
import { env } from '../../bootstrap/env';

import { fetchRepositoryBlob, fetchRepositoryBranches, fetchRepositoryTree, createInstallationAccessToken } from '../../modules/github/github.service';
import { GithubBranchResponse, GithubTreeItem } from '../../modules/github/github.types';
import { queueScanFailedEmail, queueScanSummaryEmail, queueSecurityAlert } from './notification.service';
import { refreshRepositorySecurityScore } from './security-posture.service';
import { filterIgnoredFindings } from './ignore-rule.service';
import { RepositoryFile, ScannerFinding, scanFiles } from './scan-rules.service';
import { getTenantPlan } from './plan-limit.service';
import { sequelize } from '../../db/sequelize';

const maxFileSizeBytes = 300 * 1024;
const textFileExtensions = new Set(
    [
        '.js',
        '.ts',
        '.tsx',
        '.jsx',
        '.json',
        '.env',
        '.yml',
        '.yaml',
        '.toml',
        '.ini',
        '.conf',
        '.config',
        '.xml',
        '.md',
        '.txt',
        '.sh',
        '.bash',
        '.zsh',
        '.py',
        '.php',
        '.rb',
        '.go',
        '.java',
        '.cs',
        '.rs',
        '.sql',
        '.pem',
        '.key',
        '.dockerfile'
    ]
);

function sleep(ms: number)
{
    return new Promise(function (resolve)
    {
        setTimeout(resolve, ms);
    });
}

function getExtension(filePath: string): string
{
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith('dockerfile') || lowerPath.includes('/dockerfile'))
    {
        return '.dockerfile';
    }

    const index = lowerPath.lastIndexOf('.');
    return index >= 0 ? lowerPath.slice(index) : '';
}

function shouldScanTreeItem(item: GithubTreeItem): boolean
{
    if (item.type !== 'blob')
    {
        return false;
    }

    if (item.size !== undefined && item.size > maxFileSizeBytes)
    {
        return false;
    }

    return textFileExtensions.has(getExtension(item.path));
}

function decodeBlobContent(content: string, encoding: string): string
{
    if (encoding !== 'base64')
    {
        return content;
    }

    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function enqueueRepositoryScan(repositoryId: number, triggerType: string)
{
    return sequelize.transaction(async function (transaction)
    {
    const repository = await Repository.findByPk(repositoryId, { transaction, lock: transaction.LOCK.UPDATE });

    if (!repository || !repository.isActive)
    {
        return null;
    }

    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId, { transaction })
        : null;
    const tenantId = githubInstallation?.tenantId;

    if (!tenantId)
    {
        return null;
    }

    if (triggerType === 'push')
    {
        const plan = await getTenantPlan(tenantId, transaction);
        const debounceMinutes = Math.max(10, Number(plan?.manualScanCooldownMinutes ?? 15));
        const recentPushScan = await Scan.findOne(
            {
                where:
                {
                    repositoryId,
                    triggerType: 'push',
                    createdAt: { [Op.gte]: new Date(Date.now() - debounceMinutes * 60 * 1000) }
                },
                transaction
            }
        );
        if (recentPushScan) return null;
    }

    const existing = await Scan.findOne(
        { where: { repositoryId, status: { [Op.in]: ['queued', 'running', 'retry'] } }, transaction }
    );

    if (existing)
    {
        return existing;
    }

    return Scan.create(
        {
            tenantId,
            repositoryId: repository.id,
            status: 'queued',
            triggerType,
            branch: repository.defaultBranch
        },
        { transaction }
    );
    });
}

function scheduleIntervalMs(schedule: string)
{
    if (schedule === 'weekly') return 7 * 24 * 60 * 60 * 1000;
    if (schedule === 'every_4_days') return 4 * 24 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
}

async function enqueueDueScheduledScans(now = new Date())
{
    const repositories = await Repository.findAll({ where: { isActive: true } });
    const queued: Scan[] = [];

    for (const repository of repositories)
    {
        const installation = repository.githubInstallationId
            ? await GithubInstallation.findByPk(repository.githubInstallationId)
            : null;
        if (!installation) continue;

        const plan = await getTenantPlan(installation.tenantId);
        if (!plan) continue;

        const latestCompleted = await Scan.findOne(
            { where: { repositoryId: repository.id, status: 'completed' }, order: [['completedAt', 'DESC']] }
        );
        const base = repository.lastScheduledScanAt ?? latestCompleted?.completedAt ?? repository.createdAt;
        const nextDue = repository.nextScheduledScanAt ?? new Date(base.getTime() + scheduleIntervalMs(plan.scanSchedule));

        if (nextDue > now)
        {
            if (!repository.nextScheduledScanAt) await repository.update({ nextScheduledScanAt: nextDue });
            continue;
        }

        const scan = await enqueueRepositoryScan(repository.id, 'scheduled');
        if (scan && scan.triggerType === 'scheduled') queued.push(scan);
        await repository.update(
            { lastScheduledScanAt: now, nextScheduledScanAt: new Date(now.getTime() + scheduleIntervalMs(plan.scanSchedule)) }
        );
    }

    return queued;
}

async function enqueueAllActiveRepositories(triggerType: string)
{
    const repositories = await Repository.findAll(
        {
            where:
            {
                isActive: true
            }
        }
    );
    const scans = [];

    for (const repository of repositories)
    {
        const scan = await enqueueRepositoryScan(repository.id, triggerType);

        if (scan)
        {
            scans.push(scan);
        }
    }

    return scans;
}

async function getNextQueuedScan()
{
    return Scan.findOne(
        {
            where:
            {
                status:
                {
                    [Op.in]: ['queued', 'retry']
                }
            },
            order: [['createdAt', 'ASC']]
        }
    );
}

function branchFingerprint(branch: string, fingerprint: string)
{
    return crypto
        .createHash('sha256')
        .update(`${branch}:${fingerprint}`)
        .digest('hex');
}

function findingBranch(finding: ScannerFinding)
{
    const metadata = finding.metadata as { branch?: unknown } | undefined;

    return typeof metadata?.branch === 'string' ? metadata.branch : null;
}

function normalizeBranches(repository: Repository, branches: GithubBranchResponse[])
{
    const fallbackBranch = repository.defaultBranch || 'main';
    const branchMap = new Map<string, GithubBranchResponse>();

    for (const branch of branches)
    {
        branchMap.set(branch.name, branch);
    }

    if (!branchMap.has(fallbackBranch))
    {
        branchMap.set(
            fallbackBranch,
            {
                name: fallbackBranch,
                commit:
                {
                    sha: fallbackBranch
                }
            }
        );
    }

    return Array.from(branchMap.values()).sort(function (left, right)
    {
        if (left.name === fallbackBranch)
        {
            return -1;
        }

        if (right.name === fallbackBranch)
        {
            return 1;
        }

        return left.name.localeCompare(right.name);
    });
}

async function fetchScannableFilesForBranch(repository: Repository, accessToken: string, branch: GithubBranchResponse, remainingFiles: number): Promise<RepositoryFile[]>
{
    const tree = await fetchRepositoryTree(accessToken, repository.fullName, branch.commit.sha || branch.name);
    const treeItems = tree.tree.filter(shouldScanTreeItem).slice(0, Math.min(env.scanMaxFilesPerBranch, remainingFiles));
    const files: RepositoryFile[] = [];

    for (const item of treeItems)
    {
        const blob = await fetchRepositoryBlob(accessToken, repository.fullName, item.sha);
        files.push(
            {
                path: item.path,
                content: decodeBlobContent(blob.content, blob.encoding)
            }
        );
    }

    return files;
}

async function scanGithubRepositoryBranches(repository: Repository): Promise<ScannerFinding[]>
{
    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;

    if (!githubInstallation)
    {
        throw new Error('GitHub installation not found for repository');
    }

    const accessToken = await createInstallationAccessToken(githubInstallation.githubInstallationId);
    const branches = normalizeBranches(repository, await fetchRepositoryBranches(accessToken, repository.fullName));
    const findings: ScannerFinding[] = [];
    const startedAt = Date.now();
    let scannedFiles = 0;

    if (branches.length > env.scanMaxBranches)
    {
        throw new Error(`Repository has ${branches.length} branches; the safe scan limit is ${env.scanMaxBranches}. Archive stale branches or increase SCAN_MAX_BRANCHES.`);
    }

    for (const branch of branches)
    {
        if (Date.now() - startedAt > env.scanMaxDurationMs)
        {
            throw new Error(`Scan exceeded the ${Math.ceil(env.scanMaxDurationMs / 60000)} minute safety limit.`);
        }

        const remainingFiles = env.scanMaxFiles - scannedFiles;
        if (remainingFiles <= 0)
        {
            throw new Error(`Repository exceeded the ${env.scanMaxFiles} file scan budget.`);
        }

        const files = await fetchScannableFilesForBranch(repository, accessToken, branch, remainingFiles);
        scannedFiles += files.length;
        const branchFindings = scanFiles(files).map(function (finding)
        {
            return {
                ...finding,
                fingerprint: branchFingerprint(branch.name, finding.fingerprint),
                metadata:
                {
                    ...(finding.metadata ?? {}),
                    branch: branch.name
                }
            };
        });

        findings.push(...branchFindings);
    }

    return findings;
}

async function scanRepositoryBranches(repository: Repository): Promise<ScannerFinding[]>
{
    if (repository.provider === 'github')
    {
        return scanGithubRepositoryBranches(repository);
    }

    throw new Error('Only GitHub repositories are supported');
}

async function processScan(scan: Scan)
{
    if (scan.status !== 'running')
    {
        await scan.update(
            {
                status: 'running',
                startedAt: new Date(),
                errorMessage: null
            }
        );
    }

    try
    {
        const repository = await Repository.findByPk(scan.repositoryId);

        if (!repository)
        {
            throw new Error('Repository not found for scan');
        }

        const scannerFindings = await filterIgnoredFindings(scan.tenantId, await scanRepositoryBranches(repository));
        const dedupedFindings = Array.from(
            new Map(scannerFindings.map((finding) => [finding.fingerprint, finding])).values()
        );
        const currentFingerprints = dedupedFindings.map((finding) => finding.fingerprint);
        const existingOpenFindings = currentFingerprints.length > 0
            ? await Finding.findAll(
                {
                    where:
                    {
                        repositoryId: repository.id,
                        status: 'open',
                        fingerprint:
                        {
                            [Op.in]: currentFingerprints
                        }
                    }
                }
            )
            : [];
        const existingOpenFingerprints = new Set(existingOpenFindings.map((finding) => finding.fingerprint));
        const counts =
        {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        if (currentFingerprints.length > 0)
        {
            await Finding.update(
                {
                    lastSeenAt: new Date(),
                    status: 'open',
                    resolvedAt: null
                },
                {
                    where:
                    {
                        repositoryId: repository.id,
                        fingerprint:
                        {
                            [Op.in]: currentFingerprints
                        }
                    }
                }
            );

            await Finding.update(
                {
                    status: 'resolved',
                    resolvedAt: new Date()
                },
                {
                    where:
                    {
                        repositoryId: repository.id,
                        status: 'open',
                        fingerprint:
                        {
                            [Op.notIn]: currentFingerprints
                        }
                    }
                }
            );
        }
        else
        {
            await Finding.update(
                {
                    status: 'resolved',
                    resolvedAt: new Date()
                },
                {
                    where:
                    {
                        repositoryId: repository.id,
                        status: 'open'
                    }
                }
            );
        }

        for (const finding of dedupedFindings)
        {
            counts[finding.severity] += 1;
        }

        await Finding.bulkCreate(
            dedupedFindings
                .filter((finding) => !existingOpenFingerprints.has(finding.fingerprint))
                .map(function (finding)
                {
                    return {
                        scanId: scan.id,
                        repositoryId: repository.id,
                        ruleId: finding.ruleId,
                        severity: finding.severity,
                        title: finding.title,
                        description: finding.description,
                        remediation: finding.remediation,
                        branch: findingBranch(finding),
                        filePath: finding.filePath,
                        lineNumber: finding.lineNumber,
                        fingerprint: finding.fingerprint,
                        status: 'open',
                        firstSeenAt: new Date(),
                        lastSeenAt: new Date(),
                        metadata: finding.metadata ?? null
                    };
                })
        );

        const currentFindings = currentFingerprints.length > 0
            ? await Finding.findAll(
                { where: { repositoryId: repository.id, fingerprint: { [Op.in]: currentFingerprints } } }
            )
            : [];

        if (currentFindings.length > 0)
        {
            await FindingOccurrence.bulkCreate(
                currentFindings.map(function (finding)
                {
                    return {
                        scanId: scan.id,
                        findingId: finding.id,
                        repositoryId: repository.id,
                        branch: finding.branch,
                        severity: finding.severity,
                        ruleId: finding.ruleId,
                        title: finding.title,
                        description: finding.description,
                        remediation: finding.remediation,
                        filePath: finding.filePath,
                        lineNumber: finding.lineNumber
                    };
                }),
                { ignoreDuplicates: true }
            );
        }

        await scan.update(
            {
                status: 'completed',
                findingsCritical: counts.critical,
                findingsHigh: counts.high,
                findingsMedium: counts.medium,
                findingsLow: counts.low,
                completedAt: new Date()
            }
        );

        await refreshRepositorySecurityScore(repository.id);
        await repository.reload();
        await queueSecurityAlert(scan.tenantId, repository.fullName, dedupedFindings);
        await queueScanSummaryEmail(scan, repository);

        return scan;
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'Unknown scan error';
        const repository = await Repository.findByPk(scan.repositoryId);

        await scan.update(
            {
                status: 'failed',
                errorMessage: message,
                completedAt: new Date()
            }
        );
        await queueScanFailedEmail(scan, repository, message);

        throw error;
    }
}

async function runScanWorkerOnce()
{
    const scan = await getNextQueuedScan();

    if (!scan)
    {
        return null;
    }

    const [updatedRows] = await Scan.update(
        {
            status: 'running',
            startedAt: new Date(),
            errorMessage: null
        },
        {
            where:
            {
                id: scan.id,
                status: scan.status
            }
        }
    );

    if (updatedRows !== 1)
    {
        return null;
    }

    await scan.reload();

    return processScan(scan);
}

async function runScanWorkerLoop(pollMs: number)
{
    while (true)
    {
        try
        {
            await runScanWorkerOnce();
        }
        catch (error)
        {
            console.error('Scan worker error:', error);
        }

        await sleep(pollMs);
    }
}

export {
    enqueueRepositoryScan,
    enqueueAllActiveRepositories,
    enqueueDueScheduledScans,
    processScan,
    runScanWorkerOnce,
    runScanWorkerLoop
};
