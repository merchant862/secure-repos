import { GithubInstallation } from '../../db/models/github-installation.model';
import { Repository } from '../../db/models/repository.model';

async function listGithubInstallations()
{
    return GithubInstallation.findAll(
        {
            order:
            [
                ['updatedAt', 'DESC']
            ]
        }
    );
}

async function getGithubInstallationSummary()
{
    const totalInstallations = await GithubInstallation.count();
    const activeInstallations = await GithubInstallation.count(
        {
            where:
            {
                isActive: true
            }
        }
    );
    const totalRepositories = await Repository.count();
    const activeRepositories = await Repository.count(
        {
            where:
            {
                isActive: true
            }
        }
    );

    return {
        totalInstallations,
        activeInstallations,
        totalRepositories,
        activeRepositories
    };
}

export {
    listGithubInstallations,
    getGithubInstallationSummary
};
