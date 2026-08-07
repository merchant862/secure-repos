import { Finding, GithubInstallation, Repository } from '../../db/models';
import {
    createBranchRef,
    createInstallationAccessToken,
    createPullRequest,
    fetchRepositoryBranches,
    fetchRepositoryFile,
    updateRepositoryFile
} from '../../modules/github/github.service';

function isSafePrFinding(finding: Finding)
{
    return finding.ruleId === 'repo.env-file-committed';
}

async function createSafeRemediationPr(finding: Finding)
{
    if (!isSafePrFinding(finding))
    {
        throw new Error('Automatic PR remediation is only available for safe deterministic fixes.');
    }

    const repository = await Repository.findByPk(finding.repositoryId);
    const installation = repository?.githubInstallationId
        ? await GithubInstallation.findByPk(repository.githubInstallationId)
        : null;

    if (!repository || !installation)
    {
        throw new Error('Repository GitHub installation is not available.');
    }

    const accessToken = await createInstallationAccessToken(installation.githubInstallationId);
    const baseBranch = repository.defaultBranch || 'main';
    const branches = await fetchRepositoryBranches(accessToken, repository.fullName);
    const base = branches.find((branch) => branch.name === baseBranch) ?? branches[0];

    if (!base?.commit?.sha)
    {
        throw new Error('Default branch SHA could not be resolved.');
    }

    const branchName = `securerepos/fix-${finding.id}`;
    await createBranchRef(accessToken, repository.fullName, branchName, base.commit.sha).catch(function (error)
    {
        if (error instanceof Error && error.message.includes('Reference already exists')) return null;
        throw error;
    });

    let gitignore = '';
    let sha: string | undefined;

    try
    {
        const file = await fetchRepositoryFile(accessToken, repository.fullName, '.gitignore', baseBranch);
        sha = file.sha;
        gitignore = file.content && file.encoding === 'base64'
            ? Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
            : '';
    }
    catch
    {
        gitignore = '';
    }

    const lines = new Set(gitignore.split(/\r?\n/).map((line) => line.trim()));
    const nextContent = lines.has('.env')
        ? gitignore
        : `${gitignore.replace(/\s*$/, '')}${gitignore.trim() ? '\n' : ''}.env\n`;

    await updateRepositoryFile(
        accessToken,
        repository.fullName,
        {
            path: '.gitignore',
            branch: branchName,
            message: 'Add .env to gitignore',
            content: nextContent,
            sha
        }
    );

    const pr = await createPullRequest(
        accessToken,
        repository.fullName,
        {
            title: 'Add .env to gitignore',
            body: `SecureRepos detected a committed environment file.\n\nThis PR adds .env to .gitignore. Rotate any exposed values and remove sensitive history manually if needed.\n\nFinding #${finding.id}: ${finding.title}`,
            head: branchName,
            base: baseBranch
        }
    );

    await finding.update(
        {
            metadata:
            {
                ...((finding.metadata as object | null) ?? {}),
                remediationPrUrl: pr.html_url ?? null,
                remediationPrNumber: pr.number ?? null,
                remediationPrCreatedAt: new Date().toISOString()
            } as object
        }
    );

    return pr;
}

export {
    createSafeRemediationPr,
    isSafePrFinding
};
