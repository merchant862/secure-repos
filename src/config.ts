import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type CliConfig =
{
    apiUrl: string;
    token: string;
};

function configDirectory()
{
    if (process.platform === 'win32' && process.env.APPDATA)
    {
        return path.join(process.env.APPDATA, 'SecureRepos');
    }

    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'securerepos');
}

function configPath()
{
    return path.join(configDirectory(), 'config.json');
}

function normalizeApiUrl(value: string)
{
    const url = new URL(value);

    if (!['https:', 'http:'].includes(url.protocol))
    {
        throw new Error('API URL must use HTTP or HTTPS');
    }

    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    {
        throw new Error('HTTPS is required for non-local API URLs');
    }

    return url.origin;
}

async function readCliConfig(): Promise<CliConfig | null>
{
    try
    {
        const value = JSON.parse(await fs.readFile(configPath(), 'utf8')) as Partial<CliConfig>;

        if (!value.token || !value.apiUrl)
        {
            return null;
        }

        return {
            token: value.token,
            apiUrl: normalizeApiUrl(value.apiUrl)
        };
    }
    catch (error)
    {
        return null;
    }
}

async function writeCliConfig(config: CliConfig)
{
    const directory = configDirectory();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(
        configPath(),
        `${JSON.stringify({ ...config, apiUrl: normalizeApiUrl(config.apiUrl) }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
    );
    await fs.chmod(configPath(), 0o600).catch(() => undefined);
}

async function deleteCliConfig()
{
    await fs.rm(configPath(), { force: true });
}

async function resolveCliConfig(overrides: { token?: string; apiUrl?: string } = {})
{
    const saved = await readCliConfig();
    const token = overrides.token || process.env.SECUREREPOS_TOKEN || saved?.token;
    const apiUrl = normalizeApiUrl(
        overrides.apiUrl || process.env.SECUREREPOS_API_URL || saved?.apiUrl || 'https://securerepos.com'
    );

    if (!token)
    {
        throw new Error('No CLI token found. Run "securerepos login --token <token>" or set SECUREREPOS_TOKEN.');
    }

    if (!/^srp_cli_[A-Za-z0-9_-]+$/.test(token))
    {
        throw new Error('The CLI token format is invalid');
    }

    return { token, apiUrl };
}

export {
    deleteCliConfig,
    normalizeApiUrl,
    readCliConfig,
    resolveCliConfig,
    writeCliConfig
};
