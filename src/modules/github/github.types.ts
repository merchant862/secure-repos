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

type GithubDependabotAlertResponse =
{
    number: number;
    state: string;
    html_url?: string;
    dependency?: {
        package?: {
            ecosystem?: string;
            name?: string;
        };
        manifest_path?: string;
        scope?: string;
    };
    security_advisory?: {
        ghsa_id?: string;
        cve_id?: string | null;
        summary?: string;
        severity?: string;
    };
    security_vulnerability?: {
        severity?: string;
        vulnerable_version_range?: string;
        first_patched_version?: {
            identifier?: string;
        } | null;
    };
};

type GithubSecretScanningAlertResponse =
{
    number: number;
    state: string;
    html_url?: string;
    secret_type?: string;
    secret_type_display_name?: string;
    validity?: string;
    publicly_leaked?: boolean;
    first_location_detected?: {
        path?: string;
        start_line?: number;
        commit_sha?: string;
    };
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
    GithubBlobResponse,
    GithubDependabotAlertResponse,
    GithubSecretScanningAlertResponse
};
