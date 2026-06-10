import { env } from '../../bootstrap/env';
import { CodeHostConnection } from '../../db/models';
import { decryptSecret } from './crypto.service';
import { httpRequest } from './http.service';
import { RepositoryFile } from './scan-rules.service';

type CodeHostProvider = 'github' | 'gitlab' | 'bitbucket';

type OAuthTokenResponse =
{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
};

type ProviderAccount =
{
    externalId: string;
    login: string;
    type: string | null;
};

type ProviderRepository =
{
    externalId: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    isPrivate: boolean;
    webUrl: string | null;
};

type GitLabUserResponse =
{
    id: number;
    username: string;
};

type GitLabProjectResponse =
{
    id: number;
    name: string;
    path_with_namespace: string;
    default_branch?: string;
    visibility: string;
    web_url?: string;
};

type GitLabTreeItem =
{
    id: string;
    path: string;
    type: string;
};

type GitLabFileResponse =
{
    file_path: string;
    content: string;
    encoding: string;
};

type BitbucketUserResponse =
{
    uuid: string;
    username?: string;
    display_name?: string;
};

type BitbucketRepositoryResponse =
{
    uuid: string;
    name: string;
    full_name: string;
    is_private: boolean;
    mainbranch?: { name?: string };
    links?: { html?: { href?: string } };
};

type BitbucketPage<T> =
{
    values: T[];
    next?: string;
};

function getTokenExpiry(expiresIn?: number): Date | null
{
    if (!expiresIn)
    {
        return null;
    }

    return new Date(Date.now() + expiresIn * 1000);
}

function encodePathSegments(value: string): string
{
    return value.split('/').map(encodeURIComponent).join('/');
}

