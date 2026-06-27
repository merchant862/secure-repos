import { Finding, NotificationEvent, Repository, Scan, User } from '../../db/models';
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

export {
    getTenantEmailRecipients,
    queueEmailEvent,
    queueSecurityAlert,
    queueWelcomeOwnerEmail,
    queueCheckoutLinkEmail,
    queueScanSummaryEmail,
    queueScanFailedEmail,
    queueFindingStatusEmail,
    queueProviderStatusEmail
};
