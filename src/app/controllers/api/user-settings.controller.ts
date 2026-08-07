import { Response } from 'express';
import { Op } from 'sequelize';

import { AlertChannel, AuditLog, InAppNotification, NotificationEvent, SecurityScoreSnapshot } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { createAlertChannel, deleteAlertChannel, listAlertChannels } from '../../services/alert-channel.service';
import { markNotificationRead } from '../../services/in-app-notification.service';
import { entitlementsForPlan, getTenantPlan } from '../../services/plan-limit.service';

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

async function listAlertChannelsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const [channels, plan] = await Promise.all(
        [
            listAlertChannels(user.tenantId),
            getTenantPlan(user.tenantId)
        ]
    );

    return res.json(
        {
            data: channels,
            meta:
            {
                alertChannels: entitlementsForPlan(plan)
            }
        }
    );
}

async function createAlertChannelController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try
    {
        const channel = await createAlertChannel(
            {
                tenantId: user.tenantId,
                provider: String(req.body.provider || ''),
                name: String(req.body.name || ''),
                webhookUrl: String(req.body.webhookUrl || ''),
                botToken: String(req.body.botToken || ''),
                chatId: String(req.body.chatId || ''),
                repositoryId: Number(req.body.repositoryId || 0)
            }
        );

        return res.status(201).json({ message: 'Alert channel connected', data: channel });
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Alert channel could not be connected' });
    }
}

async function deleteAlertChannelController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const channelId = Number(req.params.channelId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isFinite(channelId))
    {
        return res.status(400).json({ message: 'Invalid alert channel id' });
    }

    const deleted = await deleteAlertChannel(user.tenantId, channelId);

    if (!deleted)
    {
        return res.status(404).json({ message: 'Alert channel not found' });
    }

    return res.json({ message: 'Alert channel removed' });
}

async function testAlertChannelController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const channelId = Number(req.params.channelId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const channel = Number.isFinite(channelId)
        ? await AlertChannel.findOne({ where: { id: channelId, tenantId: user.tenantId, isActive: true } })
        : null;

    if (!channel)
    {
        return res.status(404).json({ message: 'Alert channel not found' });
    }

    await NotificationEvent.create(
        {
            tenantId: user.tenantId,
            type: 'security_alert',
            channel: channel.provider,
            status: 'queued',
            subject: 'SecureRepos test alert',
            payload:
            {
                repositoryFullName: 'secure-repos/test',
                alertChannelId: channel.id,
                alertChannelName: channel.name,
                findings:
                [
                    {
                        severity: 'high',
                        title: 'Test alert channel delivery',
                        filePath: 'settings',
                        lineNumber: null
                    }
                ]
            }
        }
    );

    return res.status(202).json({ message: 'Test alert queued. It will be delivered by the notification worker.' });
}

export {
    listNotificationsController,
    markNotificationReadController,
    listAuditLogsController,
    getSecurityTrendController,
    listAlertChannelsController,
    createAlertChannelController,
    deleteAlertChannelController,
    testAlertChannelController
};
