import crypto from 'crypto';
import { Finding } from '../../db/models/finding.model';
import { Repository } from '../../db/models/repository.model';
import { GithubInstallation } from '../../db/models/github-installation.model';

type FindingDraft =
{
    category: string;
    severity: string;
    title: string;
    description: string;
};

type RepositoryScanResult =
{
    repositoryId: number;
    findingsCreated: number;
    findingsOpen: number;
};

function buildFindingFingerprint(repositoryId: number, category: string, title: string): string
{
    return crypto
        .createHash('sha256')
        .update(`${repositoryId}:${category}:${title}`)
        .digest('hex');
}

function buildRepositoryFindings(repository: Repository): FindingDraft[]
{
    const findings: FindingDraft[] = [];

    if (!repository.isPrivate)
    {
        findings.push(
            {
                category: 'repository_visibility',
                severity: 'high',
                title: 'Repository is public',
                description: 'Public repositories increase code exposure and should be explicitly reviewed against access policy.'
            }
        );
    }

    if (repository.defaultBranch === 'master')
    {
        findings.push(
            {
                category: 'branch_hygiene',
                severity: 'low',
                title: 'Repository still uses master as default branch',
                description: 'Legacy default branch naming may indicate outdated repository governance or automation assumptions.'
            }
        );
    }

    if (!repository.isActive)
    {
        findings.push(
            {
                category: 'inventory_hygiene',
                severity: 'medium',
                title: 'Repository is inactive in synced inventory',
                description: 'Inactive repositories should be reviewed so stale assets do not remain in the security inventory.'
            }
        );
    }

    return findings;
}

async function resolveRepositoryWithTenant(repositoryId: number)
{
    return Repository.findByPk(
        repositoryId,
        {
            include:
            [
                {
                    model: GithubInstallation,
                    as: 'githubInstallation'
                }
            ]
        }
    );
}

async function upsertFinding(repository: Repository, tenantId: number, findingDraft: FindingDraft)
{
    const fingerprint = buildFindingFingerprint(repository.id, findingDraft.category, findingDraft.title);

    const existingFinding = await Finding.findOne(
        {
            where:
            {
                fingerprint
            }
        }
    );

    if (!existingFinding)
    {
        await Finding.create(
            {
                tenantId,
                repositoryId: repository.id,
                provider: 'internal',
                category: findingDraft.category,
                severity: findingDraft.severity,
                title: findingDraft.title,
                description: findingDraft.description,
                status: 'open',
                fingerprint
            }
        );

        return true;
    }

    existingFinding.severity = findingDraft.severity;
    existingFinding.description = findingDraft.description;
    existingFinding.status = 'open';

    await existingFinding.save();

    return false;
}

async function runRepositorySecurityScan(repositoryId: number): Promise<RepositoryScanResult>
{
    const repository = await resolveRepositoryWithTenant(repositoryId);

    if (!repository)
    {
        throw new Error(`Repository not found for id: ${repositoryId}`);
    }

    const installation = repository.get('githubInstallation') as GithubInstallation | undefined;

    if (!installation)
    {
        throw new Error(`GitHub installation missing for repository id: ${repositoryId}`);
    }

    const tenantId = installation.tenantId;
    const findingDrafts = buildRepositoryFindings(repository);
    let findingsCreated = 0;

    for (const findingDraft of findingDrafts)
    {
        const wasCreated = await upsertFinding(repository, tenantId, findingDraft);

        if (wasCreated)
        {
            findingsCreated += 1;
        }
    }

    const findingsOpen = await Finding.count(
        {
            where:
            {
                repositoryId: repository.id,
                status: 'open'
            }
        }
    );

    return {
        repositoryId: repository.id,
        findingsCreated,
        findingsOpen
    };
}

export {
    runRepositorySecurityScan,
    buildRepositoryFindings
};
