import crypto from 'crypto';
import { Op } from 'sequelize';

import { CiRuntimeEvent, CodeHostConnection, Finding, FindingOccurrence, Repository, Scan } from '../../db/models';
import { env } from '../../bootstrap/env';
import { queueSecurityAlert } from './notification.service';
import { entitlementsForPlan, getTenantPlan } from './plan-limit.service';
import { refreshRepositorySecurityScore } from './security-posture.service';

type RuntimeEventInput =
{
    repositoryFullName: string;
    workflowName?: string | null;
    jobName?: string | null;
    runId?: string | null;
    eventType: string;
    severity?: string;
    summary: string;
    metadata?: object | null;
    observedAt?: string | Date | null;
};

const allowedSeverities = new Set(['critical', 'high', 'medium', 'low']);

function normalizeSeverity(value: unknown)
{
    const severity = String(value || 'medium').toLowerCase();
    return allowedSeverities.has(severity) ? severity : 'medium';
}

function assertRuntimeIngestToken(rawHeader?: string)
{
    if (!env.cicdRuntimeIngestToken)
    {
        throw new Error('CI runtime ingestion is not configured.');
    }

    const token = rawHeader?.startsWith('Bearer ') ? rawHeader.slice('Bearer '.length) : '';
    if (!token || token !== env.cicdRuntimeIngestToken)
    {
        throw new Error('Invalid CI runtime ingestion token.');
    }
}

async function resolveRepositoryForRuntimeEvent(repositoryFullName: string)
{
    const repository = await Repository.findOne(
        {
            where:
            {
                fullName: repositoryFullName,
                isActive: true
            },
            include:
            [
                {
                    model: CodeHostConnection,
                    as: 'codeHostConnection',
                    required: true
                }
            ]
        }
    );
    const connection = repository?.get('codeHostConnection') as CodeHostConnection | undefined;

    if (!repository || !connection)
    {
        throw new Error('Repository is not connected to SecureRepos.');
    }

    return {
        repository,
        tenantId: connection.tenantId
    };
}

function runtimeFindingFingerprint(repositoryId: number, event: RuntimeEventInput)
{
    const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? event.metadata as Record<string, unknown>
        : {};
    const guardFingerprint = typeof metadata.guardFingerprint === 'string' ? metadata.guardFingerprint : '';

    return crypto
        .createHash('sha256')
        .update([
            'ci-runtime',
            repositoryId,
            event.eventType || 'runtime.event',
            event.runId || '',
            guardFingerprint || event.summary || ''
        ].join(':'))
        .digest('hex')
        .slice(0, 64);
}

function runtimeFindingFromEvent(repository: Repository, event: RuntimeEventInput)
{
    const severity = normalizeSeverity(event.severity) as 'critical' | 'high' | 'medium' | 'low';
    const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? event.metadata as Record<string, unknown>
        : {};
    const filePath = typeof metadata.path === 'string' && metadata.path.trim() !== ''
        ? metadata.path.slice(0, 500)
        : '.github/workflows';
    const runId = event.runId ? ` Run ${event.runId}.` : '';
    const workflow = event.workflowName ? `Workflow: ${event.workflowName}. ` : '';

    return {
        ruleId: String(event.eventType || 'ci.runtime.event').slice(0, 100),
        severity,
        title: String(event.summary || 'CI runtime event').slice(0, 255),
        description: `${workflow}SecureRepos observed risky behavior while the CI job was running.${runId}`,
        remediation: remediationForRuntimeEvent(String(event.eventType || '')),
        filePath,
        lineNumber: null,
        fingerprint: runtimeFindingFingerprint(repository.id, event),
        metadata:
        {
            ...metadata,
            source: 'ci_runtime',
            workflowName: event.workflowName ?? null,
            jobName: event.jobName ?? null,
            runId: event.runId ?? null,
            repositoryFullName: repository.fullName
        }
    };
}

function remediationForRuntimeEvent(eventType: string)
{
    if (eventType.includes('secret-output'))
    {
        return 'Rotate the exposed credential, remove it from logs, and pass secrets through protected CI secret storage only.';
    }

    if (eventType.includes('remote-script'))
    {
        return 'Pin the downloaded artifact by checksum or replace the pipe-to-shell command with a reviewed, version-pinned installer step.';
    }

    if (eventType.includes('network-host'))
    {
        return 'Review the destination host, add it to an explicit allowlist only if it is required, and block unexpected outbound calls in CI.';
    }

    if (eventType.includes('sensitive-file'))
    {
        return 'Review why the job changed sensitive CI or credential files, then move that change into a reviewed repository change if it is legitimate.';
    }

    return 'Review the CI job step that produced this signal and lock it down with least privilege, pinned dependencies, and explicit approvals.';
}

