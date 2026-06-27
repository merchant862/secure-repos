import { env } from '../../bootstrap/env';

type EmailTemplatePayload = Record<string, unknown>;

function escapeHtml(value: unknown): string
{
    return String(value ?? '').replace(/[&<>"']/g, function (char)
    {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } as Record<string, string>)[char];
    });
}

function getAppUrl()
{
    return (env.appUrl || 'https://securerepos.com').replace(/\/$/, '');
}

function button(label: string, href: string)
{
    return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#4f7cff;color:#ffffff;text-decoration:none;font-weight:800;border-radius:8px;padding:13px 18px">${escapeHtml(label)}</a>`;
}

function stat(label: string, value: unknown, tone = '#d0d5dd')
{
    return `<td style="padding:12px;border:1px solid #263244;border-radius:8px;background:#111827"><div style="color:#98a2b3;font-size:12px">${escapeHtml(label)}</div><div style="color:${tone};font-size:24px;font-weight:900;margin-top:4px">${escapeHtml(value)}</div></td>`;
}

function emailLogo(appUrl: string)
{
    const logoUrl = `${appUrl}/public/images/logo-email.png`;

    return `<a href="${escapeHtml(appUrl)}" style="display:inline-block;text-decoration:none">
<img src="${escapeHtml(logoUrl)}" width="220" height="52" alt="SecureRepos - GitHub security scanner" style="display:block;width:220px;height:52px;max-width:100%;border:0;outline:none;text-decoration:none">
</a>`;
}

function rows(items: Array<Record<string, unknown>>, keys: string[])
{
    if (!items.length)
    {
        return '<p style="color:#98a2b3;margin:0">No items to show.</p>';
    }

    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px">${items.slice(0, 8).map(function (item)
    {
        return `<tr>${keys.map(function (key)
        {
            return `<td style="padding:10px;border-bottom:1px solid #263244;color:#d0d5dd;font-size:13px">${escapeHtml(item[key])}</td>`;
        }).join('')}</tr>`;
    }).join('')}</table>`;
}

function baseTemplate(title: string, preview: string, body: string)
{
    const appUrl = getAppUrl();

    return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#070b12;color:#e5e7eb;font-family:Inter,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;color:#070b12">${escapeHtml(preview)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#070b12;padding:28px 12px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#0b1220;border:1px solid #263244;border-radius:12px;overflow:hidden">
<tr><td style="padding:24px 26px;border-bottom:1px solid #263244;background:#0f172a">
${emailLogo(appUrl)}
</td></tr>
<tr><td style="padding:26px">${body}</td></tr>
<tr><td style="padding:18px 26px;border-top:1px solid #263244;color:#98a2b3;font-size:12px;background:#0f172a">
You are receiving this email because your workspace uses ${escapeHtml(env.appName)}. Need help? Contact <a href="mailto:${escapeHtml(env.supportEmail)}" style="color:#9bb2ff">${escapeHtml(env.supportEmail)}</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderLoginOtp(payload: EmailTemplatePayload)
{
    const code = escapeHtml(payload.otpCode);
    const minutes = escapeHtml(payload.expiresMinutes ?? 10);

    return baseTemplate(
        'Your SecureRepos login code',
        `Your login code is ${code}.`,
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Confirm your login</h1>
<p style="margin:0 0 18px;color:#d0d5dd;line-height:1.65">Use this one-time code to finish signing in to ${escapeHtml(env.appName)}.</p>
<div style="letter-spacing:8px;font-size:34px;font-weight:900;color:#ffffff;background:#111827;border:1px solid #263244;border-radius:10px;padding:18px;text-align:center">${code}</div>
<p style="margin:18px 0 0;color:#98a2b3;font-size:13px">This code expires in ${minutes} minutes. If this was not you, ignore this email and review your account access.</p>`
    );
}

