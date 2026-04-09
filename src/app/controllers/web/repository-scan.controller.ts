import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { runRepositorySecurityScan } from '../../../modules/security/security-scan.service';

async function repositoryScanController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const rawRepositoryId =
            req.body?.repositoryId
            ?? req.body?.repository_id
            ?? req.params.repositoryId;

        const repositoryId = Number(rawRepositoryId);

        if (Number.isNaN(repositoryId) || repositoryId <= 0)
        {
            return res.status(400).json(
                {
                    message: 'Invalid repository_id'
                }
            );
        }

        const result = await runRepositorySecurityScan(repositoryId);

        return res.status(200).json(
            {
                message: 'Repository security scan completed',
                data: result
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error && error.message.includes('Repository not found'))
        {
            return next(new AppError('Repository not found', 404));
        }

        if (error instanceof Error)
        {
            return next(new AppError(error.message, 500));
        }

        return next(new AppError('Repository security scan failed', 500));
    }
}

export {
    repositoryScanController
};
