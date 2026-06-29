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

    console.log('github_install_return',
        {
            path: req.path,
            installationId: installationId ?? null,
            setupAction: setupAction ?? null,
            hasState: Boolean(state),
            hasCode: Boolean(code)
        });

    if (!installationId)
    {
        return res.redirect('/onboarding?github=cancelled');
    }

    if (state)
    {
        try
        {
            await assertProviderEnabled('github');
            const providerState = await verifyProviderState(state, 'github');
            const result = await syncGithubInstallationForTenant(providerState.tenantId, installationId);

            return res.redirect(`/onboarding?github=connected&installation_id=${encodeURIComponent(installationId)}&repositories=${result.repositories.length}`);
        }
        catch (error)
        {
            return res.redirect(`/onboarding?github=error&message=${encodeURIComponent(error instanceof Error ? error.message : 'Invalid GitHub installation state')}`);
        }
    }

    return res.redirect(`/onboarding?github=installed&installation_id=${encodeURIComponent(installationId)}&app_id=${encodeURIComponent(config.appId)}&setup_action=${encodeURIComponent(setupAction ?? '')}&code=${encodeURIComponent(code ?? '')}`);
}

export {
    githubInstallCallbackController
};
