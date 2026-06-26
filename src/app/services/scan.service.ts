import { Op } from 'sequelize';

import { Finding, FindingOccurrence, GithubInstallation, Repository, Scan } from '../../db/models';
import crypto from 'crypto';
import { env } from '../../bootstrap/env';

import {
    fetchOpenDependabotAlerts,
    fetchOpenSecretScanningAlerts,
    fetchRepositoryBlob,
    fetchRepositoryBranches,
    fetchRepositoryTree,
    createRepositoryCheckRun,
    createInstallationAccessToken
} from '../../modules/github/github.service';
import { GithubBranchResponse, GithubCheckRunAnnotation, GithubDependabotAlertResponse, GithubSecretScanningAlertResponse, GithubTreeItem } from '../../modules/github/github.types';
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
        '.mjs',
        '.cjs',
        '.ts',
        '.tsx',
        '.jsx',
        '.vue',
        '.svelte',
        '.astro',
        '.html',
        '.htm',
        '.css',
        '.scss',
        '.sass',
        '.less',
        '.json',
        '.json5',
        '.env',
        '.yml',
        '.yaml',
        '.toml',
        '.ini',
        '.conf',
        '.config',
        '.properties',
        '.gradle',
        '.tf',
        '.tfvars',
        '.hcl',
        '.xml',
        '.md',
        '.mdx',
        '.txt',
        '.sh',
        '.bash',
        '.zsh',
        '.fish',
        '.ps1',
        '.bat',
        '.cmd',
        '.py',
        '.pyw',
        '.php',
        '.rb',
        '.go',
        '.java',
        '.kt',
        '.kts',
        '.cs',
        '.rs',
        '.c',
        '.h',
        '.cc',
        '.cpp',
        '.cxx',
        '.hpp',
        '.m',
        '.mm',
        '.swift',
        '.scala',
        '.sc',
        '.dart',
        '.lua',
        '.pl',
        '.pm',
        '.ex',
        '.exs',
        '.erl',
        '.hrl',
        '.clj',
        '.cljs',
        '.hs',
        '.r',
        '.R',
        '.jl',
        '.groovy',
        '.sql',
        '.graphql',
        '.gql',
        '.proto',
        '.pem',
        '.key',
        '.p12',
        '.crt',
        '.cer',
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

function normalizeGithubSeverity(severity?: string): ScannerFinding['severity']
{
    if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low')
    {
        return severity;
    }

    return 'medium';
}

function nativeFindingFingerprint(source: string, repositoryFullName: string, id: string | number)
{
    return crypto
        .createHash('sha256')
        .update(`${source}:${repositoryFullName}:${id}`)
        .digest('hex');
}

function mapDependabotAlert(repository: Repository, alert: GithubDependabotAlertResponse): ScannerFinding
{
    const dependencyName = alert.dependency?.package?.name ?? 'dependency';
    const ecosystem = alert.dependency?.package?.ecosystem ?? 'package';
    const advisoryId = alert.security_advisory?.ghsa_id ?? alert.security_advisory?.cve_id ?? `alert-${alert.number}`;
    const vulnerableRange = alert.security_vulnerability?.vulnerable_version_range;
    const patchedVersion = alert.security_vulnerability?.first_patched_version?.identifier;
    const severity = normalizeGithubSeverity(alert.security_advisory?.severity ?? alert.security_vulnerability?.severity);
    const filePath = alert.dependency?.manifest_path || 'dependency manifest';

    return {
        ruleId: 'github.dependabot-alert',
        severity,
        title: `Dependabot alert: ${dependencyName}`,
        description: alert.security_advisory?.summary ?? `GitHub reported an open Dependabot alert for ${dependencyName}.`,
        remediation: patchedVersion
            ? `Update ${dependencyName} to ${patchedVersion} or later. Review the GitHub advisory and verify the dependency is no longer vulnerable.`
            : `Review the GitHub Dependabot alert for ${dependencyName}, update or replace the vulnerable dependency, then run a new scan.`,
        filePath,
        lineNumber: null,
        fingerprint: nativeFindingFingerprint('github.dependabot-alert', repository.fullName, advisoryId),
        metadata:
        {
            source: 'github_dependabot',
            githubAlertNumber: alert.number,
            advisoryId,
            ecosystem,
            dependencyName,
            vulnerableRange,
            patchedVersion,
            htmlUrl: alert.html_url
        }
    };
}

