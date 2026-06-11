import { env } from '../../bootstrap/env';
import { TenantSubscription } from '../../db/models';
import { queueEmailEvent } from './notification.service';

async function cancelTenantSubscription(tenantId: number, cancelledBy: 'owner' | 'admin')
{
    const subscription = await TenantSubscription.findOne({ where: { tenantId } });

    if (!subscription)
    {
        throw new Error('Subscription not found');
    }

    await subscription.update(
        {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy,
            currentPeriodEndsAt: new Date()
        }
    );

    await queueEmailEvent(
        {
            tenantId,
            type: 'subscription_cancelled',
            subject: `${env.appName} subscription cancelled`,
            payload:
            {
                cancelledBy,
                cancelledAt: new Date().toISOString()
            }
        }
    );

    return subscription;
}

export {
    cancelTenantSubscription
};
