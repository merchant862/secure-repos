import { Repository } from '../../db/models/repository.model';

async function listRepositoriesForGithubInstallation(githubInstallationPrimaryId: number)
{
    return Repository.findAll(
        {
            where:
            {
                githubInstallationId: githubInstallationPrimaryId
            },
            order:
            [
                ['isActive', 'DESC'],
                ['fullName', 'ASC']
            ]
        }
    );
}

export {
    listRepositoriesForGithubInstallation
};
