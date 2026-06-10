import { Op } from 'sequelize';

import { env } from '../../bootstrap/env';
import { NotificationEvent } from '../../db/models';

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

        const recipients = Array.isArray((notification.payload as { recipients?: unknown }).recipients)
            ? (notification.payload as { recipients: string[] }).recipients
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
                        html: `<pre>${JSON.stringify(notification.payload, null, 2)}</pre>`
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

async function runNotificationWorkerOnce()
{
    const notification = await NotificationEvent.findOne(
        {
            where:
            {
                status:
                {
                    [Op.in]: ['queued', 'retry']
                }
            },
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

async function runNotificationWorkerLoop(pollMs: number)
{
    while (true)
    {
        await runNotificationWorkerOnce();
        await sleep(pollMs);
    }
}

export {
    runNotificationWorkerOnce,
    runNotificationWorkerLoop
};
