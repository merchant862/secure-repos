import { Repository } from '../../db/models/repository.model';
import { GithubInstallation } from '../../db/models/github-installation.model';
import { getGithubApiHeaders, getGithubInstallationAccessToken } from './github.service';
import { Op } from 'sequelize';
import { markGithubInstallationRepositorySync } from './github-installation.service';

type GithubRepositoryApiItem =
{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
};

type GithubInstallationRepositoriesResponse =
{
    total_count: number;
    repositories: GithubRepositoryApiItem[];
};

type SyncInstallationRepositoriesResult =
{
    totalCount: number;
    syncedCount: number;
    deactivatedCount: number;
};

async function findGithubInstallationById(id: number)
{
    return GithubInstallation.findByPk(id);
}

async function fetchInstallationRepositories(installationId: string): Promise<GithubRepositoryApiItem[]>
{
    const installationAccessToken = await getGithubInstallationAccessToken(installationId);

    const repositories: GithubRepositoryApiItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore)
    {
        const searchParams = new URLSearchParams(
            {
                per_page: '100',
                page: String(page)
            }
        );

        const response = await fetch(
            `https://api.github.com/installation/repositories?${searchParams.toString()}`,
            {
                method: 'GET',
                headers: getGithubApiHeaders(`Bearer ${installationAccessToken}`)
            }
        );

        if (!response.ok)
        {
            const errorBody = await response.text();

            throw new Error(`Failed to fetch installation repositories: ${response.status} ${errorBody}`);
        }

        const data = await response.json() as GithubInstallationRepositoriesResponse;

        repositories.push(...data.repositories);

        if (data.repositories.length < 100)
        {
            hasMore = false;
        }
        else
        {
            page += 1;
        }
    }

    return repositories;
}

async function upsertRepositoryForInstallation(
    githubInstallationId: number,
    repository: GithubRepositoryApiItem
)
{
    const existingRepository = await Repository.findOne(
        {
            where:
            {
                githubRepositoryId: String(repository.id)
            }
        }
    );

    if (!existingRepository)
    {
        return Repository.create(
            {
                githubInstallationId,
                githubRepositoryId: String(repository.id),
                name: repository.name,
                fullName: repository.full_name,
                defaultBranch: repository.default_branch || 'main',
                isPrivate: repository.private,
                isActive: true
            }
        );
    }

    existingRepository.githubInstallationId = githubInstallationId;
    existingRepository.name = repository.name;
    existingRepository.fullName = repository.full_name;
    existingRepository.defaultBranch = repository.default_branch || 'main';
    existingRepository.isPrivate = repository.private;
    existingRepository.isActive = true;

    await existingRepository.save();

    return existingRepository;
}

async function deactivateMissingRepositories(
    githubInstallationId: number,
    repositories: GithubRepositoryApiItem[]
)
{
    const githubRepositoryIds = repositories.map(function (repository)
    {
        return String(repository.id);
    });

    const whereClause = githubRepositoryIds.length > 0
        ? {
            githubInstallationId,
            githubRepositoryId:
            {
                [Op.notIn]: githubRepositoryIds
            }
        }
        : {
            githubInstallationId
        };

    const [deactivatedCount] = await Repository.update(
        {
            isActive: false
        },
        {
            where: whereClause
        }
    );

    return deactivatedCount;
}

async function syncRepositoriesForGithubInstallation(
    githubInstallationPrimaryId: number
): Promise<SyncInstallationRepositoriesResult>
{
    const installation = await findGithubInstallationById(githubInstallationPrimaryId);

    if (!installation)
    {
        throw new Error(`GitHub installation not found for id: ${githubInstallationPrimaryId}`);
    }

    const repositories = await fetchInstallationRepositories(installation.githubInstallationId);

    for (const repository of repositories)
    {
        await upsertRepositoryForInstallation(installation.id, repository);
    }

    const deactivatedCount = await deactivateMissingRepositories(installation.id, repositories);
    await markGithubInstallationRepositorySync(installation.id);

    return {
        totalCount: repositories.length,
        syncedCount: repositories.length,
        deactivatedCount
    };
}

export {
    findGithubInstallationById,
    fetchInstallationRepositories,
    upsertRepositoryForInstallation,
    deactivateMissingRepositories,
    syncRepositoriesForGithubInstallation
};

export type {
    GithubRepositoryApiItem,
    GithubInstallationRepositoriesResponse,
    SyncInstallationRepositoriesResult
};
