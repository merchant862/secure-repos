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
    manualScanDailyLimit?: number | null;
    manualScanCooldownMinutes?: number;
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

async function assertActivePlanLimit(planId?: number)
{
    const activePlans = await PricingPlan.findAll(
        {
            where:
            {
                isActive: true
            },
            attributes: ['id']
        }
    );
    const activePlanIds = activePlans.map((plan) => Number(plan.id));
    const isAlreadyActive = planId ? activePlanIds.includes(planId) : false;

    if (!isAlreadyActive && activePlanIds.length >= 2)
    {
        throw new Error('Only 2 active pricing packages are allowed.');
    }
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

    if (input.isActive !== false)
    {
        await assertActivePlanLimit();
    }

    const plan = await PricingPlan.create(
        {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            priceMonthlyCents: input.priceMonthlyCents,
            currency: input.currency ?? 'USD',
            repositoryLimit: input.repositoryLimit ?? null,
            manualScanDailyLimit: input.manualScanDailyLimit ?? null,
            manualScanCooldownMinutes: input.manualScanCooldownMinutes ?? 15,
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

    if (input.isActive === true && !plan.isActive)
    {
        await assertActivePlanLimit(plan.id);
    }

    await plan.update(
        {
            name: input.name ?? plan.name,
            slug: input.slug ?? plan.slug,
            description: input.description === undefined ? plan.description : input.description,
            priceMonthlyCents: input.priceMonthlyCents ?? plan.priceMonthlyCents,
            currency: input.currency ?? plan.currency,
            repositoryLimit: input.repositoryLimit === undefined ? plan.repositoryLimit : input.repositoryLimit,
            manualScanDailyLimit: input.manualScanDailyLimit === undefined ? plan.manualScanDailyLimit : input.manualScanDailyLimit,
            manualScanCooldownMinutes: input.manualScanCooldownMinutes ?? plan.manualScanCooldownMinutes,
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

async function deletePricingPlan(planId: number)
{
    const plan = await PricingPlan.findByPk(planId);

    if (!plan)
    {
        return null;
    }

    await replacePlanFeatures(plan.id, []);
    await plan.destroy();
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
    deletePricingPlan
};
