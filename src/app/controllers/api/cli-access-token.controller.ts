import { Response } from 'express';

import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { recordAuditLog } from '../../services/audit.service';
import {
    createCliAccessToken,
    listCliAccessTokens,
    maxActiveTokensPerUser,
    maxExpiryDays,
    revokeCliAccessToken
} from '../../services/cli-access-token.service';

function serializeCliAccessToken(accessToken: {
    id: number;
    name: string;
    tokenPrefix: string;
    tokenLastFour: string;
    expiresAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
})
{
    return {
        id: accessToken.id,
        name: accessToken.name,
        tokenPrefix: accessToken.tokenPrefix,
        tokenLastFour: accessToken.tokenLastFour,
        expiresAt: accessToken.expiresAt,
        lastUsedAt: accessToken.lastUsedAt,
        revokedAt: accessToken.revokedAt,
        createdAt: accessToken.createdAt
    };
}

async function listUserCliAccessTokensController(req: AuthenticatedRequest, res: Response)
{
    res.setHeader('Cache-Control', 'no-store');
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const accessTokens = await listCliAccessTokens(user.tenantId, user.id);
    return res.json(
        {
            data: accessTokens.map(serializeCliAccessToken),
            meta: { maxExpiryDays, maxActiveTokens: maxActiveTokensPerUser }
        }
    );
}

async function createUserCliAccessTokenController(req: AuthenticatedRequest, res: Response)
{
    res.setHeader('Cache-Control', 'no-store');
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try
    {
        const created = await createCliAccessToken(
            {
                tenantId: user.tenantId,
                userId: user.id,
                name: req.body?.name,
                expiresInDays: Number(req.body?.expiresInDays)
            }
        );

        await recordAuditLog(
            {
                tenantId: user.tenantId,
                userId: user.id,
                action: 'cli.token_created',
                entityType: 'cli_access_token',
                entityId: String(created.accessToken.id),
                metadata:
                {
                    name: created.accessToken.name,
                    expiresAt: created.accessToken.expiresAt
                },
                ipAddress: req.ip
            }
        ).catch((error) => console.warn('CLI token creation audit log failed:', error));

        return res.status(201).json(
            {
                message: 'CLI access token created',
                data:
                {
                    token: created.token,
                    accessToken: serializeCliAccessToken(created.accessToken)
                }
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'CLI access token could not be created' });
    }
}

async function revokeUserCliAccessTokenController(req: AuthenticatedRequest, res: Response)
{
    res.setHeader('Cache-Control', 'no-store');
    const user = req.currentUser;
    const tokenId = Number(req.params.tokenId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isSafeInteger(tokenId) || tokenId < 1)
    {
        return res.status(400).json({ message: 'Invalid token id' });
    }

    const accessToken = await revokeCliAccessToken(user.tenantId, user.id, tokenId);

    if (!accessToken)
    {
        return res.status(404).json({ message: 'CLI access token not found' });
    }

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'cli.token_revoked',
            entityType: 'cli_access_token',
            entityId: String(accessToken.id),
            metadata: { name: accessToken.name },
            ipAddress: req.ip
        }
    ).catch((error) => console.warn('CLI token revocation audit log failed:', error));

    return res.json({ message: 'CLI access token revoked' });
}

export {
    createUserCliAccessTokenController,
    listUserCliAccessTokensController,
    revokeUserCliAccessTokenController
};
