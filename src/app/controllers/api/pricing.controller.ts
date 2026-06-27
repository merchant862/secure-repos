import { Request, Response } from 'express';

import {
    listActivePricingPlans,
} from '../../services/pricing.service';
import { createCheckoutToken } from '../../services/paddle.service';

async function listPublicPricingPlansController(req: Request, res: Response)
{
    const plans = await listActivePricingPlans();
    const serializedPlans = plans.map(function (plan)
    {
        const payload = plan.toJSON() as Record<string, unknown> & { slug: string };

        return {
            ...payload,
            checkoutToken: createCheckoutToken(payload.slug)
        };
    });

    return res.json(
        {
            data: serializedPlans
        }
    );
}

export {
    listPublicPricingPlansController
};
