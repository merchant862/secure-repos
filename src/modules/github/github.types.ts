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

type GithubAccountPayload =
{
    login: string;
    type: string;
};

type GithubRepositoryPayload =
{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch?: string;
};

type GithubInstallationResponse =
{
    id: number;
    account:
    {
        login: string;
        type: string;
    };
};

type GithubInstallationRepositoriesResponse =
{
    repositories: GithubRepositoryPayload[];
};

type GithubInstallationPayload =
{
    id: number;
    account?: GithubAccountPayload;
};

type GithubWebhookPayload =
{
    action?: string;
    installation?: GithubInstallationPayload;
    repositories?: GithubRepositoryPayload[];
    repository?: GithubRepositoryPayload;
};

type GithubTreeItem =
{
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
    url: string;
};

type GithubTreeResponse =
{
    sha: string;
    truncated: boolean;
    tree: GithubTreeItem[];
};

type GithubBranchResponse =
{
    name: string;
    commit:
    {
        sha: string;
    };
};

type GithubBlobResponse =
{
    sha: string;
    content: string;
    encoding: string;
    size: number;
};

export type {
    GithubConfig,
    GithubInstallCallbackQuery,
    GithubWebhookHeaders,
    GithubWebhookPayload,
    GithubRepositoryPayload,
    GithubInstallationResponse,
    GithubInstallationRepositoriesResponse,
    GithubBranchResponse,
    GithubTreeItem,
    GithubTreeResponse,
    GithubBlobResponse
};
