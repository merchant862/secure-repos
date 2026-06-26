import { env } from '../../bootstrap/env';
import { CodeHostConnection, PricingPlan, Repository, TenantSubscription } from '../../db/models';
import { sequelize } from '../../db/sequelize';
import { recordAuditLog } from './audit.service';
import { queueEmailEvent } from './notification.service';
import { cancelPaddleSubscription, getPaddlePriceId, updatePaddleSubscriptionPlan } from './paddle.service';

type PlanChangeInput = {
    tenantId: number;
    userId: number;
    pricingPlanId: number;
    repositoryIds: number[];
    ipAddress?: string | null;
};

function numericIds(value: number[])
{
    return Array.from(new Set(value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
}

async function getTenantConnectionIds(tenantId: number)
{
    const connections = await CodeHostConnection.findAll({ where: { tenantId } });
    return connections.map((connection) => connection.id);
}

async function getTenantPlanChangeOptions(tenantId: number)
{
    const [subscription, plans, connectionIds] = await Promise.all(
        [
            TenantSubscription.findOne({ where: { tenantId } }),
            PricingPlan.findAll({ where: { isActive: true }, order: [['sortOrder', 'ASC'], ['priceMonthlyCents', 'ASC']] }),
            getTenantConnectionIds(tenantId)
        ]
    );
    const repositories = connectionIds.length > 0
        ? await Repository.findAll(
            {
                where:
                {
                    codeHostConnectionId: connectionIds
                },
                order: [['isActive', 'DESC'], ['fullName', 'ASC']]
            }
        )
        : [];

    return {
        subscription,
        plans,
        repositories
    };
}

function getCycleStart(subscription: TenantSubscription)
{
    return subscription.currentPeriodStartsAt ?? subscription.updatedAt ?? subscription.createdAt;
}

function assertPlanChangeAllowed(subscription: TenantSubscription)
{
    if (subscription.pendingPricingPlanId)
    {
        throw new Error('A plan change is already scheduled for this billing cycle.');
    }

    if (subscription.planChangeCount > 0 && subscription.lastPlanChangedAt)
    {
        const cycleStart = getCycleStart(subscription);

        if (subscription.lastPlanChangedAt >= cycleStart)
        {
            throw new Error('Plan changes are limited to once per billing cycle after your first change.');
        }
    }
}

async function updateTenantRepositorySelection(tenantId: number, selectedRepositoryIds: number[])
{
    const connectionIds = await getTenantConnectionIds(tenantId);

    if (connectionIds.length === 0)
    {
        return { selectedCount: 0, changedCount: 0 };
    }

    const selectedIds = numericIds(selectedRepositoryIds);
    const tenantRepositories = await Repository.findAll({ where: { codeHostConnectionId: connectionIds } });
    const allowedIds = new Set(tenantRepositories.map((repository) => repository.id));
    const invalidIds = selectedIds.filter((id) => !allowedIds.has(id));

    if (invalidIds.length > 0)
    {
        throw new Error('Repository selection contains repositories outside this workspace.');
    }

    let changedCount = 0;
    const selectedSet = new Set(selectedIds);

    for (const repository of tenantRepositories)
    {
        const shouldBeActive = selectedSet.has(repository.id);

        if (repository.isActive !== shouldBeActive)
        {
            await repository.update({ isActive: shouldBeActive });
            changedCount += 1;
        }
    }

    return { selectedCount: selectedIds.length, changedCount };
}

async function assertTenantRepositorySelection(tenantId: number, selectedRepositoryIds: number[])
{
    const connectionIds = await getTenantConnectionIds(tenantId);
    const selectedIds = numericIds(selectedRepositoryIds);

    if (connectionIds.length === 0)
    {
        if (selectedIds.length > 0)
        {
            throw new Error('Repository selection contains repositories outside this workspace.');
        }

        return;
    }

    const tenantRepositories = await Repository.findAll({ where: { codeHostConnectionId: connectionIds }, attributes: ['id'] });
    const allowedIds = new Set(tenantRepositories.map((repository) => repository.id));
    const invalidIds = selectedIds.filter((id) => !allowedIds.has(id));

    if (invalidIds.length > 0)
    {
        throw new Error('Repository selection contains repositories outside this workspace.');
    }
}

function isUpgrade(currentPlan: PricingPlan, targetPlan: PricingPlan)
{
    return Number(targetPlan.priceMonthlyCents) > Number(currentPlan.priceMonthlyCents);
}

async function changeTenantPlan(input: PlanChangeInput)
{
    const selectedRepositoryIds = numericIds(input.repositoryIds);
    const subscription = await TenantSubscription.findOne({ where: { tenantId: input.tenantId } });

    if (!subscription)
    {
        throw new Error('Subscription not found');
    }

    if (subscription.status !== 'active')
    {
        throw new Error('Plan changes are available after checkout is confirmed.');
    }

    const [currentPlan, targetPlan] = await Promise.all(
        [
            PricingPlan.findByPk(subscription.pricingPlanId),
            PricingPlan.findOne({ where: { id: input.pricingPlanId, isActive: true } })
        ]
    );

    if (!currentPlan || !targetPlan)
    {
        throw new Error('Selected plan is not available');
    }

    if (currentPlan.id === targetPlan.id)
    {
        throw new Error('Select a different plan to change your subscription.');
    }

    assertPlanChangeAllowed(subscription);

    const targetLimit = targetPlan.repositoryLimit;

    if (targetLimit !== null && targetLimit !== undefined && selectedRepositoryIds.length > targetLimit)
    {
        throw new Error(`${targetPlan.name} allows ${targetLimit} active repositories. Select repositories to keep within that limit.`);
    }

    if (selectedRepositoryIds.length === 0 && targetLimit !== 0)
    {
        throw new Error('Select at least one repository for the new plan.');
    }

    const priceId = getPaddlePriceId(targetPlan.slug);

    if (subscription.provider !== 'paddle' || !subscription.providerSubscriptionId)
    {
        throw new Error('Paddle subscription is not linked yet.');
    }

    if (!priceId)
    {
        throw new Error(`Paddle price id is not configured for ${targetPlan.name}.`);
    }

    await assertTenantRepositorySelection(input.tenantId, selectedRepositoryIds);

    const upgrade = isUpgrade(currentPlan, targetPlan);
    const now = new Date();

    await updatePaddleSubscriptionPlan(
        subscription.providerSubscriptionId,
        priceId,
        upgrade ? 'prorated_immediately' : 'prorated_next_billing_period'
    );

    const result = await sequelize.transaction(async function ()
    {
        const repositoryUpdate = await updateTenantRepositorySelection(input.tenantId, selectedRepositoryIds);
        const updatedSubscription = await subscription.update(
            upgrade
                ? {
                    pricingPlanId: targetPlan.id,
                    pendingPricingPlanId: null,
                    pendingPlanChangeEffectiveAt: null,
                    lastPlanChangedAt: now,
                    planChangeCount: subscription.planChangeCount + 1,
                    providerPriceId: priceId
                }
                : {
                    pendingPricingPlanId: targetPlan.id,
                    pendingPlanChangeEffectiveAt: subscription.currentPeriodEndsAt ?? null,
                    lastPlanChangedAt: now,
                    planChangeCount: subscription.planChangeCount + 1,
                    providerPriceId: priceId
                }
        );

        await recordAuditLog(
            {
                tenantId: input.tenantId,
                userId: input.userId,
                action: upgrade ? 'subscription.plan_upgraded' : 'subscription.downgrade_scheduled',
                entityType: 'tenant_subscription',
                entityId: String(subscription.id),
                ipAddress: input.ipAddress ?? null,
                metadata:
                {
                    fromPlanId: currentPlan.id,
                    fromPlan: currentPlan.slug,
                    toPlanId: targetPlan.id,
                    toPlan: targetPlan.slug,
                    selectedRepositoryIds,
                    repositoryUpdate,
                    effectiveAt: upgrade ? now.toISOString() : updatedSubscription.pendingPlanChangeEffectiveAt?.toISOString() ?? null
                }
            }
        );

        return { subscription: updatedSubscription, repositoryUpdate };
    });

    await queueEmailEvent(
        {
            tenantId: input.tenantId,
            type: upgrade ? 'plan_upgraded' : 'downgrade_scheduled',
            subject: upgrade ? `${env.appName} plan upgraded` : `${env.appName} plan downgrade scheduled`,
            payload:
            {
                fromPlan: currentPlan.name,
                toPlan: targetPlan.name,
                effectiveAt: upgrade ? now.toISOString() : result.subscription.pendingPlanChangeEffectiveAt?.toISOString() ?? null,
                selectedRepositoryCount: selectedRepositoryIds.length
            }
        }
    );

    return result.subscription;
}

async function cancelTenantSubscription(tenantId: number, cancelledBy: 'owner' | 'admin')
{
    const subscription = await TenantSubscription.findOne({ where: { tenantId } });

    if (!subscription)
    {
        throw new Error('Subscription not found');
    }

    if (subscription.provider === 'paddle' && subscription.providerSubscriptionId)
    {
        await cancelPaddleSubscription(subscription.providerSubscriptionId, 'next_billing_period');
    }

    const cancelledAt = new Date();

    await subscription.update(
        {
            status: 'cancelled',
            providerStatus: subscription.provider === 'paddle' ? 'cancelled' : subscription.providerStatus,
            cancelledAt,
            cancelledBy,
            currentPeriodEndsAt: subscription.currentPeriodEndsAt ?? cancelledAt
        }
    );

    await queueEmailEvent(
        {
            tenantId,
            type: 'subscription_cancelled',
            subject: `${env.appName} subscription cancelled`,
            payload:
            {
                cancelledBy,
                cancelledAt: cancelledAt.toISOString()
            }
        }
    );

    return subscription;
}

export {
    cancelTenantSubscription,
    changeTenantPlan,
    getTenantPlanChangeOptions
};