function renderWelcomeOwner(payload: EmailTemplatePayload)
{
    return baseTemplate(
        `Welcome to ${env.appName}`,
        'Your repository security workspace is ready.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Your workspace is ready</h1>
<p style="margin:0 0 20px;color:#d0d5dd;line-height:1.65">Hi ${escapeHtml(payload.name || 'there')}, your ${escapeHtml(env.appName)} workspace has been created. Choose a plan, activate access, install the GitHub App, and run the first scan.</p>
${button('Open workspace', `${getAppUrl()}/dashboard`)}`
    );
}

function renderCheckoutLink(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'Activate your SecureRepos plan',
        'Use your secure checkout link to activate repository scanning.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Activate your plan</h1>
<p style="margin:0 0 20px;color:#d0d5dd;line-height:1.65">Hi ${escapeHtml(payload.name || 'there')}, your workspace is ready. Use this checkout link to activate ${escapeHtml(payload.planName || 'your selected plan')} and continue onboarding.</p>
${button('Continue to checkout', String(payload.checkoutUrl || `${getAppUrl()}/billing`))}
<p style="margin:18px 0 0;color:#98a2b3;font-size:13px">If you did not create this workspace, ignore this email.</p>`
    );
}

function renderSecurityAlert(payload: EmailTemplatePayload)
{
    const findings = Array.isArray(payload.findings) ? payload.findings as Array<Record<string, unknown>> : [];

    return baseTemplate(
        'High-risk security findings detected',
        'High or critical findings were detected in a repository.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">High-risk findings detected</h1>
<p style="margin:0 0 18px;color:#d0d5dd;line-height:1.65">Repository: <strong>${escapeHtml(payload.repositoryFullName)}</strong></p>
${rows(findings, ['severity', 'title', 'filePath'])}
<div style="margin-top:20px">${button('Review findings', `${getAppUrl()}/findings`)}</div>`
    );
}

function renderWeeklyReport(payload: EmailTemplatePayload)
{
    const cadenceLabel = typeof payload.cadenceLabel === 'string' ? payload.cadenceLabel : 'Weekly';

    return baseTemplate(
        `${cadenceLabel} security report`,
        `Your ${cadenceLabel.toLowerCase()} repository security summary is ready.`,
        `<h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.15">${escapeHtml(cadenceLabel)} security report</h1>
<table width="100%" cellpadding="0" cellspacing="8"><tr>${stat('Critical', payload.critical ?? 0, '#ff6b6b')}${stat('High', payload.high ?? 0, '#f59e0b')}${stat('Total open', payload.total ?? 0, '#ffffff')}</tr></table>
<p style="margin:16px 0 20px;color:#d0d5dd;line-height:1.65">Review open work and keep ownership moving.</p>
${button('Open findings', `${getAppUrl()}/findings`)}`
    );
}

function renderScanSummary(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'Repository scan complete',
        'A repository scan has finished.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Scan complete</h1>
<p style="margin:0 0 18px;color:#d0d5dd;line-height:1.65">${escapeHtml(payload.repositoryFullName || 'Repository')} finished scanning.</p>
<table width="100%" cellpadding="0" cellspacing="8"><tr>${stat('Critical', payload.critical ?? 0, '#ff6b6b')}${stat('High', payload.high ?? 0, '#f59e0b')}${stat('Score', payload.score ?? '-', '#ffffff')}</tr></table>`
    );
}

function renderScanFailed(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'Repository scan failed',
        'A repository scan could not complete.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Scan failed</h1>
<p style="margin:0 0 14px;color:#d0d5dd;line-height:1.65">Repository: <strong>${escapeHtml(payload.repositoryFullName || 'Repository')}</strong></p>
<p style="margin:0 0 20px;color:#98a2b3;line-height:1.65">${escapeHtml(payload.errorMessage || 'The scanner could not complete this run.')}</p>
${button('Open repositories', `${getAppUrl()}/repositories`)}`
    );
}

function renderFindingStatus(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'Finding status changed',
        'A repository security finding status changed.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Finding ${escapeHtml(payload.status || 'updated')}</h1>
<p style="margin:0 0 20px;color:#d0d5dd;line-height:1.65"><strong>${escapeHtml(payload.title || 'Security finding')}</strong> in ${escapeHtml(payload.repositoryFullName || 'repository')} was updated.</p>
${button('Review finding', `${getAppUrl()}/findings/${escapeHtml(payload.findingId)}`)}`
    );
}

