import { Response } from 'express';

import { buildGithubAppInstallUrl } from '../../../modules/github/github.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { createProviderState } from '../../services/provider-state.service';
import { assertProviderEnabled } from '../../services/provider-setting.service';

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
        await assertProviderEnabled(provider);
    }
    catch (error)
    {
        return res.status(403).json({ message: error instanceof Error ? error.message : 'Provider is disabled' });
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
                url: buildGithubAppInstallUrl(state)
            }
        }
    );
}

export {
    getProviderConnectUrlController
};
