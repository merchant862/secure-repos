import { Finding } from '../../db/models/finding.model';
import { Repository } from '../../db/models/repository.model';
import { runRepositorySecurityScan } from './security-scan.service';

type SecurityTenantScope = {
    tenantId: number;
};

async function listRecentFindings(scope: SecurityTenantScope, limit = 25)
{
    return Finding.findAll(
        {
            where:
            {
                tenantId: scope.tenantId
            },
            limit,
            order:
            [
                ['updatedAt', 'DESC']
            ]
        }
    );
}

async function getSecuritySummary(scope: SecurityTenantScope)
{
    const totalFindings = await Finding.count(
        {
            where:
            {
                tenantId: scope.tenantId
            }
        }
    );
    const openFindings = await Finding.count(
        {
            where:
            {
                tenantId: scope.tenantId,
                status: 'open'
            }
        }
    );
    const highSeverityFindings = await Finding.count(
        {
            where:
            {
                tenantId: scope.tenantId,
                severity: 'high',
                status: 'open'
            }
        }
    );

    return {
        totalFindings,
        openFindings,
        highSeverityFindings
    };
}

async function runBulkSecurityScan()
{
    const repositories = await Repository.findAll(
        {
            where:
            {
                isActive: true
            },
            order:
            [
                ['id', 'ASC']
            ]
        }
    );

    const results = [];

    for (const repository of repositories)
    {
        const result = await runRepositorySecurityScan(repository.id);
        results.push(result);
    }

    return {
        repositoriesScanned: repositories.length,
        results
    };
}

export {
    listRecentFindings,
    getSecuritySummary,
    runBulkSecurityScan
};
