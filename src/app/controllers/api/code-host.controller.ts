import { Response } from 'express';

import { TenantSubscription } from '../../../db/models';
import { buildGithubAppInstallUrl } from '../../../modules/github/github.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { createProviderState } from '../../services/provider-state.service';
import { assertProviderAvailableForPlan } from '../../services/provider-setting.service';
import { getTenantPlan } from '../../services/plan-limit.service';
import { env } from '../../../bootstrap/env';

const githubInstallStateCookie = 'securerepos_github_install_state';
const githubInstallStateMaxAgeMs = 10 * 60 * 1000;

function isGithubProvider(value: string)
{
    return value === 'github';
}

async function getProviderConnectUrlController(req: AuthenticatedRequest, res: Response)
{
    const provider = String(req.params.provider);
    const user = req.currentUser;

    if (!isGithubProvider(provider))
    {
        return res.status(400).json(
            {
                message: 'Unsupported provider'
            }
        );
    }

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try
    {
        const subscription = await TenantSubscription.findOne({ where: { tenantId: user.tenantId } });
        if (!subscription || subscription.status !== 'active')
        {
            throw new Error('Complete checkout before connecting GitHub');
        }

        const plan = await getTenantPlan(user.tenantId);
        if (!plan) throw new Error('An active pricing plan is required');
        await assertProviderAvailableForPlan(provider, plan.slug);
    }
    catch (error)
    {
        return res.status(403).json({ message: error instanceof Error ? error.message : 'Provider is disabled' });
    }

    const state = await createProviderState(
        {
            tenantId: user.tenantId,
            userId: user.id,
            provider
        }
    );
    res.cookie(githubInstallStateCookie, state,
        {
            httpOnly: true,
            sameSite: 'lax',
            secure: env.nodeEnv === 'production',
            maxAge: githubInstallStateMaxAgeMs,
            path: '/github/install'
        });

    return res.json(
        {
            data:
            {
                provider,
                state,
                url: buildGithubAppInstallUrl(state)
            }
        }
    );
}

export {
    getProviderConnectUrlController
};
