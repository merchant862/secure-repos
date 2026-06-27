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
    nodeEnv: getEnv('NODE_ENV', 'development'),
    appUrl: getEnv('APP_URL', 'https://securerepos.com'),
    supportEmail: getEnv('SUPPORT_EMAIL', 'support@securerepos.com'),
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

    tokenEncryptionKey: getEnv('TOKEN_ENCRYPTION_KEY', ''),

    adminApiToken: getEnv('ADMIN_API_TOKEN', ''),
    scanWorkerPollMs: Number(getEnv('SCAN_WORKER_POLL_MS', '5000')),
    scanSchedulerIntervalMs: Number(getEnv('SCAN_SCHEDULER_INTERVAL_MS', '300000')),
    scanMaxBranches: Number(getEnv('SCAN_MAX_BRANCHES', '50')),
    scanMaxFiles: Number(getEnv('SCAN_MAX_FILES', '2000')),
    scanMaxFilesPerBranch: Number(getEnv('SCAN_MAX_FILES_PER_BRANCH', '250')),
    scanMaxDurationMs: Number(getEnv('SCAN_MAX_DURATION_MS', '600000')),
    scanMaxDependencies: Number(getEnv('SCAN_MAX_DEPENDENCIES', '5000')),
    githubRequestTimeoutMs: Number(getEnv('GITHUB_REQUEST_TIMEOUT_MS', '20000')),
    osvApiUrl: getEnv('OSV_API_URL', 'https://api.osv.dev'),
    osvRequestTimeoutMs: Number(getEnv('OSV_REQUEST_TIMEOUT_MS', '20000')),
    notificationWorkerPollMs: Number(getEnv('NOTIFICATION_WORKER_POLL_MS', '10000')),
    notificationDeliveryMode: getEnv('NOTIFICATION_DELIVERY_MODE', 'log'),
    resendApiKey: getEnv('RESEND_API_KEY', ''),
    resendFromEmail: getEnv('RESEND_FROM_EMAIL', ''),

    paddleEnvironment: getEnv('PADDLE_ENVIRONMENT', 'sandbox'),
    paddleApiKey: getEnv('PADDLE_API_KEY', ''),
    paddleClientToken: getEnv('PADDLE_CLIENT_TOKEN', ''),
    paddleWebhookSecret: getEnv('PADDLE_WEBHOOK_SECRET', ''),
    paddleSoloStarterPriceId: getEnv('PADDLE_SOLO_STARTER_PRICE_ID', ''),
    paddleSoloProPriceId: getEnv('PADDLE_SOLO_PRO_PRICE_ID', ''),
};

export 
{
    env
};