function mapSecretScanningAlert(repository: Repository, alert: GithubSecretScanningAlertResponse): ScannerFinding
{
    const secretType = alert.secret_type_display_name || alert.secret_type || 'secret';
    const location = alert.first_location_detected;

    return {
        ruleId: 'github.secret-scanning-alert',
        severity: alert.publicly_leaked || alert.validity === 'active' ? 'critical' : 'high',
        title: `GitHub secret scanning alert: ${secretType}`,
        description: `GitHub reported an open secret scanning alert for ${secretType}.`,
        remediation: 'Open the GitHub secret scanning alert, rotate or revoke the exposed credential, remove it from history where needed, and confirm the alert is resolved.',
        filePath: location?.path || 'GitHub secret scanning alert',
        lineNumber: location?.start_line ?? null,
        fingerprint: nativeFindingFingerprint('github.secret-scanning-alert', repository.fullName, alert.number),
        metadata:
        {
            source: 'github_secret_scanning',
            githubAlertNumber: alert.number,
            secretType: alert.secret_type,
            secretTypeDisplayName: alert.secret_type_display_name,
            validity: alert.validity,
            publiclyLeaked: alert.publicly_leaked,
            commitSha: location?.commit_sha,
            htmlUrl: alert.html_url
        }
    };
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
    const [dependabotAlerts, secretScanningAlerts] = await Promise.all(
        [
            fetchOpenDependabotAlerts(accessToken, repository.fullName),
            fetchOpenSecretScanningAlerts(accessToken, repository.fullName)
        ]
    );
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

    findings.push(...dependabotAlerts.map((alert) => mapDependabotAlert(repository, alert)));
    findings.push(...secretScanningAlerts.map((alert) => mapSecretScanningAlert(repository, alert)));

    return findings;
}

function checkAnnotationLevel(severity: string): GithubCheckRunAnnotation['annotation_level']
{
    if (severity === 'critical' || severity === 'high') return 'failure';
    if (severity === 'medium') return 'warning';
    return 'notice';
}

function checkConclusion(counts: { critical: number; high: number; medium: number; low: number })
{
    if (counts.critical > 0 || counts.high > 0) return 'failure' as const;
    if (counts.medium > 0 || counts.low > 0) return 'neutral' as const;
    return 'success' as const;
}

function buildGithubCheckText(findings: ScannerFinding[])
{
    if (findings.length === 0)
    {
        return 'No open security findings were detected in this scan.';
    }

    return findings
        .slice(0, 20)
        .map((finding) => `- **${finding.severity.toUpperCase()}** ${finding.title} in \`${finding.filePath}\`${finding.lineNumber ? `:${finding.lineNumber}` : ''}`)
        .join('\n');
}

async function publishGithubCheckRun(repository: Repository, scan: Scan, findings: ScannerFinding[], counts: { critical: number; high: number; medium: number; low: number })
{
    if (repository.provider !== 'github' || !repository.githubInstallationId)
    {
        return;
    }

    const installation = await GithubInstallation.findByPk(repository.githubInstallationId);

    if (!installation)
    {
        return;
    }

    const accessToken = await createInstallationAccessToken(installation.githubInstallationId);
    const headSha = scan.commitSha
        ?? (await fetchRepositoryBranches(accessToken, repository.fullName)).find((branch) => branch.name === repository.defaultBranch)?.commit.sha;

    if (!headSha)
    {
        return;
    }
    const total = counts.critical + counts.high + counts.medium + counts.low;
    const annotations = findings
        .filter((finding) => finding.lineNumber && !finding.filePath.startsWith('GitHub '))
        .slice(0, 50)
        .map(function (finding): GithubCheckRunAnnotation
        {
            const line = Math.max(1, Number(finding.lineNumber || 1));

            return {
                path: finding.filePath,
                start_line: line,
                end_line: line,
                annotation_level: checkAnnotationLevel(finding.severity),
                title: finding.title.slice(0, 255),
                message: finding.remediation.slice(0, 4000)
            };
        });

    try
    {
        await createRepositoryCheckRun(
            accessToken,
            repository.fullName,
            {
                name: 'SecureRepos security scan',
                headSha,
                conclusion: checkConclusion(counts),
                title: total === 0 ? 'SecureRepos scan passed' : `SecureRepos found ${total} security findings`,
                summary: `Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}`,
                text: buildGithubCheckText(findings),
                annotations
            }
        );
    }
    catch (error)
    {
        console.warn(`GitHub check run could not be created for ${repository.fullName}:`, error instanceof Error ? error.message : error);
    }
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
        await publishGithubCheckRun(repository, scan, dedupedFindings, counts);
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
