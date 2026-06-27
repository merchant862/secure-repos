import { Response } from 'express';
import { Op } from 'sequelize';

import { AuditLog, InAppNotification, SecurityScoreSnapshot } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { markNotificationRead } from '../../services/in-app-notification.service';

async function listNotificationsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const cursor = Number(req.query.cursor);
    const where =
    {
        tenantId: user.tenantId,
        [Op.or]:
        [
            { userId: null },
            { userId: user.id }
        ],
        ...(Number.isFinite(cursor) && cursor > 0
            ? {
                id:
                {
                    [Op.lt]: cursor
                }
            }
            : {})
    };
    const notifications = await InAppNotification.findAll(
        {
            where,
            order: [['createdAt', 'DESC']],
            limit: limit + 1
        }
    );

    return res.json(
        {
            data: notifications.slice(0, limit),
            pagination:
            {
                limit,
                nextCursor: notifications.length > limit ? notifications[limit - 1].id : null
            }
        }
    );
}

async function markNotificationReadController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const notificationId = Number(req.params.notificationId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const notification = await markNotificationRead(notificationId, user);

    if (!notification)
    {
        return res.status(404).json({ message: 'Notification not found' });
    }

    return res.json({ message: 'Notification marked read', data: notification });
}

async function listAuditLogsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const logs = await AuditLog.findAll({ where: { tenantId: user.tenantId }, order: [['createdAt', 'DESC']], limit: 200 });
    return res.json({ data: logs });
}

async function getSecurityTrendController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const snapshots = await SecurityScoreSnapshot.findAll(
        {
            where: { tenantId: user.tenantId },
            order: [['capturedAt', 'DESC']],
            limit: 200
        }
    );

    return res.json({ data: snapshots });
}

export {
    listNotificationsController,
    markNotificationReadController,
    listAuditLogsController,
    getSecurityTrendController
};
