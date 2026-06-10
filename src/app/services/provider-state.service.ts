import crypto from 'crypto';

import { env } from '../../bootstrap/env';

type ProviderState =
{
    tenantId: number;
    userId: number;
    provider: string;
    nonce: string;
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

function createProviderState(input: Omit<ProviderState, 'nonce'>): string
{
    const payload = base64Url(JSON.stringify(
        {
            ...input,
            nonce: crypto.randomBytes(16).toString('hex')
        }
    ));

    return `${payload}.${sign(payload)}`;
}

function verifyProviderState(state: string, expectedProvider?: string): ProviderState
{
    const [payload, signature] = state.split('.');

    if (!payload || !signature || sign(payload) !== signature)
    {
        throw new Error('Invalid provider state');
    }

    const parsed = JSON.parse(fromBase64Url(payload).toString('utf8')) as ProviderState;

    if (expectedProvider && parsed.provider !== expectedProvider)
    {
        throw new Error('Provider state mismatch');
    }

    return parsed;
}

export {
    createProviderState,
    verifyProviderState
};
