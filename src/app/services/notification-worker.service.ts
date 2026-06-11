import { Op } from 'sequelize';

import { env } from '../../bootstrap/env';
import { NotificationEvent } from '../../db/models';
import { renderEmailTemplate } from './email-template.service';

function sleep(ms: number)
{
    return new Promise(function (resolve)
    {
        setTimeout(resolve, ms);
    });
}

async function deliverNotification(notification: NotificationEvent)
{
    if (env.notificationDeliveryMode === 'resend')
    {
        if (!env.resendApiKey || !env.resendFromEmail)
        {
            throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL are required for resend delivery mode');
        }

        const payload = notification.payload as { recipients?: unknown; email?: unknown };
        const recipients = Array.isArray(payload.recipients)
            ? payload.recipients.filter((email): email is string => typeof email === 'string' && email.includes('@'))
            : typeof payload.email === 'string' && payload.email.includes('@')
                ? [payload.email]
                : [];

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
                        html: renderEmailTemplate(notification.type, notification.payload as Record<string, unknown>)
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
                payload: notification.payload
            }
        ));
        return;
    }

    throw new Error(`Unsupported notification delivery mode: ${env.notificationDeliveryMode}`);
}

async function runNotificationWorkerOnce(emailType?: string)
{
    const where: Record<string, unknown> =
    {
        channel: 'email',
        status:
        {
            [Op.in]: ['queued', 'retry']
        }
    };

    if (emailType)
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
