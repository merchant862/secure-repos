import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

import { getGithubConfig } from './github.config';
import {
    GithubBlobResponse,
    GithubBranchResponse,
    GithubConfig,
    GithubDependabotAlertResponse,
    GithubInstallationRepositoriesResponse,
    GithubInstallationResponse,
    GithubCheckRunAnnotation,
    GithubCheckRunConclusion,
    GithubSecretScanningAlertResponse,
    GithubTreeResponse
} from './github.types';
import { env } from '../../bootstrap/env';

let githubPrivateKeyCache: string | null = null;

function getGithubAppConfig(): GithubConfig
{
    return getGithubConfig();
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

function base64Url(input: Buffer | string): string
{
    return Buffer
        .from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function createGithubAppJwt(): Promise<string>
{
    const config = getGithubConfig();
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify(
        {
            iat: now - 60,
            exp: now + 540,
            iss: config.appId
        }
    ));
    const unsignedToken = `${header}.${payload}`;
    const privateKey = await readGithubPrivateKey();
    const signer = crypto.createSign('RSA-SHA256');

    signer.update(unsignedToken);
    signer.end();

    return `${unsignedToken}.${base64Url(signer.sign(privateKey))}`;
}

function githubRequest<T>(pathName: string, options: { method?: string; token?: string; body?: object } = {}): Promise<T>
{
    return new Promise(function (resolve, reject)
    {
        const body = options.body ? JSON.stringify(options.body) : undefined;
        const headers: Record<string, string | number> =
        {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'micro-saas-security-platform',
            'X-GitHub-Api-Version': '2022-11-28'
        };

        if (options.token)
        {
            headers.Authorization = `Bearer ${options.token}`;
        }

        if (body)
        {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }

        const request = https.request(
            {
                hostname: 'api.github.com',
                path: pathName,
                method: options.method ?? 'GET',
                headers
            },
            function (response)
            {
                const chunks: Buffer[] = [];

                response.on('data', function (chunk)
                {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });

                response.on('end', function ()
                {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    const statusCode = response.statusCode ?? 500;

                    if (statusCode < 200 || statusCode >= 300)
                    {
                        reject(new Error(`GitHub API request failed (${statusCode}): ${raw}`));
                        return;
                    }

                    if (!raw)
                    {
                        resolve({} as T);
                        return;
                    }

                    resolve(JSON.parse(raw) as T);
                });
            }
        );

        request.on('error', reject);
        request.setTimeout(env.githubRequestTimeoutMs, function ()
        {
            request.destroy(new Error(`GitHub API request timed out after ${env.githubRequestTimeoutMs}ms`));
        });

        if (body)
        {
            request.write(body);
        }

        request.end();
    });
}

async function createInstallationAccessToken(installationId: string): Promise<string>
{
    const appJwt = await createGithubAppJwt();
    const response = await githubRequest<{ token: string }>(
        `/app/installations/${installationId}/access_tokens`,
        {
            method: 'POST',
            token: appJwt
        }
    );

    return response.token;
}

async function fetchGithubInstallation(installationId: string): Promise<GithubInstallationResponse>
{
    const appJwt = await createGithubAppJwt();

    return githubRequest<GithubInstallationResponse>(
        `/app/installations/${installationId}`,
        {
            token: appJwt
        }
    );
}

async function fetchInstallationRepositories(accessToken: string): Promise<GithubInstallationRepositoriesResponse>
{
    return githubRequest<GithubInstallationRepositoriesResponse>(
        '/installation/repositories?per_page=100',
        {
            token: accessToken
        }
    );
}

async function fetchRepositoryTree(accessToken: string, fullName: string, branch: string): Promise<GithubTreeResponse>
{
    return githubRequest<GithubTreeResponse>(
        `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        {
            token: accessToken
        }
    );
}

async function fetchRepositoryBranches(accessToken: string, fullName: string): Promise<GithubBranchResponse[]>
{
    const branches: GithubBranchResponse[] = [];
    let page = 1;

    while (true)
    {
        const response = await githubRequest<GithubBranchResponse[]>(
            `/repos/${fullName}/branches?per_page=100&page=${page}`,
            {
                token: accessToken
            }
        );

        branches.push(...response);

        if (response.length < 100)
        {
            break;
        }

        page += 1;
    }

    return branches;
}

async function fetchRepositoryBlob(accessToken: string, fullName: string, sha: string): Promise<GithubBlobResponse>
{
    return githubRequest<GithubBlobResponse>(
        `/repos/${fullName}/git/blobs/${sha}`,
        {
            token: accessToken
        }
    );
}

async function fetchOpenDependabotAlerts(accessToken: string, fullName: string): Promise<GithubDependabotAlertResponse[]>
{
    return githubRequest<GithubDependabotAlertResponse[]>(
        `/repos/${fullName}/dependabot/alerts?state=open&per_page=100`,
        {
            token: accessToken
        }
    ).catch(function (error)
    {
        console.warn(`GitHub Dependabot alerts unavailable for ${fullName}:`, error instanceof Error ? error.message : error);
        return [];
    });
}

async function fetchOpenSecretScanningAlerts(accessToken: string, fullName: string): Promise<GithubSecretScanningAlertResponse[]>
{
    return githubRequest<GithubSecretScanningAlertResponse[]>(
        `/repos/${fullName}/secret-scanning/alerts?state=open&per_page=100`,
        {
            token: accessToken
        }
    ).catch(function (error)
    {
        console.warn(`GitHub secret scanning alerts unavailable for ${fullName}:`, error instanceof Error ? error.message : error);
        return [];
    });
}

async function createRepositoryCheckRun(
    accessToken: string,
    fullName: string,
    input: {
        name: string;
        headSha: string;
        conclusion: GithubCheckRunConclusion;
        title: string;
        summary: string;
        text?: string;
        annotations?: GithubCheckRunAnnotation[];
    }
)
{
    return githubRequest(
        `/repos/${fullName}/check-runs`,
        {
            method: 'POST',
            token: accessToken,
            body:
            {
                name: input.name,
                head_sha: input.headSha,
                status: 'completed',
                conclusion: input.conclusion,
                completed_at: new Date().toISOString(),
                output:
                {
                    title: input.title,
                    summary: input.summary,
                    text: input.text,
                    annotations: input.annotations?.slice(0, 50)
                }
            }
        }
    );
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
    createGithubAppJwt,
    createInstallationAccessToken,
    fetchGithubInstallation,
    fetchInstallationRepositories,
    fetchRepositoryBranches,
    fetchRepositoryTree,
    fetchRepositoryBlob,
    fetchOpenDependabotAlerts,
    fetchOpenSecretScanningAlerts,
    createRepositoryCheckRun,
    verifyGithubWebhookSignature
};
