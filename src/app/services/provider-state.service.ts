import crypto from 'crypto';

import { env } from '../../bootstrap/env';
import { ProviderOauthState } from '../../db/models';

type ProviderState =
{
    tenantId: number;
    userId: number;
    provider: string;
    nonce: string;
    expiresAt: number;
};

function getStateSecret(): string
{
    return env.tokenEncryptionKey || env.githubWebhookSecret || env.adminApiToken;
}

function base64Url(value: Buffer | string): string
{
    return Buffer
        .from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function fromBase64Url(value: string): Buffer
{
    const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, '=');
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(value: string): string
{
    const secret = getStateSecret();

    if (!secret)
    {
        throw new Error('TOKEN_ENCRYPTION_KEY, GITHUB_WEBHOOK_SECRET, or ADMIN_API_TOKEN is required for provider state signing');
    }

    return base64Url(crypto.createHmac('sha256', secret).update(value).digest());
}

function hashNonce(nonce: string): string
{
    return crypto.createHash('sha256').update(nonce).digest('hex');
}

async function createProviderState(input: Omit<ProviderState, 'nonce' | 'expiresAt'>): Promise<string>
{
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const payload = base64Url(JSON.stringify(
        {
            ...input,
            nonce,
            expiresAt
        }
    ));

    await ProviderOauthState.create(
        {
            nonceHash: hashNonce(nonce),
            tenantId: input.tenantId,
            userId: input.userId,
            provider: input.provider,
            expiresAt: new Date(expiresAt)
        }
    );

    return `${payload}.${sign(payload)}`;
}

async function verifyProviderState(state: string, expectedProvider?: string): Promise<ProviderState>
{
    const [payload, signature] = state.split('.');
    const expectedSignature = payload ? sign(payload) : '';
    const providedBuffer = Buffer.from(signature ?? '');
    const expectedBuffer = Buffer.from(expectedSignature);

    if (!payload || !signature || providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer))
    {
        throw new Error('Invalid provider state');
    }

    const parsed = JSON.parse(fromBase64Url(payload).toString('utf8')) as ProviderState;

    if (expectedProvider && parsed.provider !== expectedProvider)
    {
        throw new Error('Provider state mismatch');
    }

    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now())
    {
        throw new Error('Provider state expired');
    }

    const [consumed] = await ProviderOauthState.update(
        { consumedAt: new Date() },
        {
            where:
            {
                nonceHash: hashNonce(parsed.nonce),
                tenantId: parsed.tenantId,
                userId: parsed.userId,
                provider: parsed.provider,
                consumedAt: null
            }
        }
    );

    if (consumed !== 1)
    {
        throw new Error('Provider state was already used or is invalid');
    }

    return parsed;
}

export {
    createProviderState,
    verifyProviderState
};
