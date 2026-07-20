import { Op } from 'sequelize';

import {
    AuditLog,
    Finding,
    GithubWebhookEvent,
    InAppNotification,
    LoginOtp,
    NotificationEvent,
    PricingPlan,
    ProviderOauthState,
    Scan,
    TenantSubscription,
    UserSession
} from '../../db/models';

let lastCleanupAt = 0;

function historyDaysForPlan(plan: PricingPlan)
{
    return Number(plan.findingHistoryDays ?? 90);
}

async function runRetentionCleanup(force = false)
{
    const now = Date.now();
    if (!force && lastCleanupAt > now - 24 * 60 * 60 * 1000) return false;
    lastCleanupAt = now;

    const subscriptions = await TenantSubscription.findAll(
        { include: [{ model: PricingPlan, as: 'pricingPlan' }] }
    );

    for (const subscription of subscriptions)
    {
        const plan = subscription.get('pricingPlan') as PricingPlan | undefined;
        if (!plan) continue;
        const cutoff = new Date(now - historyDaysForPlan(plan) * 24 * 60 * 60 * 1000);

        const oldScans = await Scan.findAll(
            { where: { tenantId: subscription.tenantId, createdAt: { [Op.lt]: cutoff } }, attributes: ['id'] }
        );
        for (const scan of oldScans)
        {
            if (await Finding.count({ where: { scanId: scan.id } }) === 0) await scan.destroy();
        }
    }

    await Promise.all(
        [
            LoginOtp.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } }),
            UserSession.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } }),
            ProviderOauthState.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } }),
            NotificationEvent.destroy({ where: { createdAt: { [Op.lt]: new Date(now - 180 * 24 * 60 * 60 * 1000) } } }),
            InAppNotification.destroy({ where: { createdAt: { [Op.lt]: new Date(now - 180 * 24 * 60 * 60 * 1000) } } }),
            GithubWebhookEvent.destroy({ where: { createdAt: { [Op.lt]: new Date(now - 90 * 24 * 60 * 60 * 1000) } } }),
            AuditLog.destroy({ where: { createdAt: { [Op.lt]: new Date(now - 365 * 24 * 60 * 60 * 1000) } } })
        ]
    );

    return true;
}

export { runRetentionCleanup };
