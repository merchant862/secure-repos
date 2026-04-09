import { GithubInstallation } from '../../db/models/github-installation.model';
import { Repository } from '../../db/models/repository.model';

type UpsertGithubInstallationInput =
{
    tenantId: number;
    githubInstallationId: string;
    githubAccountLogin: string;
    githubAccountType: string;
};

async function findGithubInstallationByGithubId(githubInstallationId: string)
{
    return GithubInstallation.findOne(
        {
            where:
            {
                githubInstallationId
            }
        }
    );
}

async function createGithubInstallation(input: UpsertGithubInstallationInput)
{
    return GithubInstallation.create(
        {
            tenantId: input.tenantId,
            githubInstallationId: input.githubInstallationId,
            githubAccountLogin: input.githubAccountLogin,
            githubAccountType: input.githubAccountType
        }
    );
}

async function updateGithubInstallation(existingInstallation: GithubInstallation, input: UpsertGithubInstallationInput)
{
    existingInstallation.tenantId = input.tenantId;
    existingInstallation.githubAccountLogin = input.githubAccountLogin;
    existingInstallation.githubAccountType = input.githubAccountType;
    existingInstallation.isActive = true;
    existingInstallation.uninstalledAt = null;

    await existingInstallation.save();

    return existingInstallation;
}

async function upsertGithubInstallation(input: UpsertGithubInstallationInput)
{
    const existingInstallation = await findGithubInstallationByGithubId(input.githubInstallationId);

    if (!existingInstallation)
    {
        return createGithubInstallation(input);
    }

    return updateGithubInstallation(existingInstallation, input);
}

async function findGithubInstallationByPrimaryId(id: number)
{
    return GithubInstallation.findByPk(id);
}

async function markGithubInstallationRepositorySync(id: number)
{
    await GithubInstallation.update(
        {
            lastRepositorySyncAt: new Date(),
            isActive: true,
            uninstalledAt: null
        },
        {
            where:
            {
                id
            }
        }
    );
}

async function deactivateGithubInstallationByGithubId(githubInstallationId: string)
{
    const installation = await findGithubInstallationByGithubId(githubInstallationId);

    if (!installation)
    {
        return null;
    }

    installation.isActive = false;
    installation.uninstalledAt = new Date();

    await installation.save();

    await Repository.update(
        {
            isActive: false
        },
        {
            where:
            {
                githubInstallationId: installation.id
            }
        }
    );

    return installation;
}

export {
    findGithubInstallationByGithubId,
    findGithubInstallationByPrimaryId,
    createGithubInstallation,
    updateGithubInstallation,
    upsertGithubInstallation,
    markGithubInstallationRepositorySync,
    deactivateGithubInstallationByGithubId
};

export type {
    UpsertGithubInstallationInput
};
