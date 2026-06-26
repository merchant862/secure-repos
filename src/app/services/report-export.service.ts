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
        categorySummary: buildCategorySummary(findings),
        complianceSummary: buildComplianceSummary(findings),
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

function ruleCategory(ruleId: string)
{
    if (ruleId.startsWith('secret.')) return 'Secrets';
    if (ruleId.startsWith('dependency.') || ruleId === 'github.dependabot-alert') return 'Dependencies';
    if (ruleId.startsWith('ci.')) return 'CI/CD';
    if (ruleId.startsWith('container.')) return 'Containers';
    if (ruleId.startsWith('iac.')) return 'Infrastructure as Code';
    if (ruleId.startsWith('framework.')) return 'Framework Security';
    if (ruleId.startsWith('auth.')) return 'Authentication';
    if (ruleId.startsWith('business.')) return 'Business Logic Review';
    if (ruleId.startsWith('code.')) return 'Code Risk';
    if (ruleId.startsWith('github.secret')) return 'GitHub Native Alerts';
    return 'Repository Hygiene';
}

function buildCategorySummary(findings: Array<{ ruleId: string; severity: string }>)
{
    const categories = new Map<string, { category: string; critical: number; high: number; medium: number; low: number; total: number }>();

    for (const finding of findings)
    {
        const category = ruleCategory(finding.ruleId);
        const current = categories.get(category) ?? { category, critical: 0, high: 0, medium: 0, low: 0, total: 0 };

        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            current[finding.severity] += 1;
        }

        current.total += 1;
        categories.set(category, current);
    }

    return Array.from(categories.values()).sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));
}

function buildComplianceSummary(findings: Array<{ ruleId: string }>)
{
    const ruleIds = new Set(findings.map((finding) => finding.ruleId));
    const hasRule = (predicate: (ruleId: string) => boolean) => Array.from(ruleIds).some(predicate);
    const controls =
    [
        {
            control: 'Secrets are not committed',
            status: hasRule((ruleId) => ruleId.startsWith('secret.') || ruleId === 'repo.env-file-committed') ? 'fail' : 'pass'
        },
        {
            control: 'Dependencies are reviewed for known risk',
            status: hasRule((ruleId) => ruleId.startsWith('dependency.') || ruleId === 'github.dependabot-alert') ? 'fail' : 'pass'
        },
        {
            control: 'CI/CD follows least privilege',
            status: hasRule((ruleId) => ruleId.startsWith('ci.')) ? 'fail' : 'pass'
        },
        {
            control: 'Container and runtime hardening is present',
            status: hasRule((ruleId) => ruleId.startsWith('container.')) ? 'fail' : 'pass'
        },
        {
            control: 'Infrastructure templates avoid public or high-privilege defaults',
            status: hasRule((ruleId) => ruleId.startsWith('iac.')) ? 'fail' : 'pass'
        },
        {
            control: 'Framework and auth configuration avoids risky defaults',
            status: hasRule((ruleId) => ruleId.startsWith('framework.') || ruleId.startsWith('auth.')) ? 'fail' : 'pass'
        },
        {
            control: 'Auth and business logic TODOs are reviewed',
            status: hasRule((ruleId) => ruleId.startsWith('business.')) ? 'review' : 'pass'
        }
    ];

    return {
        passed: controls.filter((control) => control.status === 'pass').length,
        failed: controls.filter((control) => control.status === 'fail').length,
        review: controls.filter((control) => control.status === 'review').length,
        controls
    };
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
    const categoryRows =
    [
        ['Category', 'Critical', 'High', 'Medium', 'Low', 'Total'],
        ...report.categorySummary.map(function (category)
        {
            return [category.category, category.critical, category.high, category.medium, category.low, category.total];
        })
    ];
    const complianceRows =
    [
        ['Control', 'Status'],
        ...report.complianceSummary.controls.map(function (control)
        {
            return [control.control, control.status];
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
            { name: 'Category Summary', rows: categoryRows },
            { name: 'Controls', rows: complianceRows },
            { name: 'Findings', rows: findingRows }
        ]
    );
}

export {
    buildTenantJsonReport,
    buildScanJsonReport,
    buildScanXlsxReport
};
