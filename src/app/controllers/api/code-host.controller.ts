import { Request, Response } from 'express';

import { buildProviderAuthUrl, CodeHostProvider } from '../../services/code-host-provider.service';
import { connectOAuthProvider } from '../../services/code-host-sync.service';
import { buildGithubAppInstallUrl } from '../../../modules/github/github.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { createProviderState, verifyProviderState } from '../../services/provider-state.service';

function isOAuthProvider(value: string): value is CodeHostProvider
{
    return value === 'github' || value === 'gitlab' || value === 'bitbucket';
}

function getProviderConnectUrlController(req: AuthenticatedRequest, res: Response)
{
    const provider = String(req.params.provider);
    const user = req.currentUser;

    if (!isOAuthProvider(provider))
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

    const state = createProviderState(
        {
            tenantId: user.tenantId,
            userId: user.id,
            provider
        }
    );

    return res.json(
        {
            data:
            {
                provider,
                state,
                url: provider === 'github' ? buildGithubAppInstallUrl(state) : buildProviderAuthUrl(provider, state)
            }
        }
    );
}

async function providerOAuthCallbackController(req: Request, res: Response)
{
    const provider = String(req.params.provider);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!isOAuthProvider(provider) || provider === 'github')
    {
        return res.status(400).json(
            {
                message: 'Unsupported provider'
            }
        );
    }

    if (!code)
    {
        return res.status(400).json(
            {
                message: 'Missing OAuth code'
            }
        );
    }

    let tenantId: number | undefined;

    if (state)
    {
        try
        {
            tenantId = verifyProviderState(state, provider).tenantId;
        }
        catch (error)
        {
            return res.status(400).json({ message: 'Invalid provider state' });
        }
    }

    const result = await connectOAuthProvider(provider, code, tenantId);

    return res.json(
        {
            message: `${provider} connected`,
            data:
            {
                connectionId: result.connection.id,
                repositoriesSynced: result.repositories.length
            }
        }
    );
}

export {
    getProviderConnectUrlController,
    providerOAuthCallbackController
};
