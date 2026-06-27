import crypto from 'crypto';

import { env } from '../../bootstrap/env';
import { DependencyPackage } from './dependency-inventory.service';
import { ScannerFinding } from './scan-rules.service';

type OsvQuery =
{
    package: {
        ecosystem: string;
        name: string;
    };
    version: string;
    page_token?: string;
};

type OsvQueryResult =
{
    vulns?: Array<{ id: string }>;
    next_page_token?: string;
};

type OsvBatchResponse =
{
    results: OsvQueryResult[];
};

type OsvSeverity =
{
    type?: string;
    score?: string;
};

type OsvAffected =
{
    package?: {
        ecosystem?: string;
        name?: string;
    };
    ranges?: Array<{
        events?: Array<{
            fixed?: string;
        }>;
    }>;
    severity?: OsvSeverity[];
    database_specific?: Record<string, unknown>;
    ecosystem_specific?: Record<string, unknown>;
};

type OsvVulnerability =
{
    id: string;
    aliases?: string[];
    summary?: string;
    details?: string;
    severity?: OsvSeverity[];
    affected?: OsvAffected[];
    database_specific?: Record<string, unknown>;
    references?: Array<{
        type?: string;
        url?: string;
    }>;
};

type QueryState =
{
    dependency: DependencyPackage;
    ids: Set<string>;
    pageToken?: string;
};

const osvBatchSize = 500;
const osvDetailConcurrency = 10;

function queryKey(dependency: DependencyPackage)
{
    return `${dependency.ecosystem}\0${dependency.name}\0${dependency.version}`;
}

