import { Op } from 'sequelize';

import { Finding, GithubInstallation, Repository, Scan } from '../../db/models';
import { fetchRepositoryBlob, fetchRepositoryTree, createInstallationAccessToken } from '../../modules/github/github.service';
import { GithubTreeItem } from '../../modules/github/github.types';
import { queueScanFailedEmail, queueScanSummaryEmail, queueSecurityAlert } from './notification.service';
import { refreshRepositorySecurityScore } from './security-posture.service';
import { filterIgnoredFindings } from './ignore-rule.service';
import { RepositoryFile, scanFiles } from './scan-rules.service';

const maxFileSizeBytes = 300 * 1024;
const maxFilesPerScan = 500;
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
    const repository = await Repository.findByPk(repositoryId);

    if (!repository || !repository.isActive)
    {
        return null;
    }

    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;
    const tenantId = githubInstallation?.tenantId;

    if (!tenantId)
    {
        return null;
    }

    return Scan.create(
        {
            tenantId,
            repositoryId: repository.id,
            status: 'queued',
            triggerType,
            branch: repository.defaultBranch
        }
    );
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

async function fetchScannableFiles(repository: Repository, accessToken: string): Promise<RepositoryFile[]>
{
    const branch = repository.defaultBranch || 'main';
    const tree = await fetchRepositoryTree(accessToken, repository.fullName, branch);
    const treeItems = tree.tree.filter(shouldScanTreeItem).slice(0, maxFilesPerScan);
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

async function fetchScannableFilesForRepository(repository: Repository): Promise<RepositoryFile[]>
{
    if (repository.provider === 'github')
    {
        const githubInstallation = repository.githubInstallationId
            ? await GithubInstallation.findByPk(repository.githubInstallationId)
            : null;

        if (!githubInstallation)
        {
            throw new Error('GitHub installation not found for repository');
        }

        const accessToken = await createInstallationAccessToken(githubInstallation.githubInstallationId);
        return fetchScannableFiles(repository, accessToken);
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

        const files = await fetchScannableFilesForRepository(repository);
        const scannerFindings = await filterIgnoredFindings(scan.tenantId, scanFiles(files));
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
    processScan,
    runScanWorkerOnce,
    runScanWorkerLoop
};
