type GithubConfig =
{
    appId: string;
    appSlug: string;
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
    privateKeyPath: string;
};

type GithubInstallCallbackQuery =
{
    installation_id?: string;
    setup_action?: string;
    state?: string;
    code?: string;
};

type GithubWebhookHeaders =
{
    event?: string;
    delivery?: string;
    signature256?: string;
};

type GithubInstallationAccount =
{
    login: string;
    type: string;
};

type GithubInstallationDetails =
{
    id: number;
    account: GithubInstallationAccount;
};

type NormalizedGithubWebhookEvent =
{
    event: string | null;
    delivery: string | null;
    payload: unknown;
};

export type {
    GithubConfig,
    GithubInstallCallbackQuery,
    GithubWebhookHeaders,
    GithubInstallationAccount,
    GithubInstallationDetails,
    NormalizedGithubWebhookEvent
};
