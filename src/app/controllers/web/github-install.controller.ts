import { NextFunction, Request, Response } from 'express';
import { GithubInstallCallbackQuery } from '../../../modules/github/github.types';
import { getGithubAppConfig } from '../../../modules/github/github.service';
import { processGithubInstallCallback } from '../../../modules/github/github-install-callback.service';
import { AppError } from '../../errors/app-error';

async function githubInstallCallbackController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const query = req.query as GithubInstallCallbackQuery;
        const config = getGithubAppConfig();

        const installationId = query.installation_id;
        const setupAction = query.setup_action;
        const state = query.state;
        const code = query.code;

        if (!installationId)
        {
            return res.status(400).json(
                {
                    message: 'Missing installation_id'
                }
            );
        }

        const tenantId = Number(req.query.tenant_id ?? 1);

        if (Number.isNaN(tenantId) || tenantId <= 0)
        {
            return res.status(400).json(
                {
                    message: 'Invalid tenant_id'
                }
            );
        }

        const result = await processGithubInstallCallback(
            {
                query,
                tenantId
            }
        );

        return res.status(200).json(
            {
                message: 'GitHub install callback received',
                data:
                {
                    appId: config.appId,
                    installationId,
                    setupAction: setupAction ?? null,
                    state: state ?? null,
                    code: code ?? null,
                    persisted:
                    {
                        id: result.installation.id,
                        tenantId: result.installation.tenantId,
                        githubInstallationId: result.installation.githubInstallationId,
                        githubAccountLogin: result.installation.githubAccountLogin,
                        githubAccountType: result.installation.githubAccountType
                    },
                    tenant:
                    {
                        id: result.tenant.id,
                        name: result.tenant.name,
                        slug: result.tenant.slug
                    }
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

        return next(new AppError('Failed to persist GitHub installation', 500));
    }
}

export {
    githubInstallCallbackController
};
