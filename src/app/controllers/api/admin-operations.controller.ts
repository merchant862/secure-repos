import { Request, Response } from 'express';

import { CodeHostConnection, Finding, PricingPlan, Repository, Scan, Tenant, TenantSubscription } from '../../../db/models';
import { assignTenantPlan } from '../../services/plan-limit.service';
import { enqueueRepositoryScan } from '../../services/scan.service';
import { cancelTenantSubscription } from '../../services/billing.service';

async function listTenantsController(req: Request, res: Response)
{
    const tenants = await Tenant.findAll(
        {
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
            order: [['createdAt', 'DESC']]
        }
    );

    return res.json({ data: tenants });
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
    const scans = await Scan.findAll(
        {
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 100
        }
    );

    return res.json({ data: scans });
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
    const findings = await Finding.findAll(
        {
            where:
            {
                status: 'open',
                severity: ['critical', 'high']
            },
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 200
        }
    );

    return res.json({ data: findings });
}

export {
    listTenantsController,
    assignTenantPlanController,
    cancelTenantSubscriptionController,
    listAdminScansController,
    retryScanController,
    deactivateRepositoryController,
    listCriticalFindingsController
};
