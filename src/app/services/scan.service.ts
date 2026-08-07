import { Op } from 'sequelize';

import { Finding, FindingOccurrence, GithubInstallation, Repository, Scan, TenantSubscription } from '../../db/models';
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
import { GithubBranchResponse, GithubCheckRunAnnotation, GithubDependabotAlertResponse, GithubSecretScanningAlertResponse } from '../../modules/github/github.types';
import { queueScanFailedEmail, queueScanSummaryEmail, queueSecurityAlert } from './notification.service';
import { refreshRepositorySecurityScore } from './security-posture.service';
import { RepositoryFile, ScannerFinding, scanFiles } from './scan-rules.service';
import { extractDependencies } from './dependency-inventory.service';
import { scanDependencyVulnerabilities } from './osv.service';
import { getTenantPlan } from './plan-limit.service';
import { sequelize } from '../../db/sequelize';
import { isDependencyFilePath, isScannableFilePath } from './scanner-file-policy.service';
import { runDockerScanner } from './docker-scanner.service';

function sleep(ms: number)
{
    return new Promise(function (resolve)
    {
        setTimeout(resolve, ms);
    });
}

function decodeBlobContent(content: string, encoding: string): string
{
    if (encoding !== 'base64')
    {
        return content;
    }

    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
}

function estimateScanSeconds(input: { mode?: 'preview' | 'full'; repository?: Repository | null } = {})
{
    if (input.mode === 'preview') return 90;
    if (env.dockerScannerEnabled) return 420;

    return input.repository?.defaultBranch ? 240 : 180;
}

function estimatedScanMetadata(mode: 'preview' | 'full', repository?: Repository | null)
{
    const estimatedDurationSeconds = estimateScanSeconds({ mode, repository });

    return {
        estimatedDurationSeconds,
        estimatedCompletedAt: new Date(Date.now() + estimatedDurationSeconds * 1000).toISOString(),
        progressStage: 'queued'
    };
}

function mergeScanMetadata(scan: Scan, metadata: object)
{
    return {
        ...((scan.metadata as object | null) ?? {}),
        ...metadata
    } as object;
}

async function enqueueRepositoryScan(repositoryId: number, triggerType: string, scanMode?: 'preview' | 'full')
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

    const subscription = await TenantSubscription.findOne({ where: { tenantId }, transaction });

    if (!subscription || !['active', 'trialing'].includes(subscription.status))
    {
        return null;
    }

    if (subscription.status === 'trialing' && triggerType !== 'manual_user')
    {
        return null;
    }

    if (subscription.status === 'trialing')
    {
        const existingPreviewScanCount = await Scan.count(
            {
                where:
                {
                    tenantId,
                    status: { [Op.in]: ['queued', 'running', 'retry', 'completed'] }
                },
                transaction
            }
        );

        if (existingPreviewScanCount >= 1)
        {
            throw new Error('Your Security Preview includes one scan. Full scanning unlocks when the paid subscription starts.');
        }
    }

    const effectiveScanMode = scanMode ?? (subscription.status === 'trialing' ? 'preview' : 'full');

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
            branch: repository.defaultBranch,
            metadata:
            {
                mode: effectiveScanMode,
                limited: effectiveScanMode === 'preview',
                ...estimatedScanMetadata(effectiveScanMode, repository)
            } as object
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
        const subscription = await TenantSubscription.findOne({ where: { tenantId: installation.tenantId } });
        if (subscription?.status !== 'active') continue;

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

