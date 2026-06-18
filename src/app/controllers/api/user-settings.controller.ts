import { Response } from 'express';
import { Op } from 'sequelize';

import { AuditLog, IgnoreRule, InAppNotification, NotificationSetting, SecurityScoreSnapshot } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { markNotificationRead } from '../../services/in-app-notification.service';
import { recordAuditLog } from '../../services/audit.service';
import { buildTenantJsonReport } from '../../services/report-export.service';

async function getNotificationSettingsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const [settings] = await NotificationSetting.findOrCreate(
        {
            where: { tenantId: user.tenantId },
            defaults: { tenantId: user.tenantId }
        }
    );

    return res.json({ data: settings });
}

async function updateNotificationSettingsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const [settings] = await NotificationSetting.findOrCreate(
        {
            where: { tenantId: user.tenantId },
            defaults: { tenantId: user.tenantId }
        }
    );

    await settings.update(
        {
            instantCritical: req.body.instantCritical ?? settings.instantCritical,
            instantHigh: req.body.instantHigh ?? settings.instantHigh,
            dailyDigest: req.body.dailyDigest ?? settings.dailyDigest,
            weeklyReport: req.body.weeklyReport ?? settings.weeklyReport,
            emailRecipients: req.body.emailRecipients ?? settings.emailRecipients
        }
    );

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'notification_settings.updated',
            entityType: 'notification_settings',
            entityId: String(settings.id)
        }
    );

    return res.json({ message: 'Notification settings updated', data: settings });
}

async function listIgnoreRulesController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const rules = await IgnoreRule.findAll({ where: { tenantId: user.tenantId }, order: [['createdAt', 'DESC']] });
    return res.json({ data: rules });
}

async function createIgnoreRuleController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const ruleId = typeof req.body.ruleId === 'string' ? req.body.ruleId.trim() : '';
    const filePattern = typeof req.body.filePattern === 'string' ? req.body.filePattern.trim() : '';

    if (!ruleId && !filePattern)
    {
        return res.status(400).json({ message: 'ruleId or filePattern is required' });
    }

    const rule = await IgnoreRule.create(
        {
            tenantId: user.tenantId,
            createdByUserId: user.id,
            ruleId: ruleId || null,
            filePattern: filePattern || null,
            reason: req.body.reason ?? null,
            isActive: true
        }
    );

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'ignore_rule.created',
            entityType: 'ignore_rule',
            entityId: String(rule.id),
            metadata: { ruleId: rule.ruleId, filePattern: rule.filePattern }
        }
    );

    return res.status(201).json({ message: 'Ignore rule created', data: rule });
}

async function deactivateIgnoreRuleController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const ruleId = Number(req.params.ruleId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const rule = await IgnoreRule.findOne({ where: { id: ruleId, tenantId: user.tenantId } });

    if (!rule)
    {
        return res.status(404).json({ message: 'Ignore rule not found' });
    }

    await rule.update({ isActive: false });
    await recordAuditLog({ tenantId: user.tenantId, userId: user.id, action: 'ignore_rule.deactivated', entityType: 'ignore_rule', entityId: String(rule.id) });

    return res.json({ message: 'Ignore rule deactivated', data: rule });
}

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

async function exportReportController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { getTenantRepositoryIds } = await import('./user-security.controller');
    const report = await buildTenantJsonReport(await getTenantRepositoryIds(user.tenantId));

    return res.json({ data: report });
}

export {
    getNotificationSettingsController,
    updateNotificationSettingsController,
    listIgnoreRulesController,
    createIgnoreRuleController,
    deactivateIgnoreRuleController,
    listNotificationsController,
    markNotificationReadController,
    listAuditLogsController,
    getSecurityTrendController,
    exportReportController
};
