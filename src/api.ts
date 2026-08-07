type ApiConfig =
{
    token: string;
};

const apiUrl = 'https://securerepos.com';
const userAgent = 'SecureRepos-MCP/0.1.1';

async function cliApiRequest<T>(
    config: ApiConfig,
    pathName: string,
    options: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T>
{
    const response = await fetch(
        `${apiUrl}${pathName}`,
        {
            method: options.method || 'GET',
            headers:
            {
                Accept: 'application/json',
                Authorization: `Bearer ${config.token}`,
                'Content-Type': 'application/json',
                'User-Agent': userAgent
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
            signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
        }
    );
    const payload = await response.json().catch(() => ({})) as { message?: string };

    if (!response.ok)
    {
        throw new Error(payload.message || `SecureRepos API returned HTTP ${response.status}`);
    }

    return payload as T;
}

export {
    ApiConfig,
    cliApiRequest
};
