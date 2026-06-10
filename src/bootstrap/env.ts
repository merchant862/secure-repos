import dotenv from 'dotenv';

dotenv.config();

function getEnv(name: string, fallback?: string): string
{
    const value = process.env[name] ?? fallback;

    if (value === undefined)
    {
        throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
}

const env =
{
    appName: process.env.APP_NAME && process.env.APP_NAME.trim() !== '' ? process.env.APP_NAME : 'SecureRepos',
    port: Number(getEnv('PORT', '3000')),

    dbHost: getEnv('DB_HOST'),
    dbPort: Number(getEnv('DB_PORT', '3306')),
    dbName: getEnv('DB_NAME'),
    dbUser: getEnv('DB_USER'),
    dbPass: getEnv('DB_PASS'),

    githubAppId: getEnv('GITHUB_APP_ID'),
    githubClientId: getEnv('GITHUB_CLIENT_ID'),
    githubClientSecret: getEnv('GITHUB_CLIENT_SECRET'),
    githubWebhookSecret: getEnv('GITHUB_WEBHOOK_SECRET'),
    githubPrivateKeyPath: getEnv('GITHUB_PRIVATE_KEY_PATH'),
    githubAppSlug: getEnv('GITHUB_APP_SLUG'),

    gitlabBaseUrl: getEnv('GITLAB_BASE_URL', 'https://gitlab.com'),
    gitlabClientId: getEnv('GITLAB_CLIENT_ID', ''),
    gitlabClientSecret: getEnv('GITLAB_CLIENT_SECRET', ''),
    gitlabRedirectUri: getEnv('GITLAB_REDIRECT_URI', ''),
    gitlabWebhookSecret: getEnv('GITLAB_WEBHOOK_SECRET', ''),

    bitbucketClientId: getEnv('BITBUCKET_CLIENT_ID', ''),
    bitbucketClientSecret: getEnv('BITBUCKET_CLIENT_SECRET', ''),
    bitbucketRedirectUri: getEnv('BITBUCKET_REDIRECT_URI', ''),
    bitbucketWebhookSecret: getEnv('BITBUCKET_WEBHOOK_SECRET', ''),

    tokenEncryptionKey: getEnv('TOKEN_ENCRYPTION_KEY', ''),

    adminApiToken: getEnv('ADMIN_API_TOKEN', ''),
    scanWorkerPollMs: Number(getEnv('SCAN_WORKER_POLL_MS', '5000')),
    scanSchedulerIntervalMs: Number(getEnv('SCAN_SCHEDULER_INTERVAL_MS', '86400000')),
    notificationWorkerPollMs: Number(getEnv('NOTIFICATION_WORKER_POLL_MS', '10000')),
    notificationDeliveryMode: getEnv('NOTIFICATION_DELIVERY_MODE', 'log'),
    resendApiKey: getEnv('RESEND_API_KEY', ''),
    resendFromEmail: getEnv('RESEND_FROM_EMAIL', ''),
};

export 
{
    env
};
