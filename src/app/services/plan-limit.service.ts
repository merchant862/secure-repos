import { Op, Transaction } from 'sequelize';

import { PricingPlan, Repository, Scan, TenantSubscription } from '../../db/models';

async function getTenantPlan(tenantId: number, transaction?: Transaction)
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
            ],
            transaction
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
                isActive: true
            },
            order: [['sortOrder', 'ASC']],
            transaction
        }
    );
}

async function assertRepositoryLimitAvailable(tenantId: number, provider: string, externalRepositoryId: string, transaction?: Transaction)
{
    const existing = await Repository.findOne(
        {
            where:
            {
                provider,
                externalRepositoryId
            },
            transaction
        }
    );

    if (existing)
    {
        return;
    }

    const [plan, subscription] = await Promise.all(
        [
            getTenantPlan(tenantId, transaction),
            TenantSubscription.findOne({ where: { tenantId }, transaction })
        ]
    );

    if (!plan)
    {
        return;
    }
    const repositoryLimit = subscription?.status === 'trialing' ? 1 : plan.repositoryLimit;

    if (repositoryLimit === null)
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
            ],
            transaction
        }
    );

    if (activeRepositoryCount >= repositoryLimit)
    {
        throw new Error(subscription?.status === 'trialing'
            ? 'Security Preview is limited to one repository'
            : `Repository limit reached for ${plan.name} plan (${repositoryLimit} repositories)`);
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
    const subscription = await TenantSubscription.findOne({ where: { tenantId } });

    if (!subscription || !['active', 'trialing'].includes(subscription.status))
    {
        throw new Error('Complete checkout before starting a scan.');
    }

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

    if (subscription.status === 'trialing')
    {
        const previewScanCount = await Scan.count(
            {
                where:
                {
                    tenantId,
                    status: { [Op.in]: ['queued', 'running', 'retry', 'completed'] }
                }
            }
        );

        if (previewScanCount >= 1)
        {
            throw new Error('Your Security Preview includes one scan. Full scanning unlocks when the paid subscription starts.');
        }

        return 'preview' as const;
    }

    const plan = await getTenantPlan(tenantId);

    if (!plan)
    {
        return 'full' as const;
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
                    triggerType: { [Op.in]: ['manual_user', 'cli'] },
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
        return 'full' as const;
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const manualScansToday = await Scan.count(
        {
            where:
            {
                tenantId,
                triggerType: { [Op.in]: ['manual_user', 'cli'] },
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

    return 'full' as const;
}

export {
    getTenantPlan,
    assertRepositoryLimitAvailable,
    assertManualScanAllowed,
    assignTenantPlan
};
