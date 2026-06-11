import { PricingPlan, PricingPlanFeature } from '../../db/models';

type PricingPlanFeatureInput =
{
    label: string;
    isIncluded?: boolean;
    sortOrder?: number;
};

type PricingPlanInput =
{
    name?: string;
    slug?: string;
    description?: string | null;
    priceMonthlyCents?: number;
    currency?: string;
    repositoryLimit?: number | null;
    teamMemberLimit?: number | null;
    scanSchedule?: string;
    isHighlighted?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    ctaLabel?: string;
    features?: PricingPlanFeatureInput[];
};

function pricingPlanInclude()
{
    return [
        {
            model: PricingPlanFeature,
            as: 'features'
        }
    ];
}

async function listActivePricingPlans()
{
    return PricingPlan.findAll(
        {
            where:
            {
                isActive: true
            },
            include: pricingPlanInclude(),
            order:
            [
                ['sortOrder', 'ASC'],
                [{ model: PricingPlanFeature, as: 'features' }, 'sortOrder', 'ASC']
            ]
        }
    );
}

async function listAllPricingPlans()
{
    return PricingPlan.findAll(
        {
            include: pricingPlanInclude(),
            order:
            [
                ['sortOrder', 'ASC'],
                [{ model: PricingPlanFeature, as: 'features' }, 'sortOrder', 'ASC']
            ]
        }
    );
}

async function clearHighlightedPlanExcept(planId: number)
{
    await PricingPlan.update(
        {
            isHighlighted: false
        },
        {
            where:
            {
                isHighlighted: true
            }
        }
    );

    await PricingPlan.update(
        {
            isHighlighted: true
        },
        {
            where:
            {
                id: planId
            }
        }
    );
}

async function replacePlanFeatures(planId: number, features: PricingPlanFeatureInput[])
{
    await PricingPlanFeature.destroy(
        {
            where:
            {
                pricingPlanId: planId
            }
        }
    );

    if (features.length === 0)
    {
        return;
    }

    await PricingPlanFeature.bulkCreate(
        features.map(function (feature, index)
        {
            return {
                pricingPlanId: planId,
                label: feature.label,
                isIncluded: feature.isIncluded ?? true,
                sortOrder: feature.sortOrder ?? (index + 1) * 10
            };
        })
    );
}

async function createPricingPlan(input: PricingPlanInput)
{
    if (!input.name || !input.slug || input.priceMonthlyCents === undefined)
    {
        throw new Error('name, slug, and priceMonthlyCents are required');
    }

    const plan = await PricingPlan.create(
        {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            priceMonthlyCents: input.priceMonthlyCents,
            currency: input.currency ?? 'USD',
            repositoryLimit: input.repositoryLimit ?? null,
            teamMemberLimit: input.teamMemberLimit ?? null,
            scanSchedule: input.scanSchedule ?? 'daily',
            isHighlighted: false,
            isActive: input.isActive ?? true,
            sortOrder: input.sortOrder ?? 0,
            ctaLabel: input.ctaLabel ?? 'Choose plan'
        }
    );

    await replacePlanFeatures(plan.id, input.features ?? []);

    if (input.isHighlighted)
    {
        await clearHighlightedPlanExcept(plan.id);
    }

    return PricingPlan.findByPk(plan.id, { include: pricingPlanInclude() });
}

async function updatePricingPlan(planId: number, input: PricingPlanInput)
{
    const plan = await PricingPlan.findByPk(planId);

    if (!plan)
    {
        return null;
    }

    await plan.update(
        {
            name: input.name ?? plan.name,
            slug: input.slug ?? plan.slug,
            description: input.description === undefined ? plan.description : input.description,
            priceMonthlyCents: input.priceMonthlyCents ?? plan.priceMonthlyCents,
            currency: input.currency ?? plan.currency,
            repositoryLimit: input.repositoryLimit === undefined ? plan.repositoryLimit : input.repositoryLimit,
            teamMemberLimit: input.teamMemberLimit === undefined ? plan.teamMemberLimit : input.teamMemberLimit,
            scanSchedule: input.scanSchedule ?? plan.scanSchedule,
            isActive: input.isActive ?? plan.isActive,
            sortOrder: input.sortOrder ?? plan.sortOrder,
            ctaLabel: input.ctaLabel ?? plan.ctaLabel
        }
    );

    if (input.features)
    {
        await replacePlanFeatures(plan.id, input.features);
    }

    if (input.isHighlighted === true)
    {
        await clearHighlightedPlanExcept(plan.id);
    }
    else if (input.isHighlighted === false)
    {
        await plan.update({ isHighlighted: false });
    }

    return PricingPlan.findByPk(plan.id, { include: pricingPlanInclude() });
}

async function deactivatePricingPlan(planId: number)
{
    const plan = await PricingPlan.findByPk(planId);

    if (!plan)
    {
        return null;
    }

    await plan.update({ isActive: false, isHighlighted: false });
    return plan;
}

export type {
    PricingPlanInput
};

export {
    listActivePricingPlans,
    listAllPricingPlans,
    createPricingPlan,
    updatePricingPlan,
    deactivatePricingPlan
};
