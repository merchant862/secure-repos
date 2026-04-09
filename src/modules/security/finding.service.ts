import { Finding } from '../../db/models/finding.model';

async function listFindingsForRepository(repositoryId: number)
{
    return Finding.findAll(
        {
            where:
            {
                repositoryId
            },
            order:
            [
                ['severity', 'DESC'],
                ['createdAt', 'DESC']
            ]
        }
    );
}

export {
    listFindingsForRepository
};
