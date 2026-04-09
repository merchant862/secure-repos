import { NextFunction, Request, Response } from 'express';
import { generateGithubAppJwt, getGithubInstallationAccessToken } from '../../../modules/github/github.service';
import { AppError } from '../../errors/app-error';
import { getGithubConfig } from '../../../modules/github/github.config';

async function githubAuthDebugController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const installationId = String(req.query.installation_id ?? '');
        const githubConfig = getGithubConfig();

        if (!installationId)
        {
            const appJwt = await generateGithubAppJwt();

            return res.status(200).json(
                {
                    message: 'GitHub App JWT generated',
                    data:
                    {
                        jwtPresent: Boolean(appJwt),
                        appId: githubConfig.appId,
                        appSlug: githubConfig.appSlug,
                        privateKeyPath: githubConfig.privateKeyPath
                    }
                }
            );
        }

        const token = await getGithubInstallationAccessToken(installationId);

        return res.status(200).json(
            {
                message: 'GitHub installation access token generated',
                data:
                {
                    installationId,
                    tokenPresent: Boolean(token)
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

        return next(new AppError('GitHub auth debug failed', 500));
    }
}

export {
    githubAuthDebugController
};
