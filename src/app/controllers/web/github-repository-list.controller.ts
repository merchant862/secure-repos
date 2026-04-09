import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { listRepositoriesForGithubInstallation } from '../../../modules/github/github-repository.service';

async function githubRepositoryListController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const rawGithubInstallationPrimaryId =
            req.query.githubInstallationPrimaryId
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

        const repositories = await listRepositoriesForGithubInstallation(githubInstallationPrimaryId);

        return res.status(200).json(
            {
                message: 'Repositories fetched successfully',
                data:
                {
                    githubInstallationPrimaryId,
                    count: repositories.length,
                    repositories
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

        return next(new AppError('Failed to fetch repositories', 500));
    }
}

export {
    githubRepositoryListController
};
