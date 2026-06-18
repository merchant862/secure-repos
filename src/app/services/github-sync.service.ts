import { CodeHostConnection, GithubInstallation, Repository, Tenant } from '../../db/models';
import { GithubRepositoryPayload, GithubWebhookPayload } from '../../modules/github/github.types';
import {
    createInstallationAccessToken,
    fetchGithubInstallation,
    fetchInstallationRepositories
} from '../../modules/github/github.service';
import { enqueueRepositoryScan } from './scan.service';
import { assertRepositoryLimitAvailable } from './plan-limit.service';
import { queueProviderStatusEmail } from './notification.service';
import { getProviderSetting } from './provider-setting.service';
import { sequelize } from '../../db/sequelize';

function slugify(value: string): string
{
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

async function findOrCreateTenant(accountLogin: string)
{
    const slug = slugify(accountLogin);
    const existingTenant = await Tenant.findOne({ where: { slug } });

    if (existingTenant)
    {
        return existingTenant;
    }

    return Tenant.create(
        {
            name: accountLogin,
            slug
        }
    );
}

async function upsertRepository(githubInstallation: GithubInstallation, repositoryPayload: GithubRepositoryPayload)
{
    return sequelize.transaction(async function (transaction)
    {
        await Tenant.findByPk(githubInstallation.tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        const connection = await CodeHostConnection.findOne(
        {
            where:
            {
                provider: 'github',
                externalId: githubInstallation.githubInstallationId
            },
            transaction
        }
        );
        await assertRepositoryLimitAvailable(githubInstallation.tenantId, 'github', String(repositoryPayload.id), transaction);

        const existingRepository = await Repository.findOne(
        {
            where:
            {
                provider: 'github',
                externalRepositoryId: String(repositoryPayload.id)
            },
            transaction
        }
        );

        if (existingRepository?.githubInstallationId && existingRepository.githubInstallationId !== githubInstallation.id)
        {
            const existingInstallation = await GithubInstallation.findByPk(existingRepository.githubInstallationId, { transaction });
            if (existingInstallation && existingInstallation.tenantId !== githubInstallation.tenantId)
            {
                throw new Error('Repository is already connected to another SecureRepos account');
            }
        }

        const values =
    {
        githubInstallationId: githubInstallation.id,
        codeHostConnectionId: connection?.id ?? null,
        provider: 'github',
        githubRepositoryId: String(repositoryPayload.id),
        externalRepositoryId: String(repositoryPayload.id),
        name: repositoryPayload.name,
        fullName: repositoryPayload.full_name,
        defaultBranch: repositoryPayload.default_branch ?? 'main',
        isPrivate: repositoryPayload.private,
        webUrl: `https://github.com/${repositoryPayload.full_name}`,
        isActive: true
    };

        if (existingRepository)
        {
            await existingRepository.update(values, { transaction });
            return existingRepository;
        }

        return Repository.create(values, { transaction });
    });
}

function isRepositoryLimitError(error: unknown)
{
    return error instanceof Error && error.message.startsWith('Repository limit reached');
}

async function syncGithubInstallationFromWebhook(payload: GithubWebhookPayload)
{
    if (!payload.installation?.id || !payload.installation.account?.login)
    {
        return [];
    }

    const installationId = String(payload.installation.id);
    const existingInstallation = await GithubInstallation.findOne(
        {
            where:
            {
                githubInstallationId: installationId
            }
        }
    );
    if (!existingInstallation)
    {
        return [];
    }
    const tenant = await Tenant.findByPk(existingInstallation.tenantId);
    if (!tenant) return [];
    const installationValues =
    {
        tenantId: tenant.id,
        githubInstallationId: installationId,
        githubAccountLogin: payload.installation.account.login,
        githubAccountType: payload.installation.account.type
    };
    const githubInstallation = await existingInstallation.update(installationValues);
    const existingConnection = await CodeHostConnection.findOne(
        {
            where:
            {
                provider: 'github',
                externalId: installationId
            }
        }
    );

    if (existingConnection)
    {
        await existingConnection.update(
            {
                tenantId: tenant.id,
                accountLogin: payload.installation.account.login,
                accountType: payload.installation.account.type,
                isActive: payload.action !== 'deleted',
                lastSyncAt: new Date()
            }
        );
    }
    else
    {
        await CodeHostConnection.create(
            {
                tenantId: tenant.id,
                provider: 'github',
                externalId: installationId,
                accountLogin: payload.installation.account.login,
                accountType: payload.installation.account.type,
                lastSyncAt: new Date()
            }
        );
    }
    const repositories = payload.repositories ?? (payload.repository ? [payload.repository] : []);
    const syncedRepositories: Repository[] = [];

    if (payload.action === 'deleted' || payload.action === 'removed')
    {
        // Keep selected repositories active so plan slots cannot be freed by
        // removing GitHub App access before an admin changes the subscription.
        return [];
    }

    for (const repositoryPayload of repositories)
    {
        let repository: Repository;

        try
        {
            repository = await upsertRepository(githubInstallation, repositoryPayload);
        }
        catch (error)
        {
            if (isRepositoryLimitError(error))
            {
                continue;
            }

            throw error;
        }

        syncedRepositories.push(repository);

        const providerSetting = await getProviderSetting('github');
        const scanDefaults = providerSetting?.scanDefaults as { triggerFirstScan?: boolean } | null;
        if ((payload.action === 'created' || payload.action === 'added') && scanDefaults?.triggerFirstScan !== false)
        {
            await enqueueRepositoryScan(repository.id, 'github_webhook');
        }
    }

    return syncedRepositories;
}

async function syncGithubInstallationForTenant(tenantId: number, installationId: string)
{
    const installation = await fetchGithubInstallation(installationId);
    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant)
    {
        throw new Error('Tenant not found for GitHub installation');
    }

    const existingInstallation = await GithubInstallation.findOne(
        {
            where:
            {
                githubInstallationId: installationId
            }
        }
    );
    if (existingInstallation && existingInstallation.tenantId !== tenant.id)
    {
        throw new Error('This GitHub installation is already connected to another account');
    }
    const githubInstallation = existingInstallation
        ? await existingInstallation.update(
            {
                tenantId: tenant.id,
                githubInstallationId: installationId,
                githubAccountLogin: installation.account.login,
                githubAccountType: installation.account.type
            }
        )
        : await GithubInstallation.create(
            {
                tenantId: tenant.id,
                githubInstallationId: installationId,
                githubAccountLogin: installation.account.login,
                githubAccountType: installation.account.type
            }
        );
    const existingConnection = await CodeHostConnection.findOne(
        {
            where:
            {
                provider: 'github',
                externalId: installationId
            }
        }
    );

    if (existingConnection)
    {
        await existingConnection.update(
            {
                tenantId: tenant.id,
                accountLogin: installation.account.login,
                accountType: installation.account.type,
                isActive: true,
                lastSyncAt: new Date()
            }
        );
    }
    else
    {
        await CodeHostConnection.create(
            {
                tenantId: tenant.id,
                provider: 'github',
                externalId: installationId,
                accountLogin: installation.account.login,
                accountType: installation.account.type,
                lastSyncAt: new Date()
            }
        );
    }

    const accessToken = await createInstallationAccessToken(installationId);
    const repositoriesResponse = await fetchInstallationRepositories(accessToken);
    const repositories: Repository[] = [];
    const providerSetting = await getProviderSetting('github');
    const scanDefaults = providerSetting?.scanDefaults as { triggerFirstScan?: boolean } | null;

    const selectedRepositories = [...repositoriesResponse.repositories].sort((left, right) => left.full_name.localeCompare(right.full_name));

    for (const repositoryPayload of selectedRepositories)
    {
        let repository: Repository;

        try
        {
            repository = await upsertRepository(githubInstallation, repositoryPayload);
        }
        catch (error)
        {
            if (isRepositoryLimitError(error))
            {
                continue;
            }

            throw error;
        }

        repositories.push(repository);
        if (scanDefaults?.triggerFirstScan !== false)
        {
            await enqueueRepositoryScan(repository.id, 'github_initial_sync');
        }
    }

    await queueProviderStatusEmail(tenant.id, 'github', installation.account.login, 'connected');

    return {
        githubInstallation,
        repositories
    };
}

export {
    syncGithubInstallationFromWebhook,
    syncGithubInstallationForTenant
};
