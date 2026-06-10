import { Finding, NotificationEvent, Repository, Scan } from '../../db/models';
import { ScannerFinding } from './scan-rules.service';
import { createTenantNotification } from './in-app-notification.service';

async function queueSecurityAlert(
    tenantId: number,
    repositoryFullName: string,
    findings: ScannerFinding[]
)
{
    const severeFindings = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high');

    if (severeFindings.length === 0)
    {
        return null;
    }

    await createTenantNotification(
        {
            tenantId,
            type: 'security_alert',
            title: `${severeFindings.length} high-risk findings detected`,
            body: `High-risk findings were detected in ${repositoryFullName}.`,
            payload:
            {
                repositoryFullName,
                findings: severeFindings
            }
        }
    );

    return NotificationEvent.create(
        {
            tenantId,
            type: 'security_alert',
            channel: 'email',
            status: 'queued',
            subject: `${severeFindings.length} high-risk security findings in ${repositoryFullName}`,
            payload:
            {
                repositoryFullName,
                findings: severeFindings.map(function (finding)
                {
                    return {
                        ruleId: finding.ruleId,
                        severity: finding.severity,
                        title: finding.title,
                        filePath: finding.filePath,
                        lineNumber: finding.lineNumber
                    };
                })
            }
        }
    );
}

async function queueWeeklyReport(tenantId: number, summary: object)
{
    return NotificationEvent.create(
        {
            tenantId,
            type: 'weekly_report',
            channel: 'email',
            status: 'queued',
            subject: 'Weekly security report',
            payload: summary
        }
    );
}

async function queueWeeklyReportsForAllTenants()
{
    const rows = await Finding.findAll(
        {
            where:
            {
                status: 'open'
            },
            include:
            [
                {
                    model: Scan,
                    as: 'scan'
                },
                {
                    model: Repository,
                    as: 'repository'
                }
            ]
        }
    );
    const summaryByTenant = new Map<number, {
        critical: number;
        high: number;
        medium: number;
        low: number;
        total: number;
        repositories: Record<string, { score: number; openFindings: number }>;
    }>();

    for (const finding of rows)
    {
        const scan = finding.get('scan') as Scan | undefined;

        if (!scan)
        {
            continue;
        }

        const tenantId = scan.tenantId;
        const repository = finding.get('repository') as Repository | undefined;
        const summary = summaryByTenant.get(tenantId) ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0, repositories: {} };
        summary.total += 1;

        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            summary[finding.severity] += 1;
        }

        if (repository)
        {
            summary.repositories[repository.fullName] = summary.repositories[repository.fullName] ?? {
                score: repository.securityScore,
                openFindings: 0
            };
            summary.repositories[repository.fullName].openFindings += 1;
        }

        summaryByTenant.set(tenantId, summary);
    }

    for (const [tenantId, summary] of summaryByTenant)
    {
        if (tenantId > 0)
        {
            await queueWeeklyReport(tenantId, summary);
        }
    }
}

export {
    queueSecurityAlert,
    queueWeeklyReport,
    queueWeeklyReportsForAllTenants
};
