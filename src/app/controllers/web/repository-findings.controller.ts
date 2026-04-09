import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { listFindingsForRepository } from '../../../modules/security/finding.service';

async function repositoryFindingsController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const repositoryId = Number(req.params.repositoryId);

        if (Number.isNaN(repositoryId) || repositoryId <= 0)
        {
            return res.status(400).json(
                {
                    message: 'Invalid repository_id'
                }
            );
        }

        const findings = await listFindingsForRepository(repositoryId);

        return res.status(200).json(
            {
                message: 'Repository findings fetched successfully',
                data:
                {
                    repositoryId,
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

        return next(new AppError('Failed to fetch repository findings', 500));
    }
}

export {
    repositoryFindingsController
};
