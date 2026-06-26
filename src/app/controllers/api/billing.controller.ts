import { Response } from 'express';

import { PricingPlan, TenantSubscription } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { cancelTenantSubscription, changeTenantPlan, getTenantPlanChangeOptions } from '../../services/billing.service';
import { createCheckoutToken, syncPaddleCheckoutCompletion, syncPaddleSubscriptionByCustomerEmail } from '../../services/paddle.service';

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
                    as: 'pricingPlan'
                }
            ]
        }
    );
    const selectedPlan = subscription
        ? (subscription.get('pricingPlan') as PricingPlan | undefined ?? await PricingPlan.findByPk(subscription.pricingPlanId))
        : null;
    const pendingPlan = subscription?.pendingPricingPlanId ? await PricingPlan.findByPk(subscription.pendingPricingPlanId) : null;
    const checkoutToken = selectedPlan ? createCheckoutToken(selectedPlan.slug) : null;

    return res.json(
        {
            data:
            {
                subscription,
                selectedPlan,
                pendingPlan,
                checkoutToken
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

async function getUserPlanChangeOptionsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const options = await getTenantPlanChangeOptions(user.tenantId);

    return res.json(
        {
            data: options
        }
    );
}

async function changeUserPlanController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.role !== 'owner')
    {
        return res.status(403).json({ message: 'Only the workspace owner can change the subscription plan' });
    }

    try
    {
        const subscription = await changeTenantPlan(
            {
                tenantId: user.tenantId,
                userId: user.id,
                pricingPlanId: Number(req.body?.pricingPlanId),
                repositoryIds: Array.isArray(req.body?.repositoryIds) ? req.body.repositoryIds.map(Number) : [],
                ipAddress: req.ip
            }
        );

        return res.json(
            {
                message: 'Plan change submitted',
                data:
                {
                    subscription
                }
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Plan change could not be submitted' });
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
    getUserPlanChangeOptionsController,
    changeUserPlanController,
    syncUserPaddleCheckoutController
};
