import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { getGithubConfig } from './github.config';
import { GithubConfig, GithubInstallationDetails } from './github.types';

let githubPrivateKeyCache: string | null = null;

function getGithubAppConfig(): GithubConfig
{
    return getGithubConfig();
}

function getGithubApiHeaders(authorization?: string)
{
    const headers: Record<string, string> =
    {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'micro-saas-app',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    if (authorization)
    {
        headers.Authorization = authorization;
    }

    return headers;
}

function buildGithubAppInstallUrl(state?: string): string
{
    const config = getGithubConfig();

    const baseUrl = `https://github.com/apps/${config.appSlug}/installations/new`;

    if (!state)
    {
        return baseUrl;
    }

    const searchParams = new URLSearchParams(
        {
            state
        }
    );

    return `${baseUrl}?${searchParams.toString()}`;
}

async function readGithubPrivateKey(): Promise<string>
{
    if (githubPrivateKeyCache)
    {
        return githubPrivateKeyCache;
    }

    const config = getGithubConfig();
    const privateKeyPath = path.resolve(config.privateKeyPath);

    try
    {
        githubPrivateKeyCache = await fs.readFile(privateKeyPath, 'utf8');
        return githubPrivateKeyCache;
    }
    catch (error)
    {
        throw new Error(`GitHub private key not found or unreadable at path: ${privateKeyPath}`);
    }
}

function clearGithubPrivateKeyCache()
{
    githubPrivateKeyCache = null;
}

async function generateGithubAppJwt(): Promise<string>
{
    const config = getGithubConfig();
    const privateKey = await readGithubPrivateKey();

    const now = Math.floor(Date.now() / 1000);

    return jwt.sign(
        {
            iat: now - 60,
            exp: now + (10 * 60),
            iss: config.appId
        },
        privateKey,
        {
            algorithm: 'RS256'
        }
    );
}

async function getGithubInstallationAccessToken(installationId: string): Promise<string>
{
    const appJwt = await generateGithubAppJwt();

    const response = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
            method: 'POST',
            headers: getGithubApiHeaders(`Bearer ${appJwt}`)
        }
    );

    if (!response.ok)
    {
        const errorBody = await response.text();

        throw new Error(`Failed to fetch installation access token: ${response.status} ${errorBody}`);
    }

    const data = await response.json() as { token?: string };

    if (!data.token)
    {
        throw new Error('GitHub installation access token missing in response');
    }

    return data.token;
}

async function getGithubInstallationDetails(installationId: string): Promise<GithubInstallationDetails>
{
    const appJwt = await generateGithubAppJwt();

    const response = await fetch(
        `https://api.github.com/app/installations/${installationId}`,
        {
            method: 'GET',
            headers: getGithubApiHeaders(`Bearer ${appJwt}`)
        }
    );

    if (!response.ok)
    {
        const errorBody = await response.text();

        throw new Error(`Failed to fetch installation details: ${response.status} ${errorBody}`);
    }

    const data = await response.json() as Partial<GithubInstallationDetails>;

    if (!data.account?.login || !data.account.type || typeof data.id !== 'number')
    {
        throw new Error('GitHub installation details response is missing required fields');
    }

    return {
        id: data.id,
        account:
        {
            login: data.account.login,
            type: data.account.type
        }
    };
}

function verifyGithubWebhookSignature(payload: Buffer, signature256?: string): boolean
{
    if (!signature256)
    {
        return false;
    }

    const config = getGithubConfig();

    const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(payload)
        .digest('hex');

    const expectedValue = `sha256=${expectedSignature}`;

    const providedBuffer = Buffer.from(signature256);
    const expectedBuffer = Buffer.from(expectedValue);

    if (providedBuffer.length !== expectedBuffer.length)
    {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export {
    getGithubAppConfig,
    buildGithubAppInstallUrl,
    readGithubPrivateKey,
    clearGithubPrivateKeyCache,
    generateGithubAppJwt,
    getGithubInstallationDetails,
    getGithubInstallationAccessToken,
    verifyGithubWebhookSignature,
    getGithubApiHeaders
};