async function enqueueTenantRepositories(tenantId: number, triggerType: string)
{
    const installations = await GithubInstallation.findAll({ where: { tenantId }, attributes: ['id'] });
    const repositories = await Repository.findAll(
        {
            where:
            {
                githubInstallationId: installations.map((installation) => installation.id),
                isActive: true
            }
        }
    );
    const scans: Scan[] = [];

    for (const repository of repositories)
    {
        const scan = await enqueueRepositoryScan(repository.id, triggerType, 'full');
        if (scan) scans.push(scan);
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
            category: 'Dependencies',
            confidence: 'high',
            falsePositiveRisk: 'low',
            detection: `GitHub reported an open dependency advisory for ${dependencyName}.`,
            impact: 'Known vulnerable dependencies can expose the application to published attack techniques when the affected package path is reachable.',
            recommendedAction: patchedVersion
                ? `Update ${dependencyName} to ${patchedVersion} or later and verify the lockfile changed.`
                : `Review the advisory, update or replace ${dependencyName}, and verify the alert is closed.`,
            fixVerification: 'Run a new SecureRepos scan after updating dependencies. The finding closes when GitHub no longer reports the alert.',
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
            category: 'Secrets',
            confidence: alert.validity === 'active' || alert.publicly_leaked ? 'high' : 'medium',
            falsePositiveRisk: alert.validity === 'active' || alert.publicly_leaked ? 'low' : 'medium',
            detection: `GitHub reported an open secret scanning alert for ${secretType}.`,
            impact: 'An exposed credential can allow unauthorized access until it is rotated or revoked.',
            recommendedAction: 'Rotate or revoke the exposed credential, remove it from git history where needed, and resolve the GitHub alert.',
            fixVerification: 'Run a new scan after rotating the credential. The finding closes when the GitHub secret scanning alert is no longer open.',
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
    const treeItems = tree.tree
        .filter((item) => item.type === 'blob' && isScannableFilePath(item.path, item.size))
        .sort((left, right) => Number(isDependencyFilePath(right.path)) - Number(isDependencyFilePath(left.path)))
        .slice(0, Math.min(env.scanMaxFilesPerBranch, remainingFiles));
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

async function scanGithubRepositoryBranches(repository: Repository): Promise<{ findings: ScannerFinding[]; scanMetadata?: object }>
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
    const [dependabotAlerts, secretScanningAlerts] = await fetchNativeGithubAlerts(repository, accessToken);
    const findings: ScannerFinding[] = [];
    const dependencyInventories: Array<{
        branch: string;
        dependencies: ReturnType<typeof extractDependencies>;
    }> = [];
    const startedAt = Date.now();
    let scannedFiles = 0;
    let scannedBranches = 0;
    let stoppedEarly = false;
    let limitReason: string | null = null;
    const branchesToScan = branches.slice(0, env.scanMaxBranches);
    const skippedBranches = Math.max(0, branches.length - branchesToScan.length);

    if (skippedBranches > 0)
    {
        stoppedEarly = true;
        limitReason = `Only ${branchesToScan.length} of ${branches.length} branches were scanned due to the branch safety limit.`;
    }

    for (const branch of branchesToScan)
    {
        if (Date.now() - startedAt > env.scanMaxDurationMs)
        {
            stoppedEarly = true;
            limitReason = `Scan stopped after reaching the ${Math.ceil(env.scanMaxDurationMs / 60000)} minute safety limit.`;
            break;
        }

        const remainingFiles = env.scanMaxFiles - scannedFiles;
        if (remainingFiles <= 0)
        {
            stoppedEarly = true;
            limitReason = `Scan stopped after reaching the ${env.scanMaxFiles} file safety limit.`;
            break;
        }

        const files = await fetchScannableFilesForBranch(repository, accessToken, branch, remainingFiles);
        scannedFiles += files.length;
        dependencyInventories.push(
            {
                branch: branch.name,
                dependencies: extractDependencies(files)
            }
        );
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
        scannedBranches += 1;
    }

    findings.push(...await scanDependencyVulnerabilities(dependencyInventories));
    findings.push(...dependabotAlerts.map((alert) => mapDependabotAlert(repository, alert)));
    findings.push(...secretScanningAlerts.map((alert) => mapSecretScanningAlert(repository, alert)));

    return {
        findings: dedupeNativeDependencyAlerts(findings),
        scanMetadata:
        {
            partial: stoppedEarly,
            limitReason,
            scannedFiles,
            scannedBranches,
            skippedBranches: Math.max(skippedBranches, branches.length - scannedBranches),
            totalBranches: branches.length,
            progressStage: stoppedEarly ? 'partial_results_saved' : 'completed'
        }
    };
}

async function fetchNativeGithubAlerts(repository: Repository, accessToken: string)
{
    return Promise.all(
        [
            fetchOpenDependabotAlerts(accessToken, repository.fullName),
            fetchOpenSecretScanningAlerts(accessToken, repository.fullName)
        ]
    );
}

async function scanGithubRepositoryWithDocker(repository: Repository): Promise<{ findings: ScannerFinding[]; scannerSummary: object }>
{
    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;

    if (!githubInstallation)
    {
        throw new Error('GitHub installation not found for repository');
    }

    const accessToken = await createInstallationAccessToken(githubInstallation.githubInstallationId);
    const [dependabotAlerts, secretScanningAlerts] = await fetchNativeGithubAlerts(repository, accessToken);
    const dockerResult = await runDockerScanner(repository);

    return {
        findings: dedupeNativeDependencyAlerts(
            [
                ...dockerResult.findings,
                ...dependabotAlerts.map((alert) => mapDependabotAlert(repository, alert)),
                ...secretScanningAlerts.map((alert) => mapSecretScanningAlert(repository, alert))
            ]
        ),
        scannerSummary: dockerResult.summary
    };
}

function previewFinding(finding: ScannerFinding, index: number): ScannerFinding
{
    if (index < 2)
    {
        return {
            ...finding,
            metadata:
            {
                ...(finding.metadata ?? {}),
                preview: true,
                previewDetailUnlocked: true
            }
        };
    }

    return {
        ...finding,
        description: 'A sample issue was detected during the limited Security Preview.',
        remediation: 'Detailed evidence and remediation unlock when the paid subscription starts.',
        filePath: 'Details locked in Security Preview',
        lineNumber: null,
        fingerprint: crypto.createHash('sha256').update(`preview:${finding.fingerprint}`).digest('hex'),
        metadata:
        {
            preview: true
        }
    };
}

async function scanGithubRepositoryPreview(repository: Repository): Promise<ScannerFinding[]>
{
    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;

    if (!githubInstallation)
    {
        throw new Error('GitHub installation not found for repository');
    }

    const accessToken = await createInstallationAccessToken(githubInstallation.githubInstallationId);
    const branch = repository.defaultBranch || 'main';
    const tree = await fetchRepositoryTree(accessToken, repository.fullName, branch);
    const eligibleFiles = tree.tree
        .filter((item) => item.type === 'blob' && isScannableFilePath(item.path, item.size))
        .sort((left, right) => Number(isDependencyFilePath(right.path)) - Number(isDependencyFilePath(left.path)));
    const previewFileCount = Math.min(25, Math.max(1, Math.ceil(eligibleFiles.length * 0.1)));
    const files: RepositoryFile[] = [];

    for (const item of eligibleFiles.slice(0, previewFileCount))
    {
        const blob = await fetchRepositoryBlob(accessToken, repository.fullName, item.sha);
        files.push({ path: item.path, content: decodeBlobContent(blob.content, blob.encoding) });
    }

    return scanFiles(files)
        .sort((left, right) => ['critical', 'high', 'medium', 'low'].indexOf(left.severity) - ['critical', 'high', 'medium', 'low'].indexOf(right.severity))
        .slice(0, 5)
        .map(previewFinding);
}

function dedupeNativeDependencyAlerts(findings: ScannerFinding[])
{
    const osvIdentifiersByDependency = new Map<string, Set<string>>();

    for (const finding of findings)
    {
        if (finding.ruleId !== 'dependency.osv-vulnerability') continue;

        const metadata = finding.metadata as {
            dependencyName?: unknown;
            advisoryId?: unknown;
            osvId?: unknown;
            aliases?: unknown;
        } | undefined;
        if (typeof metadata?.dependencyName !== 'string') continue;

        const identifiers = osvIdentifiersByDependency.get(metadata.dependencyName) ?? new Set<string>();
        for (const identifier of [metadata.advisoryId, metadata.osvId, ...(Array.isArray(metadata.aliases) ? metadata.aliases : [])])
        {
            if (typeof identifier === 'string') identifiers.add(identifier);
        }
        osvIdentifiersByDependency.set(metadata.dependencyName, identifiers);
    }

    return findings.filter(function (finding)
    {
        if (finding.ruleId !== 'github.dependabot-alert') return true;

        const metadata = finding.metadata as { dependencyName?: unknown; advisoryId?: unknown } | undefined;
        if (typeof metadata?.dependencyName !== 'string' || typeof metadata.advisoryId !== 'string') return true;

        return !osvIdentifiersByDependency.get(metadata.dependencyName)?.has(metadata.advisoryId);
    });
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

async function scanRepositoryBranches(repository: Repository): Promise<{ findings: ScannerFinding[]; scannerSummary?: object; scanMetadata?: object }>
{
    if (repository.provider === 'github')
    {
        if (env.dockerScannerEnabled)
        {
            const result = await scanGithubRepositoryWithDocker(repository);
            return { findings: result.findings, scannerSummary: result.scannerSummary };
        }

        return scanGithubRepositoryBranches(repository);
    }

    throw new Error('Only GitHub repositories are supported');
}

async function scanRepositoryFull(repository: Repository): Promise<{ findings: ScannerFinding[]; scannerSummary?: object; scanMetadata?: object }>
{
    if (repository.provider === 'github' && env.dockerScannerEnabled)
    {
        return scanGithubRepositoryWithDocker(repository);
    }

    return scanRepositoryBranches(repository);
}

async function completeScanWithFindings(
    scan: Scan,
    repository: Repository,
    scannerFindings: ScannerFinding[],
    options: {
        publishGithubCheck?: boolean;
        sendSummaryEmail?: boolean;
        sendSecurityAlerts?: boolean;
        updateSecurityScore?: boolean;
        resolveMissingFindings?: boolean;
        branchScope?: string | null;
    } = {}
)
{
    const dedupedFindings = Array.from(
        new Map(scannerFindings.map((finding) => [finding.fingerprint, finding])).values()
    );
    const currentFingerprints = dedupedFindings.map((finding) => finding.fingerprint);
    const findingScope =
    {
        repositoryId: repository.id,
        ...(options.branchScope ? { branch: options.branchScope } : {})
    };
    const existingFindings = currentFingerprints.length > 0
        ? await Finding.findAll(
            {
                where:
                {
                    ...findingScope,
                    fingerprint: { [Op.in]: currentFingerprints }
                }
            }
        )
        : [];
    const existingByFingerprint = new Map(existingFindings.map((finding) => [finding.fingerprint, finding]));
    const alertFindings = dedupedFindings.filter(function (finding)
    {
        const existing = existingByFingerprint.get(finding.fingerprint);
        return !existing || existing.status !== 'open';
    });
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
                    ...findingScope,
                    fingerprint: { [Op.in]: currentFingerprints }
                }
            }
        );

        if (options.resolveMissingFindings !== false)
        {
            await Finding.update(
                {
                    status: 'resolved',
                    resolvedAt: new Date()
                },
                {
                    where:
                    {
                        ...findingScope,
                        status: 'open',
                        fingerprint: { [Op.notIn]: currentFingerprints }
                    }
                }
            );
        }
    }
    else if (options.resolveMissingFindings !== false)
    {
        await Finding.update(
            {
                status: 'resolved',
                resolvedAt: new Date()
            },
            {
                where:
                {
                    ...findingScope,
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
            .filter((finding) => !existingByFingerprint.has(finding.fingerprint))
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
            { where: { ...findingScope, fingerprint: { [Op.in]: currentFingerprints } } }
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
            completedAt: new Date(),
            metadata: mergeScanMetadata(
                scan,
                {
                    progressStage: ((scan.metadata as { partial?: unknown } | null)?.partial) ? 'partial_results_saved' : 'completed'
                }
            )
        }
    );

    if (options.updateSecurityScore !== false)
    {
        await refreshRepositorySecurityScore(repository.id);
        await repository.reload();
    }

    if (options.publishGithubCheck !== false)
    {
        await publishGithubCheckRun(repository, scan, dedupedFindings, counts);
    }

    if (options.sendSecurityAlerts !== false)
    {
        await queueSecurityAlert(scan.tenantId, repository.fullName, alertFindings)
            .catch((error) => console.warn('Security alert could not be queued:', error));
    }

    if (options.sendSummaryEmail !== false)
    {
        await queueScanSummaryEmail(scan, repository)
            .catch((error) => console.warn('Scan summary could not be queued:', error));
    }

    return { scan, findings: dedupedFindings, alertFindings, counts };
}

async function processScan(scan: Scan)
{
    if (scan.status !== 'running')
    {
        await scan.update(
            {
                status: 'running',
                startedAt: new Date(),
                errorMessage: null,
                metadata: mergeScanMetadata(
                    scan,
                    {
                        progressStage: 'running',
                        estimatedCompletedAt: new Date(Date.now() + estimateScanSeconds(
                            {
                                mode: (((scan.metadata as { mode?: unknown } | null)?.mode) === 'preview' ? 'preview' : 'full')
                            }
                        ) * 1000).toISOString()
                    }
                )
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

        const scanMetadata = scan.metadata as { mode?: unknown } | null;
        const isPreview = scanMetadata?.mode === 'preview';
        await scan.update({ metadata: mergeScanMetadata(scan, { progressStage: isPreview ? 'running_preview' : 'preparing_repository' }) });
        const scanResult = isPreview
            ? { findings: await scanGithubRepositoryPreview(repository) }
            : await scanRepositoryFull(repository);
        await scan.update({ metadata: mergeScanMetadata(scan, { progressStage: 'saving_results' }) });
        if (scanResult.scannerSummary || scanResult.scanMetadata)
        {
            await scan.update(
                {
                    metadata: mergeScanMetadata(
                        scan,
                        {
                            ...(scanResult.scannerSummary ? { scannerSummary: scanResult.scannerSummary } : {}),
                            ...(scanResult.scanMetadata ?? {})
                        }
                    )
                }
            );
        }
        await completeScanWithFindings(scan, repository, scanResult.findings,
            isPreview
                ? {
                    publishGithubCheck: false,
                    sendSummaryEmail: false,
                    sendSecurityAlerts: false,
                    updateSecurityScore: false,
                    resolveMissingFindings: false
                }
                : {});

        return scan;
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'Unknown scan error';
        const repository = await Repository.findByPk(scan.repositoryId);
        const scanMetadata = scan.metadata as { mode?: unknown } | null;

        await scan.update(
            {
                status: 'failed',
                errorMessage: message,
                completedAt: new Date()
            }
        );
        if (scanMetadata?.mode !== 'preview')
        {
            await queueScanFailedEmail(scan, repository, message);
        }

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

async function runScanWorkerLane(pollMs: number, lane: number)
{
    while (true)
    {
        try
        {
            await runScanWorkerOnce();
        }
        catch (error)
        {
            console.error(`Scan worker lane ${lane} error:`, error);
        }

        await sleep(pollMs);
    }
}

async function runScanWorkerLoop(pollMs: number)
{
    const concurrency = Math.max(1, Math.floor(env.scanWorkerConcurrency));
    await Promise.all(
        Array.from({ length: concurrency }, (_, index) => runScanWorkerLane(pollMs, index + 1))
    );
}

export {
    enqueueRepositoryScan,
    enqueueAllActiveRepositories,
    enqueueTenantRepositories,
    enqueueDueScheduledScans,
    completeScanWithFindings,
    processScan,
    runScanWorkerOnce,
    runScanWorkerLoop
};
