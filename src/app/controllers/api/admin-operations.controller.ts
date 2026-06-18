import { Request, Response } from 'express';
import { Op } from 'sequelize';

import { CodeHostConnection, Finding, PricingPlan, Repository, Scan, Tenant, TenantSubscription } from '../../../db/models';
import { assignTenantPlan } from '../../services/plan-limit.service';
import { enqueueRepositoryScan } from '../../services/scan.service';
import { cancelTenantSubscription } from '../../services/billing.service';

function paginationFromRequest(req: Request)
{
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const cursor = Number(req.query.cursor);

    return {
        limit,
        cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : null
    };
}

function nextCursor<T extends { id: number }>(rows: T[], limit: number)
{
    if (rows.length <= limit)
    {
        return null;
    }

    return rows[limit - 1].id;
}

async function getAdminOverviewController(req: Request, res: Response)
{
    const [tenantCount, planCount, activeSubscriptions] = await Promise.all(
        [
            Tenant.count(),
            PricingPlan.count({ where: { isActive: true } }),
            TenantSubscription.findAll(
                {
                    where:
                    {
                        status: 'active'
                    },
                    include:
                    [
                        {
                            model: PricingPlan,
                            as: 'pricingPlan'
                        }
                    ]
                }
            )
        ]
    );
    const estimatedMrrCents = activeSubscriptions.reduce(function (total, subscription)
    {
        const plan = subscription.get('pricingPlan') as PricingPlan | undefined;

        return total + Number(plan?.priceMonthlyCents ?? 0);
    }, 0);

    return res.json(
        {
            data:
            {
                tenants: tenantCount,
                plans: planCount,
                estimatedMrrCents,
                estimatedMrrCurrency: 'USD'
            }
        }
    );
}

async function listTenantsController(req: Request, res: Response)
{
    const pagination = paginationFromRequest(req);
    const tenants = await Tenant.findAll(
        {
            where: pagination.cursor
                ? {
                    id:
                    {
                        [Op.lt]: pagination.cursor
                    }
                }
                : undefined,
            include:
            [
                {
                    model: TenantSubscription,
                    as: 'subscription',
                    include:
                    [
                        {
                            model: PricingPlan,
                            as: 'pricingPlan'
                        }
                    ]
                },
                {
                    model: CodeHostConnection,
                    as: 'codeHostConnections'
                }
            ],
            order: [['id', 'DESC']],
            limit: pagination.limit + 1
        }
    );
    const total = await Tenant.count();

    return res.json(
        {
            data: tenants.slice(0, pagination.limit),
            pagination:
            {
                limit: pagination.limit,
                nextCursor: nextCursor(tenants, pagination.limit)
            },
            total
        }
    );
}

async function assignTenantPlanController(req: Request, res: Response)
{
    const tenantId = Number(req.params.tenantId);
    const pricingPlanId = Number(req.body.pricingPlanId);
    const status = typeof req.body.status === 'string' ? req.body.status : 'pending';

    if (!Number.isFinite(tenantId) || !Number.isFinite(pricingPlanId))
    {
        return res.status(400).json({ message: 'Invalid tenant or pricing plan id' });
    }

    const subscription = await assignTenantPlan(tenantId, pricingPlanId, status);

    return res.json(
        {
            message: 'Tenant plan assigned',
            data: subscription
        }
    );
}

async function cancelTenantSubscriptionController(req: Request, res: Response)
{
    const tenantId = Number(req.params.tenantId);

    if (!Number.isFinite(tenantId))
    {
        return res.status(400).json({ message: 'Invalid tenant id' });
    }

    try
    {
        const subscription = await cancelTenantSubscription(tenantId, 'admin');

        return res.json(
            {
                message: 'Tenant subscription cancelled',
                data: subscription
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Subscription could not be cancelled' });
    }
}

async function listAdminScansController(req: Request, res: Response)
{
    const pagination = paginationFromRequest(req);
    const scans = await Scan.findAll(
        {
            where: pagination.cursor
                ? {
                    id:
                    {
                        [Op.lt]: pagination.cursor
                    }
                }
                : undefined,
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ],
            order: [['id', 'DESC']],
            limit: pagination.limit + 1
        }
    );
    const total = await Scan.count();

    return res.json(
        {
            data: scans.slice(0, pagination.limit),
            pagination:
            {
                limit: pagination.limit,
                nextCursor: nextCursor(scans, pagination.limit)
            },
            total
        }
    );
}

async function retryScanController(req: Request, res: Response)
{
    const scanId = Number(req.params.scanId);

    if (!Number.isFinite(scanId))
    {
        return res.status(400).json({ message: 'Invalid scan id' });
    }

    const scan = await Scan.findByPk(scanId);

    if (!scan)
    {
        return res.status(404).json({ message: 'Scan not found' });
    }

    const retry = await enqueueRepositoryScan(scan.repositoryId, 'manual_retry');

    return res.status(201).json(
        {
            message: 'Retry scan queued',
            data: retry
        }
    );
}

async function deactivateRepositoryController(req: Request, res: Response)
{
    const repositoryId = Number(req.params.repositoryId);

    if (!Number.isFinite(repositoryId))
    {
        return res.status(400).json({ message: 'Invalid repository id' });
    }

    const repository = await Repository.findByPk(repositoryId);

    if (!repository)
    {
        return res.status(404).json({ message: 'Repository not found' });
    }

    await repository.update({ isActive: false });

    return res.json(
        {
            message: 'Repository deactivated',
            data: repository
        }
    );
}

async function listCriticalFindingsController(req: Request, res: Response)
{
    const pagination = paginationFromRequest(req);
    const where =
    {
        status: 'open',
        severity: ['critical', 'high'],
        ...(pagination.cursor
            ? {
                id:
                {
                    [Op.lt]: pagination.cursor
                }
            }
            : {})
    };
    const findings = await Finding.findAll(
        {
            where,
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ],
            order: [['id', 'DESC']],
            limit: pagination.limit + 1
        }
    );
    const total = await Finding.count(
        {
            where:
            {
                status: 'open',
                severity: ['critical', 'high']
            }
        }
    );

    return res.json(
        {
            data: findings.slice(0, pagination.limit),
            pagination:
            {
                limit: pagination.limit,
                nextCursor: nextCursor(findings, pagination.limit)
            },
            total
        }
    );
}

export {
    getAdminOverviewController,
    listTenantsController,
    assignTenantPlanController,
    cancelTenantSubscriptionController,
    listAdminScansController,
    retryScanController,
    deactivateRepositoryController,
    listCriticalFindingsController
};
