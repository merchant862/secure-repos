import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { getSecuritySummary, listRecentFindings, runBulkSecurityScan } from '../../../modules/security/security-admin.service';

async function securityOverviewController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const rawTenantId = req.query.tenantId ?? req.query.tenant_id;
        const tenantId = Number(rawTenantId);

        if (Number.isNaN(tenantId) || tenantId <= 0)
        {
            return res.status(400).json(
                {
                    message: 'Invalid tenant_id'
                }
            );
        }

        const findings = await listRecentFindings(
            {
                tenantId
            },
            25
        );
        const summary = await getSecuritySummary(
            {
                tenantId
            }
        );

        return res.status(200).json(
            {
                message: 'Security overview fetched successfully',
                data:
                {
                    tenantId,
                    summary,
                    count: findings.length,
                    findings
                }
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            return next(new AppError(error.message, 500));
        }

        return next(new AppError('Failed to fetch security overview', 500));
    }
}

async function securityBulkScanController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const result = await runBulkSecurityScan();

        return res.status(200).json(
            {
                message: 'Bulk security scan completed',
                data: result
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            return next(new AppError(error.message, 500));
        }

        return next(new AppError('Bulk security scan failed', 500));
    }
}

export {
    securityOverviewController,
    securityBulkScanController
};