async function persistRuntimeFindings(tenantId: number, repository: Repository, events: RuntimeEventInput[])
{
    if (!env.cicdRuntimeFindingsEnabled)
    {
        return null;
    }

    const findings = events.map((event) => runtimeFindingFromEvent(repository, event));
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const finding of findings)
    {
        counts[finding.severity] += 1;
    }

    const firstMetadata = (findings[0]?.metadata ?? {}) as Record<string, unknown>;
    const scan = await Scan.create(
        {
            tenantId,
            repositoryId: repository.id,
            status: 'completed',
            triggerType: 'ci_runtime',
            branch: typeof firstMetadata.ref === 'string' ? firstMetadata.ref.slice(0, 150) : null,
            commitSha: typeof firstMetadata.sha === 'string' ? firstMetadata.sha.slice(0, 100) : null,
            findingsCritical: counts.critical,
            findingsHigh: counts.high,
            findingsMedium: counts.medium,
            findingsLow: counts.low,
            metadata:
            {
                source: 'ci_runtime',
                eventCount: findings.length,
                runId: events[0]?.runId ?? null,
                workflowName: events[0]?.workflowName ?? null
            } as object,
            startedAt: new Date(),
            completedAt: new Date()
        }
    );

    const existing = await Finding.findAll(
        {
            where:
            {
                repositoryId: repository.id,
                fingerprint: { [Op.in]: findings.map((finding) => finding.fingerprint) }
            }
        }
    );
    const existingByFingerprint = new Map(existing.map((finding) => [finding.fingerprint, finding]));
    const persistedFindings: Finding[] = [];

    for (const finding of findings)
    {
        const existingFinding = existingByFingerprint.get(finding.fingerprint);
        if (existingFinding)
        {
            await existingFinding.update(
                {
                    scanId: scan.id,
                    severity: finding.severity,
                    title: finding.title,
                    description: finding.description,
                    remediation: finding.remediation,
                    branch: scan.branch,
                    filePath: finding.filePath,
                    lineNumber: finding.lineNumber,
                    status: 'open',
                    resolvedAt: null,
                    lastSeenAt: new Date(),
                    metadata: finding.metadata
                }
            );
            persistedFindings.push(existingFinding);
            continue;
        }

        persistedFindings.push(await Finding.create(
            {
                scanId: scan.id,
                repositoryId: repository.id,
                ruleId: finding.ruleId,
                severity: finding.severity,
                title: finding.title,
                description: finding.description,
                remediation: finding.remediation,
                branch: scan.branch,
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                fingerprint: finding.fingerprint,
                status: 'open',
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                metadata: finding.metadata
            }
        ));
    }

    if (persistedFindings.length > 0)
    {
        await FindingOccurrence.bulkCreate(
            persistedFindings.map((finding) => ({
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
            }))
        );
    }

    await refreshRepositorySecurityScore(repository.id);
    await queueSecurityAlert(tenantId, repository.fullName, findings)
        .catch((error) => console.warn('CI runtime security alert could not be queued:', error instanceof Error ? error.message : error));

    return { scan, findings: persistedFindings };
}

async function createRuntimeEvents(rawEvents: RuntimeEventInput[])
{
    const events = rawEvents.slice(0, env.cicdRuntimeMaxEventsPerRequest);

    if (events.length === 0)
    {
        return [];
    }

    const repositoryFullName = String(events[0].repositoryFullName || '').trim();
    if (!repositoryFullName)
    {
        throw new Error('repositoryFullName is required.');
    }

    if (events.some((event) => String(event.repositoryFullName || '').trim() !== repositoryFullName))
    {
        throw new Error('Submit one repository per runtime event request.');
    }

    const { repository, tenantId } = await resolveRepositoryForRuntimeEvent(repositoryFullName);
    const plan = await getTenantPlan(tenantId);
    const entitlements = entitlementsForPlan(plan);

    if (!entitlements.ciRuntimeGuard)
    {
        throw new Error('CI runtime guard requires the Pro plan.');
    }

    const createdEvents = await CiRuntimeEvent.bulkCreate(
        events.map(function (event)
        {
            const observedAt = event.observedAt ? new Date(event.observedAt) : new Date();

            return {
                tenantId,
                repositoryFullName,
                workflowName: event.workflowName ? String(event.workflowName).slice(0, 255) : null,
                jobName: event.jobName ? String(event.jobName).slice(0, 255) : null,
                runId: event.runId ? String(event.runId).slice(0, 100) : null,
                eventType: String(event.eventType || 'runtime.event').slice(0, 80),
                severity: normalizeSeverity(event.severity),
                summary: String(event.summary || 'CI runtime event').slice(0, 500),
                metadata: event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata : null,
                observedAt: Number.isNaN(observedAt.getTime()) ? new Date() : observedAt
            };
        })
    );

    await persistRuntimeFindings(tenantId, repository, events);

    return createdEvents;
}

export type {
    RuntimeEventInput
};

export {
    assertRuntimeIngestToken,
    createRuntimeEvents
};
