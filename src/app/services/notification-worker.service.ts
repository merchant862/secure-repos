import { Op } from 'sequelize';

import { env } from '../../bootstrap/env';
import { AlertChannel, GithubInstallation, NotificationEvent, Repository } from '../../db/models';
import { configForChannel, webhookUrlForChannel } from './alert-channel.service';
import { renderEmailTemplate } from './email-template.service';
import { createInstallationAccessToken, createIssue } from '../../modules/github/github.service';

function sleep(ms: number)
{
    return new Promise(function (resolve)
    {
        setTimeout(resolve, ms);
    });
}

async function deliverNotification(notification: NotificationEvent)
{
    const payload = normalizeNotificationPayload(notification.payload);

    if (notification.channel === 'slack' || notification.channel === 'discord' || notification.channel === 'teams' || notification.channel === 'telegram' || notification.channel === 'github_issues')
    {
        return deliverWebhookNotification(notification, payload);
    }

    if (env.notificationDeliveryMode === 'resend')
    {
        if (!env.resendApiKey || !env.resendFromEmail)
        {
            throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL are required for resend delivery mode');
        }

        const recipients = recipientsFromPayload(payload);

        if (recipients.length === 0)
        {
            throw new Error('Notification has no recipients');
        }

        const response = await fetch('https://api.resend.com/emails',
            {
                method: 'POST',
                headers:
                {
                    Authorization: `Bearer ${env.resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    {
                        from: env.resendFromEmail,
                        to: recipients,
                        subject: notification.subject,
                        html: renderEmailTemplate(notification.type, payload)
                    }
                )
            }
        );

        if (!response.ok)
        {
            throw new Error(`Resend delivery failed: ${await response.text()}`);
        }

        return;
    }

    if (env.notificationDeliveryMode === 'log')
    {
        console.log('Notification delivery:', JSON.stringify(
            {
                id: notification.id,
                type: notification.type,
                subject: notification.subject,
                payload
            }
        ));
        return;
    }

    throw new Error(`Unsupported notification delivery mode: ${env.notificationDeliveryMode}`);
}

function textFromPayload(notification: NotificationEvent, payload: Record<string, unknown>)
{
    const repository = typeof payload.repositoryFullName === 'string' ? payload.repositoryFullName : 'repository';
    const findings = Array.isArray(payload.findings) ? payload.findings as Array<Record<string, unknown>> : [];
    const rows = findings
        .slice(0, 6)
        .map((finding) => `- ${String(finding.severity || '').toUpperCase()} ${String(finding.title || 'Finding')} (${String(finding.filePath || 'repository')})`)
        .join('\n');

    return `${notification.subject}\n${repository}${rows ? `\n${rows}` : ''}\n${env.appUrl.replace(/\/$/, '')}/findings`;
}

function webhookBody(channel: string, text: string)
{
    if (channel === 'discord')
    {
        return { content: text.slice(0, 1900) };
    }

    if (channel === 'teams')
    {
        return {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: 'SecureRepos alert',
            themeColor: 'D13438',
            title: 'SecureRepos security alert',
            text: text.replace(/\n/g, '<br>')
        };
    }

    return { text };
}

async function deliverTelegramNotification(alertChannel: AlertChannel, text: string)
{
    const config = configForChannel(alertChannel);
    const chatId = typeof config.chatId === 'string' ? config.chatId : '';
    if (!chatId)
    {
        throw new Error('Telegram chat ID is missing');
    }

    const response = await fetch(`https://api.telegram.org/bot${webhookUrlForChannel(alertChannel)}/sendMessage`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900), disable_web_page_preview: true })
        }
    );

    if (!response.ok)
    {
        throw new Error(`Telegram delivery failed: ${response.status} ${await response.text()}`);
    }
}

async function deliverGithubIssueNotification(alertChannel: AlertChannel, notification: NotificationEvent, text: string)
{
    const config = configForChannel(alertChannel);
    const repositoryId = Number(config.repositoryId);
    const repository = Number.isFinite(repositoryId) ? await Repository.findByPk(repositoryId) : null;
    const installation = repository?.githubInstallationId ? await GithubInstallation.findByPk(repository.githubInstallationId) : null;

    if (!repository || !installation || repository.isActive !== true || repository.provider !== 'github')
    {
        throw new Error('GitHub Issues repository is no longer available');
    }

    const token = await createInstallationAccessToken(installation.githubInstallationId);
    await createIssue(
        token,
        repository.fullName,
        {
            title: notification.subject.slice(0, 255),
            body: text,
            labels: ['securerepos', 'security']
        }
    );
}

async function deliverWebhookNotification(notification: NotificationEvent, payload: Record<string, unknown>)
{
    const channelId = Number(payload.alertChannelId);
    const alertChannel = Number.isFinite(channelId) ? await AlertChannel.findByPk(channelId) : null;

    if (!alertChannel || !alertChannel.isActive || alertChannel.tenantId !== notification.tenantId)
    {
        throw new Error('Alert channel is no longer connected');
    }

    if (notification.channel === 'telegram')
    {
        await deliverTelegramNotification(alertChannel, textFromPayload(notification, payload));
        await alertChannel.update({ lastDeliveredAt: new Date(), lastError: null });
        return;
    }

    if (notification.channel === 'github_issues')
    {
        await deliverGithubIssueNotification(alertChannel, notification, textFromPayload(notification, payload));
        await alertChannel.update({ lastDeliveredAt: new Date(), lastError: null });
        return;
    }

    const response = await fetch(webhookUrlForChannel(alertChannel),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookBody(notification.channel, textFromPayload(notification, payload)))
        }
    );

    if (!response.ok)
    {
        const message = `Webhook delivery failed: ${response.status} ${await response.text()}`;
        await alertChannel.update({ lastError: message.slice(0, 1000) });
        throw new Error(message);
    }

    await alertChannel.update({ lastDeliveredAt: new Date(), lastError: null });
}

