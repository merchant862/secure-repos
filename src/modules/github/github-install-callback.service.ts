import { ensureTenantExists } from '../../app/services/tenant.service';
import { getGithubInstallationDetails } from './github.service';
import { GithubInstallCallbackQuery } from './github.types';
import { upsertGithubInstallation } from './github-installation.service';

type ProcessGithubInstallCallbackInput =
{
    query: GithubInstallCallbackQuery;
    tenantId?: number;
};

async function processGithubInstallCallback(input: ProcessGithubInstallCallbackInput)
{
    const installationId = input.query.installation_id as string;
    const githubInstallation = await getGithubInstallationDetails(installationId);

    const tenant = await ensureTenantExists(
        {
            tenantId: input.tenantId,
            fallbackName: githubInstallation.account.login,
            fallbackSlugSource: githubInstallation.account.login
        }
    );

    const installation = await upsertGithubInstallation(
        {
            tenantId: tenant.id,
            githubInstallationId: installationId,
            githubAccountLogin: githubInstallation.account.login,
            githubAccountType: githubInstallation.account.type
        }
    );

    return {
        tenant,
        installation
    };
}

export {
    processGithubInstallCallback
};
