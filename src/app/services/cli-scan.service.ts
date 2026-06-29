import crypto from 'crypto';

import { CodeHostConnection, Repository, Scan } from '../../db/models';
import { DependencyPackage } from './dependency-inventory.service';
import { scanDependencyVulnerabilities } from './osv.service';
import { assertManualScanAllowed } from './plan-limit.service';
import { completeScanWithFindings } from './scan.service';
import { ScannerFinding } from './scan-rules.service';

const maxCliFindings = 500;
const maxCliDependencies = 3000;
const allowedEcosystems = new Set(
    ['npm', 'Packagist', 'PyPI', 'RubyGems', 'Go', 'crates.io', 'Maven', 'NuGet', 'Pub', 'SwiftURL', 'Hex', 'CRAN', 'Julia', 'Hackage']
);

type CliScanInput =
{
    repositoryId: number;
    branch: string;
    commitSha?: string | null;
    clientVersion?: string | null;
    filesScanned?: number;
    filesSkipped?: number;
    durationMs?: number;
    findings: unknown[];
    dependencies: unknown[];
};

function boundedString(value: unknown, field: string, min: number, max: number)
{
    if (typeof value !== 'string')
    {
        throw new Error(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max || /[\u0000-\u001f]/.test(normalized))
    {
        throw new Error(`${field} is invalid`);
    }

    return normalized;
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number)
{
    const number = Number(value ?? 0);

    if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    {
        throw new Error(`${field} is invalid`);
    }

    return number;
}

function assertRepositoryRelativePath(filePath: string, field: string)
{
    const segments = filePath.split('/');

    if (
        filePath.startsWith('/')
        || filePath.startsWith('//')
        || /^[A-Za-z]:\//.test(filePath)
        || segments.includes('..')
    )
    {
        throw new Error(`${field} must be repository-relative`);
    }
}

function normalizeCliFinding(value: unknown, branch: string): ScannerFinding
{
    if (!value || typeof value !== 'object' || Array.isArray(value))
    {
        throw new Error('CLI finding is invalid');
    }

    const input = value as Record<string, unknown>;
    const ruleId = boundedString(input.ruleId, 'finding ruleId', 3, 100);
    const severity = boundedString(input.severity, 'finding severity', 3, 8);
    const title = boundedString(input.title, 'finding title', 3, 255);
    const description = boundedString(input.description, 'finding description', 3, 2000);
    const remediation = boundedString(input.remediation, 'finding remediation', 3, 4000);
    const filePath = boundedString(input.filePath, 'finding filePath', 1, 500).replace(/\\/g, '/');
    const lineNumber = input.lineNumber === null || input.lineNumber === undefined
        ? null
        : boundedInteger(input.lineNumber, 'finding lineNumber', 1, 10_000_000);
    const clientFingerprint = boundedString(input.fingerprint, 'finding fingerprint', 32, 128);

    if (!/^[a-z0-9][a-z0-9._-]+$/i.test(ruleId))
    {
        throw new Error('finding ruleId is invalid');
    }

    if (!['critical', 'high', 'medium', 'low'].includes(severity))
    {
        throw new Error('finding severity is invalid');
    }

    assertRepositoryRelativePath(filePath, 'finding filePath');

    const fingerprint = crypto
        .createHash('sha256')
        .update(`cli:v1:${branch}:${ruleId}:${filePath}:${lineNumber ?? 0}:${clientFingerprint}`)
        .digest('hex');

    return {
        ruleId,
        severity: severity as ScannerFinding['severity'],
        title,
        description,
        remediation,
        filePath,
        lineNumber,
        fingerprint,
        metadata: { branch, source: 'cli' }
    };
}

function normalizeCliDependency(value: unknown): DependencyPackage
{
    if (!value || typeof value !== 'object' || Array.isArray(value))
    {
        throw new Error('CLI dependency is invalid');
    }

    const input = value as Record<string, unknown>;
    const ecosystem = boundedString(input.ecosystem, 'dependency ecosystem', 1, 30);

    if (!allowedEcosystems.has(ecosystem))
    {
        throw new Error(`Unsupported dependency ecosystem: ${ecosystem}`);
    }

    const filePath = boundedString(input.filePath, 'dependency filePath', 1, 500).replace(/\\/g, '/');
    assertRepositoryRelativePath(filePath, 'dependency filePath');

    return {
        ecosystem,
        name: boundedString(input.name, 'dependency name', 1, 255),
        version: boundedString(input.version, 'dependency version', 1, 100),
        filePath
    };
}

function normalizeCliScanInput(value: Record<string, unknown>): CliScanInput
{
    const repositoryId = boundedInteger(value.repositoryId, 'repositoryId', 1, Number.MAX_SAFE_INTEGER);
    const branch = boundedString(value.branch, 'branch', 1, 150);
    const commitSha = value.commitSha ? boundedString(value.commitSha, 'commitSha', 7, 64) : null;
    const clientVersion = value.clientVersion ? boundedString(value.clientVersion, 'clientVersion', 1, 30) : null;
    const findings = Array.isArray(value.findings) ? value.findings : [];
    const dependencies = Array.isArray(value.dependencies) ? value.dependencies : [];

    if (commitSha && !/^[a-f0-9]{7,64}$/i.test(commitSha))
    {
        throw new Error('commitSha is invalid');
    }

    if (findings.length > maxCliFindings)
    {
        throw new Error(`CLI scan exceeds the ${maxCliFindings} finding limit`);
    }

    if (dependencies.length > maxCliDependencies)
    {
        throw new Error(`CLI scan exceeds the ${maxCliDependencies} dependency limit`);
    }

    return {
        repositoryId,
        branch,
        commitSha,
        clientVersion,
        filesScanned: boundedInteger(value.filesScanned, 'filesScanned', 0, 100_000),
        filesSkipped: boundedInteger(value.filesSkipped, 'filesSkipped', 0, 100_000),
        durationMs: boundedInteger(value.durationMs, 'durationMs', 0, 60 * 60 * 1000),
        findings,
        dependencies
    };
}

async function getApprovedCliRepository(tenantId: number, repositoryId: number)
{
    const connections = await CodeHostConnection.findAll(
        {
            where: { tenantId, provider: 'github', isActive: true },
            attributes: ['id']
        }
    );

    return Repository.findOne(
        {
            where:
            {
                id: repositoryId,
                codeHostConnectionId: connections.map((connection) => connection.id),
                provider: 'github',
                isActive: true
            }
        }
    );
}

async function submitCliScan(tenantId: number, rawInput: Record<string, unknown>)
{
    const input = normalizeCliScanInput(rawInput);
    const repository = await getApprovedCliRepository(tenantId, input.repositoryId);

    if (!repository)
    {
        throw new Error('Repository is not approved for this workspace');
    }

    await assertManualScanAllowed(tenantId, repository.id);

    const scan = await Scan.create(
        {
            tenantId,
            repositoryId: repository.id,
            status: 'running',
            triggerType: 'cli',
            branch: input.branch,
            commitSha: input.commitSha ?? null,
            startedAt: new Date(),
            metadata:
            {
                source: 'cli',
                clientVersion: input.clientVersion,
                filesScanned: input.filesScanned,
                filesSkipped: input.filesSkipped,
                durationMs: input.durationMs
            } as object
        }
    );

    try
    {
        const localFindings = input.findings.map((finding) => normalizeCliFinding(finding, input.branch));
        const dependencies = input.dependencies.map(normalizeCliDependency);
        const dependencyFindings = await scanDependencyVulnerabilities(
            [{ branch: input.branch, dependencies }]
        );
        const result = await completeScanWithFindings(
            scan,
            repository,
            [...localFindings, ...dependencyFindings],
            {
                publishGithubCheck: false,
                sendSummaryEmail: false,
                branchScope: input.branch
            }
        );

        return {
            ...result,
            repository
        };
    }
    catch (error)
    {
        await scan.update(
            {
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'CLI scan failed',
                completedAt: new Date()
            }
        );
        throw error;
    }
}

export {
    maxCliDependencies,
    maxCliFindings,
    normalizeCliDependency,
    normalizeCliFinding,
    normalizeCliScanInput,
    submitCliScan
};
