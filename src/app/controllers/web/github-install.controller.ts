import { Request, Response } from 'express';
import { GithubInstallCallbackQuery } from '../../../modules/github/github.types';
import { getGithubAppConfig } from '../../../modules/github/github.service';
import { syncGithubInstallationForTenant } from '../../services/github-sync.service';
import { verifyProviderState } from '../../services/provider-state.service';
import { assertProviderEnabled } from '../../services/provider-setting.service';

async function githubInstallCallbackController(req: Request, res: Response)
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

    if (state)
    {
        try
        {
            await assertProviderEnabled('github');
            const providerState = verifyProviderState(state, 'github');
            const result = await syncGithubInstallationForTenant(providerState.tenantId, installationId);

            return res.status(200).json(
                {
                    message: 'GitHub installation connected',
                    data:
                    {
                        appId: config.appId,
                        installationId,
                        setupAction: setupAction ?? null,
                        repositoriesSynced: result.repositories.length
                    }
                }
            );
        }
        catch (error)
        {
            return res.status(400).json(
                {
                    message: error instanceof Error ? error.message : 'Invalid GitHub installation state'
                }
            );
        }
    }

    return res.status(200).json(
        {
            message: 'GitHub install callback received',
            data:
            {
                appId: config.appId,
                installationId,
                setupAction: setupAction ?? null,
                state: state ?? null,
                code: code ?? null
            }
        }
    );
}

export {
    githubInstallCallbackController
};