async function exchangeGitLabCode(code: string): Promise<OAuthTokenResponse>
{
    const body = new URLSearchParams(
        {
            client_id: env.gitlabClientId,
            client_secret: env.gitlabClientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: env.gitlabRedirectUri
        }
    );

    return httpRequest<OAuthTokenResponse>(`${env.gitlabBaseUrl}/oauth/token`,
        {
            method: 'POST',
            headers:
            {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        }
    );
}

async function exchangeBitbucketCode(code: string): Promise<OAuthTokenResponse>
{
    const body = new URLSearchParams(
        {
            code,
            grant_type: 'authorization_code',
            redirect_uri: env.bitbucketRedirectUri
        }
    );
    const auth = Buffer.from(`${env.bitbucketClientId}:${env.bitbucketClientSecret}`).toString('base64');

    return httpRequest<OAuthTokenResponse>('https://bitbucket.org/site/oauth2/access_token',
        {
            method: 'POST',
            headers:
            {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        }
    );
}

async function fetchGitLabAccount(accessToken: string): Promise<ProviderAccount>
{
    const user = await httpRequest<GitLabUserResponse>(`${env.gitlabBaseUrl}/api/v4/user`,
        {
            headers:
            {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    return {
        externalId: String(user.id),
        login: user.username,
        type: 'user'
    };
}

async function fetchBitbucketAccount(accessToken: string): Promise<ProviderAccount>
{
    const user = await httpRequest<BitbucketUserResponse>('https://api.bitbucket.org/2.0/user',
        {
            headers:
            {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    return {
        externalId: user.uuid,
        login: user.username ?? user.display_name ?? user.uuid,
        type: 'user'
    };
}

async function fetchGitLabRepositories(accessToken: string): Promise<ProviderRepository[]>
{
    const projects = await httpRequest<GitLabProjectResponse[]>(`${env.gitlabBaseUrl}/api/v4/projects?membership=true&simple=true&per_page=100`,
        {
            headers:
            {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    return projects.map(function (project)
    {
        return {
            externalId: String(project.id),
            name: project.name,
            fullName: project.path_with_namespace,
            defaultBranch: project.default_branch ?? 'main',
            isPrivate: project.visibility !== 'public',
            webUrl: project.web_url ?? null
        };
    });
}

async function fetchBitbucketRepositories(accessToken: string, accountLogin: string): Promise<ProviderRepository[]>
{
    const repositories: ProviderRepository[] = [];
    let nextUrl: string | undefined = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(accountLogin)}?pagelen=100`;

    while (nextUrl)
    {
        const page: BitbucketPage<BitbucketRepositoryResponse> = await httpRequest<BitbucketPage<BitbucketRepositoryResponse>>(nextUrl,
            {
                headers:
                {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        for (const repository of page.values)
        {
            repositories.push(
                {
                    externalId: repository.uuid,
                    name: repository.name,
                    fullName: repository.full_name,
                    defaultBranch: repository.mainbranch?.name ?? 'main',
                    isPrivate: repository.is_private,
                    webUrl: repository.links?.html?.href ?? null
                }
            );
        }

        nextUrl = page.next;
    }

    return repositories;
}

async function fetchGitLabFiles(connection: CodeHostConnection, fullName: string, branch: string): Promise<RepositoryFile[]>
{
    const accessToken = decryptSecret(connection.accessTokenEncrypted ?? '');
    const encodedProject = encodeURIComponent(fullName);
    const tree = await httpRequest<GitLabTreeItem[]>(
        `${env.gitlabBaseUrl}/api/v4/projects/${encodedProject}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`,
        {
            headers:
            {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );
    const files: RepositoryFile[] = [];

    for (const item of tree.filter((treeItem) => treeItem.type === 'blob').slice(0, 500))
    {
        const file = await httpRequest<GitLabFileResponse>(
            `${env.gitlabBaseUrl}/api/v4/projects/${encodedProject}/repository/files/${encodeURIComponent(item.path)}?ref=${encodeURIComponent(branch)}`,
            {
                headers:
                {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        files.push(
            {
                path: file.file_path,
                content: file.encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : file.content
            }
        );
    }

    return files;
}

async function fetchBitbucketFiles(connection: CodeHostConnection, fullName: string, branch: string): Promise<RepositoryFile[]>
{
    const accessToken = decryptSecret(connection.accessTokenEncrypted ?? '');
    const treePage = await httpRequest<BitbucketPage<{ path: string; type: string }>>(
        `https://api.bitbucket.org/2.0/repositories/${fullName}/src/${encodeURIComponent(branch)}/?pagelen=100&recursive=true`,
        {
            headers:
            {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );
    const files: RepositoryFile[] = [];

    for (const item of treePage.values.filter((entry) => entry.type === 'commit_file').slice(0, 500))
    {
        const raw = await httpRequest<string>(
            `https://api.bitbucket.org/2.0/repositories/${fullName}/src/${encodeURIComponent(branch)}/${encodePathSegments(item.path)}`,
            {
                headers:
                {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'text/plain'
                },
                responseType: 'text'
            }
        );

        files.push(
            {
                path: item.path,
                content: typeof raw === 'string' ? raw : String(raw)
            }
        );
    }

    return files;
}

function buildProviderAuthUrl(provider: CodeHostProvider, state: string): string
{
    if (provider === 'gitlab')
    {
        const params = new URLSearchParams(
            {
                client_id: env.gitlabClientId,
                redirect_uri: env.gitlabRedirectUri,
                response_type: 'code',
                scope: 'read_api read_repository',
                state
            }
        );

        return `${env.gitlabBaseUrl}/oauth/authorize?${params.toString()}`;
    }

    if (provider === 'bitbucket')
    {
        const params = new URLSearchParams(
            {
                client_id: env.bitbucketClientId,
                response_type: 'code',
                scope: 'account repository',
                state
            }
        );

        return `https://bitbucket.org/site/oauth2/authorize?${params.toString()}`;
    }

    throw new Error(`Unsupported OAuth provider: ${provider}`);
}

export type {
    CodeHostProvider,
    OAuthTokenResponse,
    ProviderAccount,
    ProviderRepository
};

export {
    getTokenExpiry,
    exchangeGitLabCode,
    exchangeBitbucketCode,
    fetchGitLabAccount,
    fetchBitbucketAccount,
    fetchGitLabRepositories,
    fetchBitbucketRepositories,
    fetchGitLabFiles,
    fetchBitbucketFiles,
    buildProviderAuthUrl
};
