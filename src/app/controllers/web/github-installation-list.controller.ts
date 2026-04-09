import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { listGithubInstallations, getGithubInstallationSummary } from '../../../modules/github/github-admin.service';

async function githubInstallationListController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const installations = await listGithubInstallations();
        const summary = await getGithubInstallationSummary();

        return res.status(200).json(
            {
                message: 'GitHub installations fetched successfully',
                data:
                {
                    summary,
                    count: installations.length,
                    installations
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

        return next(new AppError('Failed to fetch GitHub installations', 500));
    }
}

export {
    githubInstallationListController
};