function renderProviderStatus(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'GitHub App status changed',
        'A GitHub App connection changed.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">GitHub App ${escapeHtml(payload.status || 'connected')}</h1>
<p style="margin:0 0 20px;color:#d0d5dd;line-height:1.65">GitHub account <strong>${escapeHtml(payload.accountLogin || '')}</strong> is ${escapeHtml(payload.status || 'connected')}.</p>
${button('Open repositories', `${getAppUrl()}/repositories`)}`
    );
}

function renderPasswordReset(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'Reset your SecureRepos password',
        'Use the secure link to reset your password.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Reset your password</h1>
<p style="margin:0 0 20px;color:#d0d5dd;line-height:1.65">Use the link below to reset your password. If you did not request this, ignore this email.</p>
${button('Reset password', String(payload.resetUrl || `${getAppUrl()}/sign-in`))}`
    );
}

function renderSubscriptionCancelled(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'SecureRepos subscription cancelled',
        'Your workspace subscription has been cancelled.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">Subscription cancelled</h1>
<p style="margin:0 0 18px;color:#d0d5dd;line-height:1.65">Your ${escapeHtml(env.appName)} subscription has been cancelled by ${escapeHtml(payload.cancelledBy || 'the account owner')}.</p>
<p style="margin:0 0 20px;color:#98a2b3;line-height:1.65">Workspace access is no longer active. You can reactivate later from billing if needed.</p>
${button('Open billing', `${getAppUrl()}/billing`)}`
    );
}

function renderContactMessage(payload: EmailTemplatePayload)
{
    return baseTemplate(
        'New SecureRepos contact message',
        'A visitor submitted the contact form.',
        `<h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.15">New contact message</h1>
<p style="margin:0 0 18px;color:#d0d5dd;line-height:1.65">A visitor submitted the ${escapeHtml(env.appName)} contact form.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px">
<tr><td style="width:120px;padding:10px 0;color:#98a2b3;border-bottom:1px solid #263244">Name</td><td style="padding:10px 0;color:#ffffff;border-bottom:1px solid #263244">${escapeHtml(payload.name)}</td></tr>
<tr><td style="width:120px;padding:10px 0;color:#98a2b3;border-bottom:1px solid #263244">Email</td><td style="padding:10px 0;color:#ffffff;border-bottom:1px solid #263244"><a href="mailto:${escapeHtml(payload.email)}" style="color:#9bb2ff">${escapeHtml(payload.email)}</a></td></tr>
<tr><td style="width:120px;padding:10px 0;color:#98a2b3;border-bottom:1px solid #263244">Company</td><td style="padding:10px 0;color:#ffffff;border-bottom:1px solid #263244">${escapeHtml(payload.company || '-')}</td></tr>
</table>
<div style="border:1px solid #263244;border-radius:10px;background:#111827;padding:16px;color:#d0d5dd;line-height:1.65;white-space:pre-wrap">${escapeHtml(payload.message)}</div>
<p style="margin:18px 0 0;color:#98a2b3;font-size:13px">IP: ${escapeHtml(payload.ipAddress || '-')} · Submitted: ${escapeHtml(payload.submittedAt || '-')}</p>`
    );
}

function renderEmailTemplate(type: string, payload: EmailTemplatePayload)
{
    const templates: Record<string, (payload: EmailTemplatePayload) => string> =
    {
        login_otp: renderLoginOtp,
        welcome_owner: renderWelcomeOwner,
        checkout_link: renderCheckoutLink,
        security_alert: renderSecurityAlert,
        weekly_report: renderWeeklyReport,
        scan_summary: renderScanSummary,
        scan_failed: renderScanFailed,
        finding_status_changed: renderFindingStatus,
        provider_status_changed: renderProviderStatus,
        repository_access_failed: renderProviderStatus,
        critical_finding_reminder: renderSecurityAlert,
        password_reset: renderPasswordReset,
        plan_activated: renderWelcomeOwner,
        payment_failed: renderScanFailed,
        subscription_cancelled: renderSubscriptionCancelled,
        contact_message: renderContactMessage
    };
    const renderer = templates[type];

    if (!renderer)
    {
        return baseTemplate('SecureRepos notification', 'Workspace notification', `<pre style="white-space:pre-wrap;color:#d0d5dd">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`);
    }

    return renderer(payload);
}

export {
    renderEmailTemplate
};
