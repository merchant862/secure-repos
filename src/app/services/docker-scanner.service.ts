import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { env } from '../../bootstrap/env';
import { GithubInstallation, Repository } from '../../db/models';
import { createInstallationAccessToken } from '../../modules/github/github.service';
import { ScannerFinding } from './scan-rules.service';

const execFileAsync = promisify(execFile);

type DockerScannerResult =
{
    findings: ScannerFinding[];
    summary: {
        enabled: boolean;
        image: string;
        outputFiles: string[];
        scanners: Record<string, { status: string; exitCode?: number }>;
        sbomPackageCount?: number;
    };
};

type JsonObject = Record<string, unknown>;

const severityOrder: ScannerFinding['severity'][] = ['critical', 'high', 'medium', 'low'];

function asObject(value: unknown): JsonObject | null
{
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function asArray(value: unknown): unknown[]
{
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string
{
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function asNumber(value: unknown): number | null
{
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSeverity(value: unknown): ScannerFinding['severity']
{
    if (typeof value === 'number')
    {
        if (value >= 9) return 'critical';
        if (value >= 7) return 'high';
        if (value >= 4) return 'medium';
        return 'low';
    }

    const severity = String(value ?? '').toLowerCase();
    if (severity.includes('critical') || severity === 'error') return 'critical';
    if (severity.includes('high')) return 'high';
    if (severity.includes('medium') || severity.includes('moderate') || severity === 'warning') return 'medium';
    return 'low';
}

function fingerprint(scanner: string, ruleId: string, filePath: string, lineNumber: number | null, title: string)
{
    return crypto
        .createHash('sha256')
        .update(`docker:${scanner}:${ruleId}:${filePath}:${lineNumber ?? 0}:${title}`)
        .digest('hex');
}

function publicCategory(scanner: string, ruleId: string)
{
    if (scanner === 'gitleaks' || scanner === 'trufflehog' || ruleId.includes('secret')) return 'Secrets';
    if (scanner === 'osv-scanner' || scanner === 'grype' || ruleId.includes('vulnerability')) return 'Dependencies';
    if (scanner === 'checkov' || ruleId.includes('misconfig')) return 'Infrastructure configuration';
    if (scanner === 'trivy' && ruleId.includes('secret')) return 'Secrets';
    if (scanner === 'trivy') return 'Container and dependency risk';
    if (scanner === 'semgrep') return 'Code risk pattern';

    return 'Security review';
}

function scannerConfidence(scanner: string, severity: ScannerFinding['severity'])
{
    if (scanner === 'gitleaks' || scanner === 'trufflehog' || scanner === 'osv-scanner' || scanner === 'grype')
    {
        return 'high';
    }

    if (severity === 'critical' || severity === 'high')
    {
        return 'medium';
    }

    return 'low';
}

function scannerFinding(input: {
    scanner: string;
    ruleId: string;
    severity: unknown;
    title: string;
    description?: string;
    remediation?: string;
    filePath?: string;
    lineNumber?: number | null;
    metadata?: object;
}): ScannerFinding
{
    const filePath = input.filePath && input.filePath.trim() !== '' ? input.filePath : 'repository';
    const lineNumber = input.lineNumber ?? null;
    const severity = normalizeSeverity(input.severity);
    const confidence = scannerConfidence(input.scanner, severity);
    const description = input.description || input.title;
    const remediation = input.remediation || 'Review the scanner finding, update the affected code or dependency, then run a new SecureRepos scan.';

    return {
        ruleId: input.ruleId.slice(0, 100),
        severity,
        title: input.title.slice(0, 255),
        description,
        remediation,
        filePath: filePath.replace(/^\/workspace\/repo\/?/, '') || 'repository',
        lineNumber,
        fingerprint: fingerprint(input.scanner, input.ruleId, filePath, lineNumber, input.title),
        metadata:
        {
            scanner: input.scanner,
            category: publicCategory(input.scanner, input.ruleId),
            confidence,
            falsePositiveRisk: confidence === 'high' ? 'low' : confidence === 'medium' ? 'medium' : 'high',
            detection: description,
            impact: severity === 'critical' || severity === 'high'
                ? 'This finding can expose sensitive data, vulnerable packages, or risky configuration if shipped without review.'
                : 'This finding should be reviewed to decide whether it is intentional for this repository.',
            recommendedAction: remediation,
            fixVerification: 'Apply the fix, run a new scan, and verify the finding no longer appears.',
            ...(input.metadata ?? {})
        }
    };
}

async function readJson(filePath: string): Promise<unknown | null>
{
    try
    {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch
    {
        return null;
    }
}

async function readNdjson(filePath: string): Promise<JsonObject[]>
{
    try
    {
        const raw = await fs.readFile(filePath, 'utf8');
        return raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => asObject(JSON.parse(line)))
            .filter((value): value is JsonObject => Boolean(value));
    }
    catch
    {
        return [];
    }
}

function parseSemgrep(json: unknown): ScannerFinding[]
{
    const root = asObject(json);
    return asArray(root?.results).map(function (item)
    {
        const result = asObject(item) ?? {};
        const extra = asObject(result.extra) ?? {};
        const start = asObject(result.start) ?? {};
        const ruleId = asString(result.check_id, 'semgrep.rule');
        const title = asString(extra.message, ruleId);

        return scannerFinding(
            {
                scanner: 'semgrep',
                ruleId: `semgrep.${ruleId}`,
                severity: extra.severity,
                title,
                description: title,
                filePath: asString(result.path, 'repository'),
                lineNumber: asNumber(start.line),
                metadata: { checkId: ruleId }
            }
        );
    });
}

function parseGitleaks(json: unknown): ScannerFinding[]
{
    return asArray(json).map(function (item)
    {
        const leak = asObject(item) ?? {};
        const ruleId = asString(leak.RuleID, 'gitleaks.secret');
        const title = asString(leak.Description, `Secret detected by ${ruleId}`);

        return scannerFinding(
            {
                scanner: 'gitleaks',
                ruleId: `gitleaks.${ruleId}`,
                severity: 'critical',
                title,
                description: 'Gitleaks detected a potential secret in the repository.',
                remediation: 'Rotate or revoke the exposed secret, remove it from git history where needed, and store the replacement outside the repository.',
                filePath: asString(leak.File, 'repository'),
                lineNumber: asNumber(leak.StartLine),
                metadata: { ruleId, fingerprint: leak.Fingerprint }
            }
        );
    });
}

function parseTrufflehog(rows: JsonObject[]): ScannerFinding[]
{
    return rows.map(function (row)
    {
        const sourceMetadata = asObject(row.SourceMetadata);
        const data = asObject(sourceMetadata?.Data);
        const filesystem = asObject(data?.Filesystem);
        const detectorName = asString(row.DetectorName, 'secret');
        const verified = row.Verified === true;

        return scannerFinding(
            {
                scanner: 'trufflehog',
                ruleId: `trufflehog.${detectorName}`,
                severity: verified ? 'critical' : 'high',
                title: `${verified ? 'Verified' : 'Possible'} secret detected: ${detectorName}`,
                description: 'TruffleHog detected secret-like material in the repository.',
                remediation: 'Rotate or revoke the affected credential and remove it from git history if it was committed.',
                filePath: asString(filesystem?.file, 'repository'),
                lineNumber: asNumber(filesystem?.line),
                metadata: { detectorName, verified }
            }
        );
    });
}

function parseOsv(json: unknown): ScannerFinding[]
{
    const root = asObject(json);
    const findings: ScannerFinding[] = [];

    for (const result of asArray(root?.results))
    {
        const resultObject = asObject(result) ?? {};
        for (const pkg of asArray(resultObject.packages))
        {
            const packageObject = asObject(pkg) ?? {};
            const packageInfo = asObject(packageObject.package) ?? {};
            const packageName = asString(packageInfo.name, 'dependency');
            const version = asString(packageInfo.version, '');
            const ecosystem = asString(packageInfo.ecosystem, 'package');

            for (const vulnerability of asArray(packageObject.vulnerabilities))
            {
                const vuln = asObject(vulnerability) ?? {};
                const id = asString(vuln.id, 'OSV');
                const title = `${id}: vulnerable ${packageName}${version ? ` ${version}` : ''}`;

                findings.push(scannerFinding(
                    {
                        scanner: 'osv-scanner',
                        ruleId: `dependency.${id}`,
                        severity: vuln.severity,
                        title,
                        description: asString(vuln.summary, title),
                        remediation: 'Upgrade the affected dependency to a non-vulnerable version and verify the lockfile is updated.',
                        filePath: asString(resultObject.source, asString(resultObject.path, 'dependency manifest')),
                        metadata: { advisoryId: id, packageName, version, ecosystem }
                    }
                ));
            }
        }
    }

    return findings;
}

function parseTrivy(json: unknown): ScannerFinding[]
{
    const root = asObject(json);
    const findings: ScannerFinding[] = [];

    for (const result of asArray(root?.Results))
    {
        const target = asObject(result) ?? {};
        const filePath = asString(target.Target, 'repository');

        for (const vulnerability of asArray(target.Vulnerabilities))
        {
            const vuln = asObject(vulnerability) ?? {};
            const id = asString(vuln.VulnerabilityID, 'trivy.vulnerability');
            const packageName = asString(vuln.PkgName, 'dependency');
            findings.push(scannerFinding(
                {
                    scanner: 'trivy',
                    ruleId: `trivy.${id}`,
                    severity: vuln.Severity,
                    title: `${id}: vulnerable ${packageName}`,
                    description: asString(vuln.Title, asString(vuln.Description, `${packageName} is affected by ${id}.`)),
                    remediation: asString(vuln.FixedVersion, '') ? `Upgrade ${packageName} to ${vuln.FixedVersion}.` : 'Upgrade or replace the affected dependency.',
                    filePath,
                    metadata: { vulnerabilityId: id, packageName, installedVersion: vuln.InstalledVersion, fixedVersion: vuln.FixedVersion }
                }
            ));
        }

        for (const secret of asArray(target.Secrets))
        {
            const item = asObject(secret) ?? {};
            const ruleId = asString(item.RuleID, 'trivy.secret');
            findings.push(scannerFinding(
                {
                    scanner: 'trivy',
                    ruleId: `trivy.${ruleId}`,
                    severity: item.Severity,
                    title: asString(item.Title, `Secret detected by ${ruleId}`),
                    description: 'Trivy detected a potential secret in the repository.',
                    remediation: 'Rotate or revoke the secret and move it to protected runtime configuration.',
                    filePath,
                    lineNumber: asNumber(item.StartLine),
                    metadata: { ruleId }
                }
            ));
        }

        for (const misconfig of asArray(target.Misconfigurations))
        {
            const item = asObject(misconfig) ?? {};
            const id = asString(item.ID, 'trivy.misconfig');
            findings.push(scannerFinding(
                {
                    scanner: 'trivy',
                    ruleId: `trivy.${id}`,
                    severity: item.Severity,
                    title: asString(item.Title, id),
                    description: asString(item.Description, asString(item.Message, id)),
                    remediation: asString(item.Resolution, 'Review and fix the misconfiguration.'),
                    filePath,
                    metadata: { checkId: id }
                }
            ));
        }
    }

    return findings;
}

function parseCheckov(json: unknown): ScannerFinding[]
{
    const root = asObject(json);
    const checks = asArray(root?.failed_checks).length > 0
        ? asArray(root?.failed_checks)
        : asArray(asObject(root?.results)?.failed_checks);

    return checks.map(function (item)
    {
        const check = asObject(item) ?? {};
        const id = asString(check.check_id, 'checkov.misconfig');
        const fileLineRange = asArray(check.file_line_range);

        return scannerFinding(
            {
                scanner: 'checkov',
                ruleId: `checkov.${id}`,
                severity: check.severity,
                title: asString(check.check_name, id),
                description: asString(check.check_name, id),
                remediation: asString(check.guideline, 'Review the IaC misconfiguration and apply the recommended secure setting.'),
                filePath: asString(check.file_path, 'iac file').replace(/^\//, ''),
                lineNumber: asNumber(fileLineRange[0]),
                metadata: { checkId: id, resource: check.resource }
            }
        );
    });
}

function parseGrype(json: unknown): ScannerFinding[]
{
    const root = asObject(json);
    return asArray(root?.matches).map(function (item)
    {
        const match = asObject(item) ?? {};
        const vulnerability = asObject(match.vulnerability) ?? {};
        const artifact = asObject(match.artifact) ?? {};
        const locations = asArray(artifact.locations);
        const firstLocation = asObject(locations[0]) ?? {};
        const id = asString(vulnerability.id, 'grype.vulnerability');
        const packageName = asString(artifact.name, 'dependency');

        return scannerFinding(
            {
                scanner: 'grype',
                ruleId: `grype.${id}`,
                severity: vulnerability.severity,
                title: `${id}: vulnerable ${packageName}`,
                description: asString(vulnerability.description, `${packageName} is affected by ${id}.`),
                remediation: asString(asObject(match.fix)?.versions, '') || 'Upgrade the affected package when a fixed version is available.',
                filePath: asString(firstLocation.path, 'SBOM package'),
                metadata: { vulnerabilityId: id, packageName, version: artifact.version }
            }
        );
    });
}

function countSyftPackages(json: unknown): number
{
    return asArray(asObject(json)?.artifacts).length;
}

async function cloneRepository(repository: Repository, destination: string)
{
    const githubInstallation = repository.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;

    if (!githubInstallation)
    {
        throw new Error('GitHub installation not found for repository');
    }

    const token = await createInstallationAccessToken(githubInstallation.githubInstallationId);
    const askPassPath = path.join(path.dirname(destination), 'git-askpass.sh');
    await fs.writeFile(
        askPassPath,
        '#!/bin/sh\ncase "$1" in\n*Username*) echo "x-access-token" ;;\n*) printf "%s\\n" "$GITHUB_TOKEN" ;;\nesac\n',
        { mode: 0o700 }
    );

    const cloneArgs = [
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        repository.defaultBranch || 'main',
        `https://github.com/${repository.fullName}.git`,
        destination
    ];

    try
    {
        await execFileAsync('git', cloneArgs,
            {
                env:
                {
                    ...process.env,
                    GIT_ASKPASS: askPassPath,
                    GIT_TERMINAL_PROMPT: '0',
                    GITHUB_TOKEN: token
                },
                timeout: env.dockerScannerTimeoutMs,
                maxBuffer: 1024 * 1024
            }
        );
    }
    catch
    {
        await execFileAsync(
            'git',
            ['clone', '--depth', '1', `https://github.com/${repository.fullName}.git`, destination],
            {
                env:
                {
                    ...process.env,
                    GIT_ASKPASS: askPassPath,
                    GIT_TERMINAL_PROMPT: '0',
                    GITHUB_TOKEN: token
                },
                timeout: env.dockerScannerTimeoutMs,
                maxBuffer: 1024 * 1024
            }
        );
    }
}

async function runDockerScanner(repository: Repository): Promise<DockerScannerResult>
{
    await fs.mkdir(env.dockerScannerTmpDir, { recursive: true });

    const workspace = await fs.mkdtemp(path.join(env.dockerScannerTmpDir, `scan-${repository.id}-${Date.now()}-`));
    const repoDir = path.join(workspace, 'repo');
    const outDir = path.join(workspace, 'out');

    try
    {
        await fs.mkdir(outDir, { recursive: true });
        await cloneRepository(repository, repoDir);

        const timeoutSeconds = Math.max(60, Math.ceil(env.dockerScannerTimeoutMs / 1000));
        await execFileAsync(
            'docker',
            [
                'run',
                '--rm',
                '--label',
                'com.securerepos.role=scanner',
                '--label',
                `com.securerepos.repository=${repository.id}`,
                '--network',
                'bridge',
                '--memory',
                env.dockerScannerMemory,
                '--cpus',
                env.dockerScannerCpus,
                '--security-opt',
                'no-new-privileges',
                '-e',
                `SCANNER_TIMEOUT_SECONDS=${timeoutSeconds}`,
                '-v',
                `${repoDir}:/workspace/repo:ro`,
                '-v',
                `${outDir}:/workspace/out`,
                env.dockerScannerImage
            ],
            {
                timeout: env.dockerScannerTimeoutMs + 30000,
                maxBuffer: 2 * 1024 * 1024
            }
        );

        const outputFiles = await fs.readdir(outDir);
        const [
            semgrep,
            gitleaks,
            osv,
            trivy,
            checkov,
            grype,
            syft,
            trufflehogRows
        ] = await Promise.all(
            [
                readJson(path.join(outDir, 'semgrep.json')),
                readJson(path.join(outDir, 'gitleaks.json')),
                readJson(path.join(outDir, 'osv.json')),
                readJson(path.join(outDir, 'trivy.json')),
                readJson(path.join(outDir, 'checkov.json')),
                readJson(path.join(outDir, 'grype.json')),
                readJson(path.join(outDir, 'syft.json')),
                readNdjson(path.join(outDir, 'trufflehog.json'))
            ]
        );

        const scanners: DockerScannerResult['summary']['scanners'] = {};
        for (const fileName of outputFiles.filter((fileName) => fileName.endsWith('.status.json')))
        {
            const status = asObject(await readJson(path.join(outDir, fileName)));
            if (!status) continue;
            scanners[asString(status.scanner, fileName.replace('.status.json', ''))] =
            {
                status: asString(status.status, 'unknown'),
                ...(typeof status.exitCode === 'number' ? { exitCode: status.exitCode } : {})
            };
        }

        const findings = [
            ...parseSemgrep(semgrep),
            ...parseGitleaks(gitleaks),
            ...parseTrufflehog(trufflehogRows),
            ...parseOsv(osv),
            ...parseTrivy(trivy),
            ...parseCheckov(checkov),
            ...parseGrype(grype)
        ].sort((left, right) => severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity));

        return {
            findings,
            summary:
            {
                enabled: true,
                image: env.dockerScannerImage,
                outputFiles,
                scanners,
                sbomPackageCount: countSyftPackages(syft)
            }
        };
    }
    finally
    {
        await fs.rm(workspace, { recursive: true, force: true });
    }
}

export {
    runDockerScanner
};
