import { Request, Response } from 'express';

import {
    createPricingPlan,
    deletePricingPlan,
    listActivePricingPlans,
    listAllPricingPlans,
    PricingPlanInput,
    updatePricingPlan
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

async function listAdminPricingPlansController(req: Request, res: Response)
{
    const plans = await listAllPricingPlans();

    return res.json(
        {
            data: plans
        }
    );
}

async function createAdminPricingPlanController(req: Request, res: Response)
{
    try
    {
        const plan = await createPricingPlan(req.body as PricingPlanInput);

        return res.status(201).json(
            {
                message: 'Pricing plan created',
                data: plan
            }
        );
    }
    catch (error)
    {
        return res.status(400).json(
            {
                message: error instanceof Error ? error.message : 'Invalid pricing plan payload'
            }
        );
    }
}

async function updateAdminPricingPlanController(req: Request, res: Response)
{
    const planId = Number(req.params.planId);

    if (!Number.isFinite(planId))
    {
        return res.status(400).json(
            {
                message: 'Invalid pricing plan id'
            }
        );
    }

    try
    {
        const plan = await updatePricingPlan(planId, req.body as PricingPlanInput);

        if (!plan)
        {
            return res.status(404).json(
                {
                    message: 'Pricing plan not found'
                }
            );
        }

        return res.json(
            {
                message: 'Pricing plan updated',
                data: plan
            }
        );
    }
    catch (error)
    {
        return res.status(400).json(
            {
                message: error instanceof Error ? error.message : 'Invalid pricing plan payload'
            }
        );
    }
}

async function deactivateAdminPricingPlanController(req: Request, res: Response)
{
    const planId = Number(req.params.planId);

    if (!Number.isFinite(planId))
    {
        return res.status(400).json(
            {
                message: 'Invalid pricing plan id'
            }
        );
    }

    try
    {
        const plan = await deletePricingPlan(planId);

        if (!plan)
        {
            return res.status(404).json(
                {
                    message: 'Pricing plan not found'
                }
            );
        }

        return res.json(
            {
                message: 'Pricing plan deleted',
                data: plan
            }
        );
    }
    catch (error)
    {
        return res.status(400).json(
            {
                message: 'Pricing plan could not be deleted. Remove assigned subscriptions first.'
            }
        );
    }
}

export {
    listPublicPricingPlansController,
    listAdminPricingPlansController,
    createAdminPricingPlanController,
    updateAdminPricingPlanController,
    deactivateAdminPricingPlanController
};
