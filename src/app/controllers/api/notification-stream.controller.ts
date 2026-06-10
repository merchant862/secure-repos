import { Response } from 'express';

import { InAppNotification } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { getUnreadNotificationCount } from '../../services/in-app-notification.service';

function writeSse(res: Response, event: string, data: object)
{
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function notificationStreamController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let lastNotificationId = 0;

    const sendSnapshot = async function ()
    {
        const unreadCount = await getUnreadNotificationCount(user.tenantId, user.id);
        const latestNotifications = await InAppNotification.findAll(
            {
                where:
                {
                    tenantId: user.tenantId
                },
                order: [['createdAt', 'DESC']],
                limit: 5
            }
        );
        const latestId = latestNotifications[0]?.id ?? 0;

        writeSse(res, 'notifications.snapshot',
            {
                unreadCount,
                latest: latestNotifications
            }
        );

        if (latestId > lastNotificationId)
        {
            const newNotifications = latestNotifications
                .filter((notification) => notification.id > lastNotificationId)
                .sort((a, b) => a.id - b.id);

            for (const notification of newNotifications)
            {
                writeSse(res, 'notifications.created',
                    {
                        notification
                    }
                );
            }

            lastNotificationId = latestId;
        }
    };

    await sendSnapshot();

    const heartbeat = setInterval(function ()
    {
        writeSse(res, 'heartbeat',
            {
                timestamp: new Date().toISOString()
            }
        );
    }, 25000);

    const interval = setInterval(function ()
    {
        sendSnapshot().catch(function (error)
        {
            writeSse(res, 'error',
                {
                    message: error instanceof Error ? error.message : 'Notification stream error'
                }
            );
        });
    }, 5000);

    req.on('close', function ()
    {
        clearInterval(interval);
        clearInterval(heartbeat);
        res.end();
    });
}

export {
    notificationStreamController
};
