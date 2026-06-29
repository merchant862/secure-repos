import crypto from 'crypto';

import { Op } from 'sequelize';

import { CliAccessToken, TenantSubscription, User } from '../../db/models';

const maxExpiryDays = 30;
const maxActiveTokensPerUser = 1;
const lastUsedWriteIntervalMs = 15 * 60 * 1000;

function hashCliToken(token: string): string
{
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function assertCliSubscriptionActive(tenantId: number)
{
    const subscription = await TenantSubscription.findOne({ where: { tenantId } });

    if (!subscription || subscription.status !== 'active')
    {
        throw new Error('An active subscription is required for CLI access');
    }
}

async function createCliAccessToken(input: {
    tenantId: number;
    userId: number;
    name: string;
    expiresInDays: number;
})
{
    const name = String(input.name ?? '').trim();
    const expiresInDays = Number(input.expiresInDays);

    if (name.length < 2 || name.length > 100)
    {
        throw new Error('Token name must be between 2 and 100 characters');
    }

    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > maxExpiryDays)
    {
        throw new Error(`Token expiry must be between 1 and ${maxExpiryDays} days`);
    }

    await assertCliSubscriptionActive(input.tenantId);

    const activeTokenCount = await CliAccessToken.count(
        {
            where:
            {
                tenantId: input.tenantId,
                userId: input.userId,
                revokedAt: null,
                expiresAt: { [Op.gt]: new Date() }
            }
        }
    );

    if (activeTokenCount >= maxActiveTokensPerUser)
    {
        throw new Error('Revoke your active CLI token before creating another one');
    }

    const token = `srp_cli_${crypto.randomBytes(32).toString('base64url')}`;
    const accessToken = await CliAccessToken.create(
        {
            tenantId: input.tenantId,
            userId: input.userId,
            name,
            tokenHash: hashCliToken(token),
            tokenPrefix: token.slice(0, 16),
            tokenLastFour: token.slice(-4),
            expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        }
    );

    return { token, accessToken };
}

async function listCliAccessTokens(tenantId: number, userId: number)
{
    return CliAccessToken.findAll(
        {
            where: { tenantId, userId },
            attributes: { exclude: ['tokenHash'] },
            order: [['createdAt', 'DESC']],
            limit: 25
        }
    );
}

async function revokeCliAccessToken(tenantId: number, userId: number, tokenId: number)
{
    const accessToken = await CliAccessToken.findOne(
        {
            where:
            {
                id: tokenId,
                tenantId,
                userId
            }
        }
    );

    if (!accessToken)
    {
        return null;
    }

    if (!accessToken.revokedAt)
    {
        await accessToken.update({ revokedAt: new Date() });
    }

    return accessToken;
}

async function authenticateCliAccessToken(rawToken: string, ipAddress?: string)
{
    if (!/^srp_cli_[A-Za-z0-9_-]{40,60}$/.test(rawToken))
    {
        return null;
    }

    const accessToken = await CliAccessToken.findOne(
        {
            where:
            {
                tokenHash: hashCliToken(rawToken),
                revokedAt: null,
                expiresAt: { [Op.gt]: new Date() }
            }
        }
    );

    if (!accessToken)
    {
        return null;
    }

    const user = await User.findOne(
        {
            where:
            {
                id: accessToken.userId,
                tenantId: accessToken.tenantId,
                status: 'active'
            }
        }
    );

    if (!user)
    {
        return null;
    }

    try
    {
        await assertCliSubscriptionActive(accessToken.tenantId);
    }
    catch (error)
    {
        return null;
    }

    if (!accessToken.lastUsedAt || Date.now() - accessToken.lastUsedAt.getTime() >= lastUsedWriteIntervalMs)
    {
        await accessToken.update(
            {
                lastUsedAt: new Date(),
                lastUsedIp: ipAddress ?? null
            }
        );
    }

    return { accessToken, user };
}

export {
    authenticateCliAccessToken,
    createCliAccessToken,
    listCliAccessTokens,
    maxActiveTokensPerUser,
    maxExpiryDays,
    revokeCliAccessToken
};
