import { Op } from 'sequelize';

import { PricingPlan, Repository, Scan, TenantSubscription } from '../../db/models';

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

async function assignTenantPlan(tenantId: number, pricingPlanId: number, status = 'pending')
{
    const existing = await TenantSubscription.findOne(
        {
            where:
            {
                tenantId
            }
        }
    );
    const trialEndsAt = status === 'trialing' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;

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

async function assertManualScanAllowed(tenantId: number, repositoryId: number)
{
    const activeScan = await Scan.findOne(
        {
            where:
            {
                repositoryId,
                status:
                {
                    [Op.in]: ['queued', 'running', 'retry']
                }
            }
        }
    );

    if (activeScan)
    {
        throw new Error('A scan is already queued or running for this repository.');
    }

    const plan = await getTenantPlan(tenantId);

    if (!plan)
    {
        return;
    }

    const cooldownMinutes = Number(plan.manualScanCooldownMinutes ?? 0);

    if (cooldownMinutes > 0)
    {
        const cooldownStart = new Date(Date.now() - cooldownMinutes * 60 * 1000);
        const recentScan = await Scan.findOne(
            {
                where:
                {
                    repositoryId,
                    triggerType: 'manual_user',
                    createdAt:
                    {
                        [Op.gte]: cooldownStart
                    }
                },
                order: [['createdAt', 'DESC']]
            }
        );

        if (recentScan)
        {
            throw new Error(`Please wait ${cooldownMinutes} minutes between manual scans for the same repository.`);
        }
    }

    if (plan.manualScanDailyLimit === null || plan.manualScanDailyLimit === undefined)
    {
        return;
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const manualScansToday = await Scan.count(
        {
            where:
            {
                tenantId,
                triggerType: 'manual_user',
                createdAt:
                {
                    [Op.gte]: dayStart
                }
            }
        }
    );

    if (manualScansToday >= plan.manualScanDailyLimit)
    {
        throw new Error(`Manual scan limit reached for today (${plan.manualScanDailyLimit} scans on ${plan.name}). Scheduled scans will continue automatically.`);
    }
}

export {
    getTenantPlan,
    assertRepositoryLimitAvailable,
    assertManualScanAllowed,
    assignTenantPlan
};
