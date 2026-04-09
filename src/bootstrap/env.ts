import dotenv from 'dotenv';

dotenv.config();

function getOptionalEnv(name: string): string | undefined
{
    const value = process.env[name];

    if (value === undefined)
    {
        return undefined;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function getEnv(name: string, fallback?: string): string
{
    const value = getOptionalEnv(name) ?? fallback;

    if (value === undefined)
    {
        throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
}

function getNumberEnv(name: string, fallback: string): number
{
    const value = getEnv(name, fallback);
    const parsedValue = Number(value);

    if (Number.isNaN(parsedValue))
    {
        throw new Error(`Environment variable ${name} must be a valid number`);
    }

    return parsedValue;
}

function requireEnvGroup(names: string[], groupName: string)
{
    const missingNames = names.filter(function (name)
    {
        return getOptionalEnv(name) === undefined;
    });

    if (missingNames.length > 0)
    {
        throw new Error(`Missing ${groupName} environment variables: ${missingNames.join(', ')}`);
    }
}

const env =
{
    appName: getEnv('APP_NAME', 'Security Platform'),
    port: getNumberEnv('PORT', '3000'),

    dbHost: getOptionalEnv('DB_HOST'),
    dbPort: getNumberEnv('DB_PORT', '3306'),
    dbName: getOptionalEnv('DB_NAME'),
    dbUser: getOptionalEnv('DB_USER'),
    dbPass: process.env.DB_PASS ?? '',

    redisHost: getOptionalEnv('REDIS_HOST'),
    redisPort: getNumberEnv('REDIS_PORT', '6379'),

    githubAppId: getOptionalEnv('GITHUB_APP_ID'),
    githubClientId: getOptionalEnv('GITHUB_CLIENT_ID'),
    githubClientSecret: getOptionalEnv('GITHUB_CLIENT_SECRET'),
    githubWebhookSecret: getOptionalEnv('GITHUB_WEBHOOK_SECRET'),
    githubPrivateKeyPath: getOptionalEnv('GITHUB_PRIVATE_KEY_PATH'),
    githubAppSlug: getOptionalEnv('GITHUB_APP_SLUG'),
};

function assertDatabaseEnv()
{
    requireEnvGroup(
        ['DB_HOST', 'DB_NAME', 'DB_USER'],
        'database'
    );
}

function assertRedisEnv()
{
    requireEnvGroup(
        ['REDIS_HOST'],
        'redis'
    );
}

function assertGithubEnv()
{
    requireEnvGroup(
        [
            'GITHUB_APP_ID',
            'GITHUB_CLIENT_ID',
            'GITHUB_CLIENT_SECRET',
            'GITHUB_WEBHOOK_SECRET',
            'GITHUB_PRIVATE_KEY_PATH',
            'GITHUB_APP_SLUG'
        ],
        'GitHub'
    );
}

export 
{
    env,
    assertDatabaseEnv,
    assertRedisEnv,
    assertGithubEnv
};
