import { env } from '../../bootstrap/env';
import { TenantSubscription } from '../../db/models';
import { recordAuditLog } from './audit.service';
import { queueEmailEvent } from './notification.service';
import { cancelPaddleSubscription, createPaddlePaymentMethodUpdateUrl } from './paddle.service';

type PaymentMethodUpdateInput = {
    tenantId: number;
    userId: number;
    ipAddress?: string | null;
};

const paymentMethodUpdateCooldownMs = 24 * 60 * 60 * 1000;

async function cancelTenantSubscription(tenantId: number, cancelledBy: 'owner' | 'system')
{
    const subscription = await TenantSubscription.findOne({ where: { tenantId } });

    if (!subscription)
    {
        throw new Error('Subscription not found');
    }

    if (subscription.provider === 'paddle' && subscription.providerSubscriptionId)
    {
        await cancelPaddleSubscription(subscription.providerSubscriptionId, 'next_billing_period');
    }

    const cancelledAt = new Date();

    await subscription.update(
        {
            status: 'cancelled',
            providerStatus: subscription.provider === 'paddle' ? 'cancelled' : subscription.providerStatus,
            cancelledAt,
            cancelledBy,
            currentPeriodEndsAt: subscription.currentPeriodEndsAt ?? cancelledAt
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
                cancelledAt: cancelledAt.toISOString()
            }
        }
    );

    return subscription;
}

async function createTenantPaymentMethodUpdateLink(input: PaymentMethodUpdateInput)
{
    const subscription = await TenantSubscription.findOne({ where: { tenantId: input.tenantId } });

    if (!subscription)
    {
        throw new Error('Subscription not found');
    }

    if (!['active', 'trialing', 'past_due'].includes(subscription.status))
    {
        throw new Error('Payment method updates are available after checkout is confirmed.');
    }

    if (subscription.provider !== 'paddle' || !subscription.providerSubscriptionId)
    {
        throw new Error('Paddle subscription is not linked yet.');
    }

    const now = new Date();
    const isPastDue = subscription.status === 'past_due';

    if (!isPastDue && subscription.lastPaymentMethodUpdateLinkAt)
    {
        const nextAllowedAt = new Date(subscription.lastPaymentMethodUpdateLinkAt.getTime() + paymentMethodUpdateCooldownMs);

        if (now < nextAllowedAt)
        {
            throw new Error(`Payment method updates are limited to once every 24 hours. Try again after ${nextAllowedAt.toISOString()}.`);
        }
    }

    const updateLink = await createPaddlePaymentMethodUpdateUrl(subscription.providerSubscriptionId);
    await subscription.update({ lastPaymentMethodUpdateLinkAt: now });
    await recordAuditLog(
        {
            tenantId: input.tenantId,
            userId: input.userId,
            action: 'billing.payment_method_update_link.created',
            entityType: 'tenant_subscription',
            entityId: String(subscription.id),
            ipAddress: input.ipAddress ?? null,
            metadata:
            {
                provider: 'paddle',
                providerSubscriptionId: subscription.providerSubscriptionId,
                transactionId: updateLink.transactionId,
                cooldownHours: 24,
                bypassedCooldown: isPastDue
            }
        }
    );

    return {
        url: updateLink.url,
        restrictedUntil: isPastDue ? null : new Date(now.getTime() + paymentMethodUpdateCooldownMs)
    };
}

export {
    cancelTenantSubscription,
    createTenantPaymentMethodUpdateLink
};
