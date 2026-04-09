import { NextFunction, Request, Response } from 'express';
import { syncRepositoriesForGithubInstallation } from '../../../modules/github/github-repository-sync.service';
import { AppError } from '../../errors/app-error';

async function githubRepositorySyncController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const rawGithubInstallationPrimaryId =
            req.body?.githubInstallationPrimaryId
            ?? req.body?.github_installation_primary_id
            ?? req.query.githubInstallationPrimaryId
            ?? req.query.github_installation_primary_id;

        const githubInstallationPrimaryId = Number(rawGithubInstallationPrimaryId);

        if (Number.isNaN(githubInstallationPrimaryId) || githubInstallationPrimaryId <= 0)
        {
            return res.status(400).json(
                {
                    message: 'Invalid github_installation_primary_id'
                }
            );
        }

        const result = await syncRepositoriesForGithubInstallation(githubInstallationPrimaryId);

        return res.status(200).json(
            {
                message: 'Repositories synced successfully',
                data: result
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error && error.message.includes('GitHub installation not found'))
        {
            return next(new AppError('GitHub installation not found', 404));
        }

        if (error instanceof Error)
        {
            return next(new AppError(error.message, 500));
        }

        return next(new AppError('Failed to sync repositories', 500));
    }
}

export {
    githubRepositorySyncController
};
