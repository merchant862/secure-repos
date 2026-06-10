import { Finding, Repository } from '../../db/models';

async function buildTenantJsonReport(repositoryIds: number[])
{
    const repositories = await Repository.findAll(
        {
            where:
            {
                id: repositoryIds
            }
        }
    );
    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId: repositoryIds,
                status: 'open'
            }
        }
    );

    return {
        generatedAt: new Date().toISOString(),
        repositories: repositories.map(function (repository)
        {
            return {
                id: repository.id,
                provider: repository.provider,
                fullName: repository.fullName,
                securityScore: repository.securityScore,
                isPrivate: repository.isPrivate
            };
        }),
        findings: findings.map(function (finding)
        {
            return {
                id: finding.id,
                repositoryId: finding.repositoryId,
                severity: finding.severity,
                title: finding.title,
                remediation: finding.remediation,
                filePath: finding.filePath,
                lineNumber: finding.lineNumber,
                status: finding.status
            };
        })
    };
}

export {
    buildTenantJsonReport
};
