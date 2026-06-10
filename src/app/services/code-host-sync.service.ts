import { CodeHostConnection, Repository, Tenant } from '../../db/models';
import { decryptSecret, encryptSecret } from './crypto.service';
import { enqueueRepositoryScan } from './scan.service';
import {
    CodeHostProvider,
    exchangeBitbucketCode,
    exchangeGitLabCode,
    fetchBitbucketAccount,
    fetchBitbucketRepositories,
    fetchGitLabAccount,
    fetchGitLabRepositories,
    getTokenExpiry,
    ProviderRepository
} from './code-host-provider.service';
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

async function upsertProviderRepository(connection: CodeHostConnection, repository: ProviderRepository)
{
    await assertRepositoryLimitAvailable(connection.tenantId, connection.provider, repository.externalId);

    const existingRepository = await Repository.findOne(
        {
            where:
            {
                provider: connection.provider,
                externalRepositoryId: repository.externalId
            }
        }
    );
    const values =
    {
        githubInstallationId: null,
        codeHostConnectionId: connection.id,
        provider: connection.provider,
        githubRepositoryId: repository.externalId,
        externalRepositoryId: repository.externalId,
        name: repository.name,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        isPrivate: repository.isPrivate,
        webUrl: repository.webUrl,
        isActive: true
    };

    if (existingRepository)
    {
        await existingRepository.update(values);
        return existingRepository;
    }

    return Repository.create(values);
}

async function syncProviderRepositories(connection: CodeHostConnection, triggerFirstScan: boolean)
{
    const accessToken = connection.accessTokenEncrypted ? decryptAccessToken(connection) : '';
    const repositories = connection.provider === 'gitlab'
        ? await fetchGitLabRepositories(accessToken)
        : await fetchBitbucketRepositories(accessToken, connection.accountLogin);
    const syncedRepositories: Repository[] = [];

    for (const repositoryPayload of repositories)
    {
        const repository = await upsertProviderRepository(connection, repositoryPayload);
        syncedRepositories.push(repository);

        if (triggerFirstScan)
        {
            await enqueueRepositoryScan(repository.id, `${connection.provider}_initial_sync`);
        }
    }

    await connection.update({ lastSyncAt: new Date() });

    return syncedRepositories;
}

function decryptAccessToken(connection: CodeHostConnection): string
{
    return decryptSecret(connection.accessTokenEncrypted ?? '');
}

async function connectOAuthProvider(provider: CodeHostProvider, code: string, tenantId?: number)
{
    if (provider !== 'gitlab' && provider !== 'bitbucket')
    {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const token = provider === 'gitlab'
        ? await exchangeGitLabCode(code)
        : await exchangeBitbucketCode(code);
    const account = provider === 'gitlab'
        ? await fetchGitLabAccount(token.access_token)
        : await fetchBitbucketAccount(token.access_token);
    const tenant = tenantId ? await Tenant.findByPk(tenantId) : await findOrCreateTenant(account.login);

    if (!tenant)
    {
        throw new Error('Tenant not found for provider connection');
    }
    const existingConnection = await CodeHostConnection.findOne(
        {
            where:
            {
                provider,
                externalId: account.externalId
            }
        }
    );
    const values =
    {
        tenantId: tenant.id,
        provider,
        externalId: account.externalId,
        accountLogin: account.login,
        accountType: account.type,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        tokenExpiresAt: getTokenExpiry(token.expires_in),
        isActive: true,
        lastSyncAt: null
    };
    const connection = existingConnection
        ? await existingConnection.update(values)
        : await CodeHostConnection.create(values);
    const repositories = await syncProviderRepositories(connection, true);

    return {
        connection,
        repositories
    };
}

export {
    connectOAuthProvider,
    syncProviderRepositories
};