function sleep(ms: number)
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function osvRequest<T>(pathName: string, options: RequestInit = {}): Promise<T>
{
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1)
    {
        try
        {
            const response = await fetch(
                `${env.osvApiUrl.replace(/\/+$/, '')}${pathName}`,
                {
                    ...options,
                    headers:
                    {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': `${env.appName}/1.0 dependency-scanner`,
                        ...(options.headers ?? {})
                    },
                    signal: AbortSignal.timeout(env.osvRequestTimeoutMs)
                }
            );

            if (!response.ok)
            {
                throw new Error(`OSV API returned HTTP ${response.status}`);
            }

            return await response.json() as T;
        }
        catch (error)
        {
            lastError = error;
            if (attempt < 2) await sleep(250);
        }
    }

    throw new Error(`OSV vulnerability lookup failed: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

function toQuery(state: QueryState): OsvQuery
{
    return {
        package:
        {
            ecosystem: state.dependency.ecosystem,
            name: state.dependency.name
        },
        version: state.dependency.version,
        ...(state.pageToken ? { page_token: state.pageToken } : {})
    };
}

async function queryVulnerabilityIds(states: QueryState[])
{
    let pending = states;

    while (pending.length > 0)
    {
        const nextPage: QueryState[] = [];

        for (let index = 0; index < pending.length; index += osvBatchSize)
        {
            const batch = pending.slice(index, index + osvBatchSize);
            const response = await osvRequest<OsvBatchResponse>(
                '/v1/querybatch',
                {
                    method: 'POST',
                    body: JSON.stringify({ queries: batch.map(toQuery) })
                }
            );

            if (!Array.isArray(response.results) || response.results.length !== batch.length)
            {
                throw new Error('OSV vulnerability lookup returned an invalid batch response');
            }

            response.results.forEach(function (result, resultIndex)
            {
                const state = batch[resultIndex];
                for (const vulnerability of result.vulns ?? [])
                {
                    if (vulnerability.id) state.ids.add(vulnerability.id);
                }

                if (result.next_page_token)
                {
                    state.pageToken = result.next_page_token;
                    nextPage.push(state);
                }
                else
                {
                    state.pageToken = undefined;
                }
            });
        }

        pending = nextPage;
    }
}

async function fetchVulnerabilityDetails(ids: string[])
{
    const vulnerabilities = new Map<string, OsvVulnerability>();

    for (let index = 0; index < ids.length; index += osvDetailConcurrency)
    {
        const batch = ids.slice(index, index + osvDetailConcurrency);
        const values = await Promise.all(
            batch.map((id) => osvRequest<OsvVulnerability>(`/v1/vulns/${encodeURIComponent(id)}`))
        );

        values.forEach((value) => vulnerabilities.set(value.id, value));
    }

    return vulnerabilities;
}

function normalizedSeverity(value: unknown): ScannerFinding['severity'] | null
{
    if (typeof value !== 'string') return null;

    const severity = value.toLowerCase();
    if (severity.includes('critical')) return 'critical';
    if (severity.includes('high')) return 'high';
    if (severity.includes('moderate') || severity.includes('medium')) return 'medium';
    if (severity.includes('low')) return 'low';
    return null;
}

function roundUp(value: number)
{
    return Math.ceil(value * 10) / 10;
}

function cvssV3Score(vector: string): number | null
{
    if (!vector.startsWith('CVSS:3.')) return null;

    const metrics = new Map(
        vector.split('/').slice(1).map((metric) =>
        {
            const [name, value] = metric.split(':');
            return [name, value];
        })
    );
    const scopeChanged = metrics.get('S') === 'C';
    const values =
    {
        AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
        AC: { L: 0.77, H: 0.44 },
        UI: { N: 0.85, R: 0.62 },
        CIA: { H: 0.56, L: 0.22, N: 0 }
    } as const;
    const privilegeValues = scopeChanged
        ? { N: 0.85, L: 0.68, H: 0.5 }
        : { N: 0.85, L: 0.62, H: 0.27 };
    const av = values.AV[metrics.get('AV') as keyof typeof values.AV];
    const ac = values.AC[metrics.get('AC') as keyof typeof values.AC];
    const pr = privilegeValues[metrics.get('PR') as keyof typeof privilegeValues];
    const ui = values.UI[metrics.get('UI') as keyof typeof values.UI];
    const confidentiality = values.CIA[metrics.get('C') as keyof typeof values.CIA];
    const integrity = values.CIA[metrics.get('I') as keyof typeof values.CIA];
    const availability = values.CIA[metrics.get('A') as keyof typeof values.CIA];

    if ([av, ac, pr, ui, confidentiality, integrity, availability].some((value) => value === undefined))
    {
        return null;
    }

    const impactBase = 1 - ((1 - confidentiality) * (1 - integrity) * (1 - availability));
    const impact = scopeChanged
        ? 7.52 * (impactBase - 0.029) - 3.25 * Math.pow(impactBase - 0.02, 15)
        : 6.42 * impactBase;
    if (impact <= 0) return 0;

    const exploitability = 8.22 * av * ac * pr * ui;
    return roundUp(Math.min(scopeChanged ? 1.08 * (impact + exploitability) : impact + exploitability, 10));
}

function severityFromScore(score: number): ScannerFinding['severity']
{
    if (score >= 9) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
}

function vulnerabilitySeverity(vulnerability: OsvVulnerability): ScannerFinding['severity']
{
    const databaseSeverity = normalizedSeverity(vulnerability.database_specific?.severity);
    if (databaseSeverity) return databaseSeverity;

    for (const affected of vulnerability.affected ?? [])
    {
        const affectedSeverity = normalizedSeverity(affected.database_specific?.severity)
            ?? normalizedSeverity(affected.ecosystem_specific?.severity);
        if (affectedSeverity) return affectedSeverity;
    }

    const severityValues = [
        ...(vulnerability.severity ?? []),
        ...(vulnerability.affected ?? []).flatMap((affected) => affected.severity ?? [])
    ];
    const scores = severityValues
        .map((severity) => cvssV3Score(severity.score ?? ''))
        .filter((score): score is number => score !== null);

    return scores.length > 0 ? severityFromScore(Math.max(...scores)) : 'medium';
}

function canonicalAdvisoryId(vulnerability: OsvVulnerability)
{
    const ids = [vulnerability.id, ...(vulnerability.aliases ?? [])];
    return ids.find((id) => id.startsWith('CVE-'))
        ?? ids.find((id) => id.startsWith('GHSA-'))
        ?? vulnerability.id;
}

function fixedVersion(vulnerability: OsvVulnerability, dependency: DependencyPackage)
{
    const versions: string[] = [];

    for (const affected of vulnerability.affected ?? [])
    {
        if (affected.package?.ecosystem !== dependency.ecosystem || affected.package?.name !== dependency.name) continue;

        for (const range of affected.ranges ?? [])
        {
            for (const event of range.events ?? [])
            {
                if (event.fixed) versions.push(event.fixed);
            }
        }
    }

    return versions[0] ?? null;
}

function advisoryUrl(vulnerability: OsvVulnerability)
{
    return vulnerability.references?.find((reference) =>
        reference.type === 'ADVISORY' && typeof reference.url === 'string'
    )?.url
        ?? vulnerability.references?.find((reference) => typeof reference.url === 'string')?.url
        ?? `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`;
}

function findingFingerprint(branch: string, dependency: DependencyPackage, advisoryId: string)
{
    return crypto
        .createHash('sha256')
        .update(`osv:${branch}:${dependency.ecosystem}:${dependency.name}:${dependency.version}:${advisoryId}`)
        .digest('hex');
}

function mapFinding(
    dependency: DependencyPackage,
    branch: string,
    vulnerability: OsvVulnerability
): ScannerFinding
{
    const advisoryId = canonicalAdvisoryId(vulnerability);
    const patchedVersion = fixedVersion(vulnerability, dependency);

    return {
        ruleId: 'dependency.osv-vulnerability',
        severity: vulnerabilitySeverity(vulnerability),
        title: `${advisoryId}: vulnerable ${dependency.name}`,
        description: vulnerability.summary
            ?? vulnerability.details?.split(/\r?\n/)[0]
            ?? `${dependency.name} ${dependency.version} is affected by ${advisoryId}.`,
        remediation: patchedVersion
            ? `Upgrade ${dependency.name} from ${dependency.version} to ${patchedVersion} or later, then regenerate the lockfile and run tests.`
            : `Review ${advisoryId}, upgrade or replace ${dependency.name} ${dependency.version}, regenerate the lockfile, and run tests.`,
        filePath: dependency.filePath,
        lineNumber: null,
        fingerprint: findingFingerprint(branch, dependency, advisoryId),
        metadata:
        {
            source: 'osv',
            branch,
            advisoryId,
            osvId: vulnerability.id,
            aliases: vulnerability.aliases ?? [],
            ecosystem: dependency.ecosystem,
            dependencyName: dependency.name,
            detectedVersion: dependency.version,
            patchedVersion,
            htmlUrl: advisoryUrl(vulnerability)
        }
    };
}

async function scanDependencyVulnerabilities(
    inventories: Array<{ branch: string; dependencies: DependencyPackage[] }>
): Promise<ScannerFinding[]>
{
    const uniqueDependencies = new Map<string, DependencyPackage>();

    for (const inventory of inventories)
    {
        for (const dependency of inventory.dependencies)
        {
            uniqueDependencies.set(queryKey(dependency), dependency);
        }
    }

    if (uniqueDependencies.size === 0)
    {
        return [];
    }

    if (uniqueDependencies.size > env.scanMaxDependencies)
    {
        throw new Error(`Repository has ${uniqueDependencies.size} unique dependencies; the safe scan limit is ${env.scanMaxDependencies}.`);
    }

    const states = Array.from(uniqueDependencies.values()).map((dependency): QueryState =>
        ({ dependency, ids: new Set<string>() })
    );
    await queryVulnerabilityIds(states);

    const vulnerabilityIds = Array.from(new Set(states.flatMap((state) => Array.from(state.ids))));
    const vulnerabilities = await fetchVulnerabilityDetails(vulnerabilityIds);
    const idsByQuery = new Map(states.map((state) => [queryKey(state.dependency), state.ids]));
    const findings: ScannerFinding[] = [];

    for (const inventory of inventories)
    {
        for (const dependency of inventory.dependencies)
        {
            const seenAdvisories = new Set<string>();

            for (const vulnerabilityId of idsByQuery.get(queryKey(dependency)) ?? [])
            {
                const vulnerability = vulnerabilities.get(vulnerabilityId);
                if (!vulnerability) continue;

                const advisoryId = canonicalAdvisoryId(vulnerability);
                if (seenAdvisories.has(advisoryId)) continue;
                seenAdvisories.add(advisoryId);
                findings.push(mapFinding(dependency, inventory.branch, vulnerability));
            }
        }
    }

    return findings;
}

export
{
    scanDependencyVulnerabilities
};
