import { PricingPlan, Repository, TenantSubscription } from '../../db/models';

async function getTenantPlan(tenantId: number)
{
    const subscription = await TenantSubscription.findOne(
        {
            where:
            {
                tenantId
            },
            include:
            [
                {
                    model: PricingPlan,
                    as: 'pricingPlan'
                }
            ]
        }
    );

    const pricingPlan = subscription?.get('pricingPlan') as PricingPlan | undefined;

    if (pricingPlan)
    {
        return pricingPlan;
    }

    return PricingPlan.findOne(
        {
            where:
            {
                slug: 'starter',
                isActive: true
            }
        }
    );
}

async function assertRepositoryLimitAvailable(tenantId: number, provider: string, externalRepositoryId: string)
{
    const existing = await Repository.findOne(
        {
            where:
            {
                provider,
                externalRepositoryId
            }
        }
    );

    if (existing)
    {
        return;
    }

    const plan = await getTenantPlan(tenantId);

    if (!plan || plan.repositoryLimit === null)
    {
        return;
    }

    const activeRepositoryCount = await Repository.count(
        {
            where:
            {
                isActive: true
            },
            include:
            [
                {
                    association: 'codeHostConnection',
                    required: true,
                    where:
                    {
                        tenantId
                    }
                }
            ]
        }
    );

    if (activeRepositoryCount >= plan.repositoryLimit)
    {
        throw new Error(`Repository limit reached for ${plan.name} plan (${plan.repositoryLimit} repositories)`);
    }
}

async function assignTenantPlan(tenantId: number, pricingPlanId: number, status = 'trialing')
{
    const existing = await TenantSubscription.findOne(
        {
            where:
            {
                tenantId
            }
        }
    );
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (existing)
    {
        return existing.update(
            {
                pricingPlanId,
                status,
                trialEndsAt
            }
        );
    }

    return TenantSubscription.create(
        {
            tenantId,
            pricingPlanId,
            status,
            trialEndsAt
        }
    );
}

export {
    getTenantPlan,
    assertRepositoryLimitAvailable,
    assignTenantPlan
};
