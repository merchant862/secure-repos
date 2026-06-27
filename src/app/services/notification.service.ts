import { Finding, NotificationEvent, Repository, Scan, User } from '../../db/models';
import { Op } from 'sequelize';
import { ScannerFinding } from './scan-rules.service';
import { createTenantNotification } from './in-app-notification.service';
import { getTenantPlan } from './plan-limit.service';

async function getTenantEmailRecipients(tenantId: number): Promise<string[]>
{
    const owner = await User.findOne(
        {
            where: { tenantId, role: 'owner', status: 'active' },
            attributes: ['email'],
            order: [['id', 'ASC']]
        }
    );

    return owner ? [owner.email] : [];
}

async function queueEmailEvent(input: {
    tenantId: number;
    type: string;
    subject: string;
    payload: Record<string, unknown>;
    recipients?: string[];
})
{
    const recipients = input.recipients && input.recipients.length > 0
        ? input.recipients
        : await getTenantEmailRecipients(input.tenantId);

    return NotificationEvent.create(
        {
            tenantId: input.tenantId,
            type: input.type,
            channel: 'email',
            status: 'queued',
            subject: input.subject,
            payload:
            {
                ...input.payload,
                recipients
            }
        }
    );
}

async function queueSecurityAlert(
    tenantId: number,
    repositoryFullName: string,
    findings: ScannerFinding[]
)
{
    const plan = await getTenantPlan(tenantId);
    const allowHigh = plan?.slug === 'solo-pro';
    const severeFindings = findings.filter((finding) =>
        finding.severity === 'critical' || (finding.severity === 'high' && allowHigh));

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
                findings: severeFindings.slice(0, 20).map((finding) => ({
                    ruleId: finding.ruleId,
                    severity: finding.severity,
                    title: finding.title,
                    filePath: finding.filePath,
                    lineNumber: finding.lineNumber
                }))
            }
        }
    );

    return queueEmailEvent(
        {
            tenantId,
            type: 'security_alert',
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

async function queueSecurityReport(tenantId: number, summary: object, cadenceLabel: string)
{
    return queueEmailEvent(
        {
            tenantId,
            type: 'weekly_report',
            subject: `${cadenceLabel} security report`,
            payload:
            {
                ...(summary as Record<string, unknown>),
                cadenceLabel
            }
        }
    );
}

async function queueWelcomeOwnerEmail(user: User)
{
    return queueEmailEvent(
        {
            tenantId: user.tenantId,
            type: 'welcome_owner',
            subject: `Welcome to SecureRepos, ${user.name}`,
            recipients: [user.email],
            payload:
            {
                name: user.name,
                email: user.email
            }
        }
    );
}

async function queueCheckoutLinkEmail(user: User, checkoutUrl: string, planName: string)
{
    return queueEmailEvent(
        {
            tenantId: user.tenantId,
            type: 'checkout_link',
            subject: `Activate your ${planName} plan`,
            recipients: [user.email],
            payload:
            {
                name: user.name,
                email: user.email,
                planName,
                checkoutUrl
            }
        }
    );
}

async function queueScanSummaryEmail(scan: Scan, repository: Repository)
{
    const totalFindings = scan.findingsCritical + scan.findingsHigh + scan.findingsMedium + scan.findingsLow;

    await createTenantNotification(
        {
            tenantId: scan.tenantId,
            type: 'scan_summary',
            title: `Scan complete for ${repository.name}`,
            body: `${repository.fullName} finished with ${totalFindings} open findings and a score of ${repository.securityScore}.`,
            payload:
            {
                scanId: scan.id,
                repositoryId: repository.id,
                repositoryFullName: repository.fullName,
                critical: scan.findingsCritical,
                high: scan.findingsHigh,
                medium: scan.findingsMedium,
                low: scan.findingsLow,
                score: repository.securityScore
            }
        }
    );

    return queueEmailEvent(
        {
            tenantId: scan.tenantId,
            type: 'scan_summary',
            subject: `Scan complete for ${repository.fullName}`,
            payload:
            {
                repositoryFullName: repository.fullName,
                critical: scan.findingsCritical,
                high: scan.findingsHigh,
                medium: scan.findingsMedium,
                low: scan.findingsLow,
                score: repository.securityScore
            }
        }
    );
}

async function queueScanFailedEmail(scan: Scan, repository: Repository | null, errorMessage: string)
{
    await createTenantNotification(
        {
            tenantId: scan.tenantId,
            type: 'scan_failed',
            title: `Scan failed${repository ? ` for ${repository.name}` : ''}`,
            body: errorMessage,
            payload:
            {
                scanId: scan.id,
                repositoryId: repository?.id,
                repositoryFullName: repository?.fullName,
                errorMessage
            }
        }
    );

    return queueEmailEvent(
        {
            tenantId: scan.tenantId,
            type: 'scan_failed',
            subject: `Scan failed${repository ? ` for ${repository.fullName}` : ''}`,
            payload:
            {
                repositoryFullName: repository?.fullName,
                errorMessage
            }
        }
    );
}

async function queueFindingStatusEmail(tenantId: number, finding: Finding, repository: Repository, status: string)
{
    return queueEmailEvent(
        {
            tenantId,
            type: 'finding_status_changed',
            subject: `Finding ${status}: ${finding.title}`,
            payload:
            {
                findingId: finding.id,
                title: finding.title,
                severity: finding.severity,
                status,
                repositoryFullName: repository.fullName,
                filePath: finding.filePath
            }
        }
    );
}

async function queueProviderStatusEmail(tenantId: number, provider: string, accountLogin: string, status = 'connected')
{
    return queueEmailEvent(
        {
            tenantId,
            type: 'provider_status_changed',
            subject: provider === 'github' ? `GitHub App ${status}` : `${provider} provider ${status}`,
            payload:
            {
                provider,
                accountLogin,
                status
            }
        }
    );
}

function reportCadenceForSchedule(scanSchedule: string | null | undefined)
{
    if (scanSchedule === 'weekly')
    {
        return { label: 'Weekly', intervalMs: 7 * 24 * 60 * 60 * 1000 };
    }

    if (scanSchedule === 'every_4_days')
    {
        return { label: '4-day', intervalMs: 4 * 24 * 60 * 60 * 1000 };
    }

    return { label: 'Daily', intervalMs: 24 * 60 * 60 * 1000 };
}

async function queuePlanReportsForAllTenants()
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
            const plan = await getTenantPlan(tenantId);
            const cadence = reportCadenceForSchedule(plan?.scanSchedule);
            const recentReport = await NotificationEvent.findOne(
                {
                    where:
                    {
                        tenantId,
                        type: 'weekly_report',
                        createdAt: { [Op.gte]: new Date(Date.now() - cadence.intervalMs + 60 * 60 * 1000) }
                    }
                }
            );

            if (!recentReport)
            {
                await queueSecurityReport(tenantId, summary, cadence.label);
            }
        }
    }
}

export {
    getTenantEmailRecipients,
    queueEmailEvent,
    queueSecurityAlert,
    queueSecurityReport,
    queuePlanReportsForAllTenants,
    reportCadenceForSchedule,
    queueWelcomeOwnerEmail,
    queueCheckoutLinkEmail,
    queueScanSummaryEmail,
    queueScanFailedEmail,
    queueFindingStatusEmail,
    queueProviderStatusEmail
};