function normalizeNotificationPayload(payload: unknown): Record<string, unknown>
{
    if (typeof payload === 'string')
    {
        try
        {
            const parsed = JSON.parse(payload) as unknown;

            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {};
        }
        catch (error)
        {
            return {};
        }
    }

    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
}

function recipientsFromPayload(payload: Record<string, unknown>): string[]
{
    if (Array.isArray(payload.recipients))
    {
        return payload.recipients.filter((email): email is string => typeof email === 'string' && email.includes('@'));
    }

    return typeof payload.email === 'string' && payload.email.includes('@')
        ? [payload.email]
        : [];
}

async function runNotificationWorkerOnce(emailType?: string)
{
    const where: Record<string, unknown> =
    {
        channel: emailType && ['slack', 'discord', 'teams', 'telegram', 'github_issues'].includes(emailType) ? emailType : { [Op.in]: ['email', 'slack', 'discord', 'teams', 'telegram', 'github_issues'] },
        status:
        {
            [Op.in]: ['queued', 'retry']
        }
    };

    if (emailType && !['slack', 'discord', 'teams', 'telegram', 'github_issues'].includes(emailType))
    {
        where.type = emailType;
    }

    const notification = await NotificationEvent.findOne(
        {
            where,
            order: [['createdAt', 'ASC']]
        }
    );

    if (!notification)
    {
        return null;
    }

    const [updatedRows] = await NotificationEvent.update(
        {
            status: 'sending'
        },
        {
            where:
            {
                id: notification.id,
                status: notification.status
            }
        }
    );

    if (updatedRows !== 1)
    {
        return null;
    }

    await notification.reload();

    try
    {
        await deliverNotification(notification);
        await notification.update(
            {
                status: 'sent',
                sentAt: new Date(),
                errorMessage: null
            }
        );
    }
    catch (error)
    {
        await notification.update(
            {
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown notification delivery error'
            }
        );
    }

    return notification;
}

async function runNotificationWorkerLoop(pollMs: number, emailType?: string)
{
    while (true)
    {
        await runNotificationWorkerOnce(emailType);
        await sleep(pollMs);
    }
}

export {
    runNotificationWorkerOnce,
    runNotificationWorkerLoop
};
