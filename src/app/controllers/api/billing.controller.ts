import { Response } from 'express';

import { PricingPlan, PricingPlanFeature, TenantSubscription } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { cancelTenantSubscription, createTenantPaymentMethodUpdateLink } from '../../services/billing.service';
import { createCheckoutToken, getPaddleCustomerPaymentMethodSummary, syncPaddleCheckoutCompletion, syncPaddleSubscriptionByCustomerEmail } from '../../services/paddle.service';
import { entitlementsForPlan } from '../../services/plan-limit.service';

async function getUserBillingController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const subscription = await TenantSubscription.findOne(
        {
            where: { tenantId: user.tenantId },
            include:
            [
                {
                    model: PricingPlan,
                    as: 'pricingPlan',
                    include:
                    [
                        {
                            model: PricingPlanFeature,
                            as: 'features'
                        }
                    ]
                }
            ]
        }
    );
    const selectedPlan = subscription
        ? (subscription.get('pricingPlan') as PricingPlan | undefined ?? await PricingPlan.findByPk(
            subscription.pricingPlanId,
            {
                include:
                [
                    {
                        model: PricingPlanFeature,
                        as: 'features'
                    }
                ]
            }
        ))
        : null;
    const pendingPlan = subscription?.pendingPricingPlanId ? await PricingPlan.findByPk(
        subscription.pendingPricingPlanId,
        {
            include:
            [
                {
                    model: PricingPlanFeature,
                    as: 'features'
                }
            ]
        }
    ) : null;
    const checkoutToken = selectedPlan ? createCheckoutToken(selectedPlan.slug) : null;
    let paymentMethod = null;
    let paymentMethodError = null;

    if (subscription?.provider === 'paddle' && subscription.providerCustomerId)
    {
        try
        {
            paymentMethod = await getPaddleCustomerPaymentMethodSummary(subscription.providerCustomerId);
        }
        catch (error)
        {
            paymentMethodError = error instanceof Error ? error.message : 'Payment method could not be loaded';
        }
    }

    return res.json(
        {
            data:
            {
                subscription,
                selectedPlan,
                pendingPlan,
                entitlements: entitlementsForPlan(selectedPlan),
                checkoutToken,
                paymentMethod,
                paymentMethodError
            }
        }
    );
}

async function cancelUserSubscriptionController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.role !== 'owner')
    {
        return res.status(403).json({ message: 'Only the workspace owner can cancel the subscription' });
    }

    try
    {
        const subscription = await cancelTenantSubscription(user.tenantId, 'owner');

        return res.json(
            {
                message: 'Subscription cancelled',
                data: subscription
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Subscription could not be cancelled' });
    }
}

async function createUserPaymentMethodUpdateController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.role !== 'owner')
    {
        return res.status(403).json({ message: 'Only the workspace owner can update the payment method' });
    }

    try
    {
        const updateLink = await createTenantPaymentMethodUpdateLink(
            {
                tenantId: user.tenantId,
                userId: user.id,
                ipAddress: req.ip
            }
        );

        return res.json(
            {
                message: 'Payment method update link created',
                data: updateLink
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Payment method update link could not be created' });
    }
}

async function syncUserPaddleCheckoutController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try
    {
        const subscription = req.body?.recoverByEmail
            ? await syncPaddleSubscriptionByCustomerEmail(user.tenantId, user.email)
            : await syncPaddleCheckoutCompletion(user.tenantId, req.body ?? {});

        return res.json(
            {
                message: 'Paddle checkout synced',
                data:
                {
                    subscription
                }
            }
        );
    }
    catch (error)
    {
        return res.status(422).json({ message: error instanceof Error ? error.message : 'Paddle checkout could not be synced' });
    }
}

export {
    getUserBillingController,
    cancelUserSubscriptionController,
    createUserPaymentMethodUpdateController,
    syncUserPaddleCheckoutController
};
