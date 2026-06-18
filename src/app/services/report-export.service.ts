import { Finding, FindingOccurrence, Repository, Scan } from '../../db/models';
import { Op } from 'sequelize';
import { buildXlsxWorkbook } from './xlsx-export.service';

async function buildTenantJsonReport(repositoryIds: number[])
{
    const repositories = await Repository.findAll(
        {
            where:
            {
                id: repositoryIds
            }
        }
    );
    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId: repositoryIds,
                status: 'open'
            }
        }
    );

    return {
        generatedAt: new Date().toISOString(),
        repositories: repositories.map(function (repository)
        {
            return {
                id: repository.id,
                provider: repository.provider,
                fullName: repository.fullName,
                securityScore: repository.securityScore,
                isPrivate: repository.isPrivate
            };
        }),
        findings: findings.map(function (finding)
        {
            return {
                id: finding.id,
                repositoryId: finding.repositoryId,
                severity: finding.severity,
                title: finding.title,
                remediation: finding.remediation,
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                status: finding.status
            };
        })
    };
}

function scanTotal(scan: Scan)
{
    return Number(scan.findingsCritical || 0) + Number(scan.findingsHigh || 0) + Number(scan.findingsMedium || 0) + Number(scan.findingsLow || 0);
}

async function buildScanJsonReport(scan: Scan)
{
    const [repository, occurrences] = await Promise.all(
        [
            Repository.findByPk(scan.repositoryId),
            FindingOccurrence.findAll({ where: { scanId: scan.id }, order: [['branch', 'ASC'], ['severity', 'ASC'], ['createdAt', 'DESC']] })
        ]
    );
    const canonicalFindings = occurrences.length > 0
        ? await Finding.findAll({ where: { id: { [Op.in]: occurrences.map((item) => item.findingId) } } })
        : await Finding.findAll({ where: { scanId: scan.id }, order: [['branch', 'ASC'], ['severity', 'ASC'], ['createdAt', 'DESC']] });
    const canonicalById = new Map(canonicalFindings.map((finding) => [Number(finding.id), finding]));
    const findings = occurrences.length > 0
        ? occurrences.map(function (occurrence)
        {
            const canonical = canonicalById.get(Number(occurrence.findingId));
            return {
                id: occurrence.findingId,
                branch: occurrence.branch,
                ruleId: occurrence.ruleId,
                severity: occurrence.severity,
                title: occurrence.title,
                description: occurrence.description,
                remediation: occurrence.remediation,
                filePath: occurrence.filePath,
                lineNumber: occurrence.lineNumber,
                status: canonical?.status ?? 'open',
                firstSeenAt: canonical?.firstSeenAt ?? occurrence.createdAt,
                lastSeenAt: canonical?.lastSeenAt ?? occurrence.createdAt,
                resolvedAt: canonical?.resolvedAt ?? null
            };
        })
        : canonicalFindings.map(function (finding)
        {
            return {
                id: finding.id,
                branch: finding.branch,
                ruleId: finding.ruleId,
                severity: finding.severity,
                title: finding.title,
                description: finding.description,
                remediation: finding.remediation,
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                status: finding.status,
                firstSeenAt: finding.firstSeenAt,
                lastSeenAt: finding.lastSeenAt,
                resolvedAt: finding.resolvedAt
            };
        });

    return {
        generatedAt: new Date().toISOString(),
        scan:
        {
            id: scan.id,
            status: scan.status,
            triggerType: scan.triggerType,
            branch: scan.branch,
            commitSha: scan.commitSha,
            findingsCritical: scan.findingsCritical,
            findingsHigh: scan.findingsHigh,
            findingsMedium: scan.findingsMedium,
            findingsLow: scan.findingsLow,
            findingsTotal: scanTotal(scan),
            errorMessage: scan.errorMessage,
            startedAt: scan.startedAt,
            completedAt: scan.completedAt,
            createdAt: scan.createdAt
        },
        repository: repository
            ? {
                id: repository.id,
                provider: repository.provider,
                fullName: repository.fullName,
                defaultBranch: repository.defaultBranch,
                securityScore: repository.securityScore,
                isPrivate: repository.isPrivate
            }
            : null,
        branchSummary: buildBranchSummary(findings),
        findings: findings.map(function (finding)
        {
            return {
                id: finding.id,
                branch: finding.branch,
                ruleId: finding.ruleId,
                severity: finding.severity,
                title: finding.title,
                description: finding.description,
                remediation: finding.remediation,
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                status: finding.status,
                firstSeenAt: finding.firstSeenAt,
                lastSeenAt: finding.lastSeenAt,
                resolvedAt: finding.resolvedAt
            };
        })
    };
}

function buildBranchSummary(findings: Array<{ branch: string | null; severity: string }>)
{
    const branches = new Map<string, { branch: string; critical: number; high: number; medium: number; low: number; total: number }>();

    for (const finding of findings)
    {
        const branch = finding.branch || 'unknown';
        const current = branches.get(branch) ?? { branch, critical: 0, high: 0, medium: 0, low: 0, total: 0 };

        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            current[finding.severity] += 1;
        }

        current.total += 1;
        branches.set(branch, current);
    }

    return Array.from(branches.values()).sort((left, right) => left.branch.localeCompare(right.branch));
}

async function buildScanXlsxReport(scan: Scan)
{
    const report = await buildScanJsonReport(scan);
    const summaryRows =
    [
        ['Generated At', 'Scan ID', 'Status', 'Repository', 'Provider', 'Default Branch', 'Commit', 'Critical', 'High', 'Medium', 'Low', 'Total Findings', 'Started At', 'Completed At', 'Error'],
        [
            report.generatedAt,
            report.scan.id,
            report.scan.status,
            report.repository?.fullName ?? '-',
            report.repository?.provider ?? '-',
            report.repository?.defaultBranch ?? report.scan.branch ?? '-',
            report.scan.commitSha ?? '-',
            report.scan.findingsCritical,
            report.scan.findingsHigh,
            report.scan.findingsMedium,
            report.scan.findingsLow,
            report.scan.findingsTotal,
            report.scan.startedAt ? new Date(report.scan.startedAt).toISOString() : '-',
            report.scan.completedAt ? new Date(report.scan.completedAt).toISOString() : '-',
            report.scan.errorMessage ?? '-'
        ]
    ];
    const branchRows =
    [
        ['Branch', 'Critical', 'High', 'Medium', 'Low', 'Total'],
        ...report.branchSummary.map(function (branch)
        {
            return [branch.branch, branch.critical, branch.high, branch.medium, branch.low, branch.total];
        })
    ];
    const findingRows =
    [
        ['ID', 'Branch', 'Severity', 'Rule ID', 'Title', 'File', 'Line', 'Status', 'Remediation'],
        ...report.findings.map(function (finding)
        {
            return [
                finding.id,
                finding.branch ?? '-',
                finding.severity,
                finding.ruleId,
                finding.title,
                finding.filePath,
                finding.lineNumber ?? '',
                finding.status,
                finding.remediation ?? ''
            ];
        })
    ];

    return buildXlsxWorkbook(
        [
            { name: 'Scan Summary', rows: summaryRows },
            { name: 'Branch Summary', rows: branchRows },
            { name: 'Findings', rows: findingRows }
        ]
    );
}

export {
    buildTenantJsonReport,
    buildScanJsonReport,
    buildScanXlsxReport
};
