import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[], trim = true)
{
    try
    {
        const result = await execFileAsync(
            'git',
            args,
            {
                cwd,
                encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024,
                windowsHide: true
            }
        );

        return trim ? result.stdout.trim() : result.stdout;
    }
    catch (error)
    {
        throw new Error(`Git command failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
}

function githubFullNameFromRemote(remote: string): string | null
{
    const value = remote.trim();
    let pathname = '';

    try
    {
        const parsed = new URL(value);
        if (parsed.hostname.toLowerCase() !== 'github.com') return null;
        pathname = parsed.pathname;
    }
    catch (error)
    {
        const scpMatch = /^(?:[^@]+@)?github\.com:(.+)$/i.exec(value);
        if (!scpMatch) return null;
        pathname = scpMatch[1];
    }

    const fullName = pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName) ? fullName : null;
}

async function getGitRepositoryContext(directory: string)
{
    const root = await git(directory, ['rev-parse', '--show-toplevel']);
    const remote = await git(root, ['config', '--get', 'remote.origin.url']);
    const fullName = githubFullNameFromRemote(remote);

    if (!fullName)
    {
        throw new Error('The origin remote must point to a GitHub repository');
    }

    const commitSha = await git(root, ['rev-parse', 'HEAD']);
    const branch = await git(root, ['branch', '--show-current']) || `detached-${commitSha.slice(0, 12)}`;
    const trackedOutput = await git(root, ['ls-files', '-z'], false);
    const trackedFiles = trackedOutput ? trackedOutput.split('\0').filter(Boolean) : [];

    return { root, remote, fullName, commitSha, branch, trackedFiles };
}

export {
    getGitRepositoryContext,
    githubFullNameFromRemote
};
