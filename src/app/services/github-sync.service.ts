import { CodeHostConnection, GithubInstallation, Repository, Tenant } from '../../db/models';
import { GithubRepositoryPayload, GithubWebhookPayload } from '../../modules/github/github.types';
import {
    createInstallationAccessToken,
    fetchGithubInstallation,
    fetchInstallationRepositories
} from '../../modules/github/github.service';
import { enqueueRepositoryScan } from './scan.service';
import { assertRepositoryLimitAvailable } from './plan-limit.service';

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
    const connection = await CodeHostConnection.findOne(
        {
            where:
            {
                provider: 'github',
                externalId: githubInstallation.githubInstallationId
            }
        }
    );
    await assertRepositoryLimitAvailable(githubInstallation.tenantId, 'github', String(repositoryPayload.id));

    const existingRepository = await Repository.findOne(
        {
            where:
            {
                provider: 'github',
                externalRepositoryId: String(repositoryPayload.id)
            }
        }
    );

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
        await existingRepository.update(values);
        return existingRepository;
    }

    return Repository.create(values);
}

async function deactivateRepository(repositoryPayload: GithubRepositoryPayload)
{
    const repository = await Repository.findOne(
        {
            where:
            {
                githubRepositoryId: String(repositoryPayload.id)
            }
        }
    );

    if (repository)
    {
        await repository.update({ isActive: false });
    }
}

async function syncGithubInstallationFromWebhook(payload: GithubWebhookPayload)
{
    if (!payload.installation?.id || !payload.installation.account?.login)
    {
        return [];
    }

    const tenant = await findOrCreateTenant(payload.installation.account.login);
    const installationId = String(payload.installation.id);
    const existingInstallation = await GithubInstallation.findOne(
        {
            where:
            {
                githubInstallationId: installationId
            }
        }
    );
    const installationValues =
    {
        tenantId: tenant.id,
        githubInstallationId: installationId,
        githubAccountLogin: payload.installation.account.login,
        githubAccountType: payload.installation.account.type
    };
    const githubInstallation = existingInstallation
        ? await existingInstallation.update(installationValues)
        : await GithubInstallation.create(installationValues);
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

    if (payload.action === 'deleted')
    {
        await Repository.update(
            {
                isActive: false
            },
            {
                where:
                {
                    githubInstallationId: githubInstallation.id
                }
            }
        );

        return [];
    }

    if (payload.action === 'removed')
    {
        for (const repositoryPayload of repositories)
        {
            await deactivateRepository(repositoryPayload);
        }

        return [];
    }

    for (const repositoryPayload of repositories)
    {
        const repository = await upsertRepository(githubInstallation, repositoryPayload);
        syncedRepositories.push(repository);

        if (payload.action === 'created' || payload.action === 'added')
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

    for (const repositoryPayload of repositoriesResponse.repositories)
    {
        const repository = await upsertRepository(githubInstallation, repositoryPayload);
        repositories.push(repository);
        await enqueueRepositoryScan(repository.id, 'github_initial_sync');
    }

    return {
        githubInstallation,
        repositories
    };
}

export {
    syncGithubInstallationFromWebhook,
    syncGithubInstallationForTenant
};
