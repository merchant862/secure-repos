import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type CliConfig =
{
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

async function readCliConfig(): Promise<CliConfig | null>
{
    try
    {
        const value = JSON.parse(await fs.readFile(configPath(), 'utf8')) as Partial<CliConfig>;

        if (!value.token)
        {
            return null;
        }

        return {
            token: value.token
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
        `${JSON.stringify(config, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
    );
    await fs.chmod(configPath(), 0o600).catch(() => undefined);
}

async function deleteCliConfig()
{
    await fs.rm(configPath(), { force: true });
}

async function resolveCliConfig(overrides: { token?: string } = {})
{
    const saved = await readCliConfig();
    const token = overrides.token || process.env.SECUREREPOS_TOKEN || saved?.token;

    if (!token)
    {
        throw new Error('No CLI token found. Run "securerepos login --token <token>" or set SECUREREPOS_TOKEN.');
    }

    if (!/^srp_cli_[A-Za-z0-9_-]+$/.test(token))
    {
        throw new Error('The CLI token format is invalid');
    }

    return { token };
}

export {
    deleteCliConfig,
    readCliConfig,
    resolveCliConfig,
    writeCliConfig
};
