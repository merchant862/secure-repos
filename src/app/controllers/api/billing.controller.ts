import { Response } from 'express';

import { PricingPlan, TenantSubscription } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { cancelTenantSubscription } from '../../services/billing.service';

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

    return res.json({ data: { subscription } });
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

export {
    getUserBillingController,
    cancelUserSubscriptionController
};
