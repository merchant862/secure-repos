import { Finding, NotificationEvent, NotificationSetting, Repository, Scan, User } from '../../db/models';
import { ScannerFinding } from './scan-rules.service';
import { createTenantNotification } from './in-app-notification.service';

async function getTenantEmailRecipients(tenantId: number, fallbackUserId?: number): Promise<string[]>
{
    const settings = await NotificationSetting.findOne({ where: { tenantId } });
    const configured = settings?.emailRecipients as unknown;

    if (Array.isArray(configured))
    {
        return configured.filter((email): email is string => typeof email === 'string' && email.includes('@'));
    }

    if (typeof configured === 'string')
    {
        return configured
            .split(/[\s,;]+/)
            .map((email) => email.trim())
            .filter((email) => email.includes('@'));
    }

    if (configured && typeof configured === 'object' && Array.isArray((configured as { recipients?: unknown }).recipients))
    {
        return (configured as { recipients: unknown[] }).recipients.filter((email): email is string => typeof email === 'string' && email.includes('@'));
    }

    const users = await User.findAll(
        {
            where: fallbackUserId ? { id: fallbackUserId, tenantId, status: 'active' } : { tenantId, status: 'active' },
            attributes: ['email']
        }
    );

    return users.map((user) => user.email);
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

async function queueWeeklyReport(tenantId: number, summary: object)
{
    return queueEmailEvent(
        {
            tenantId,
            type: 'weekly_report',
            subject: 'Weekly security report',
            payload: summary as Record<string, unknown>
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

async function queueScanSummaryEmail(scan: Scan, repository: Repository)
{
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

async function queueFindingAssignedEmail(finding: Finding, repository: Repository, assignedUser: User)
{
    return queueEmailEvent(
        {
            tenantId: assignedUser.tenantId,
            type: 'finding_assigned',
            subject: `Finding assigned: ${finding.title}`,
            recipients: [assignedUser.email],
            payload:
            {
                findingId: finding.id,
                title: finding.title,
                severity: finding.severity,
                repositoryFullName: repository.fullName,
                filePath: finding.filePath
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
    getTenantEmailRecipients,
    queueEmailEvent,
    queueSecurityAlert,
    queueWeeklyReport,
    queueWeeklyReportsForAllTenants,
    queueWelcomeOwnerEmail,
    queueScanSummaryEmail,
    queueScanFailedEmail,
    queueFindingAssignedEmail,
    queueFindingStatusEmail,
    queueProviderStatusEmail
};
