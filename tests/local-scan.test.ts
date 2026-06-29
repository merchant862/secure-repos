import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach } from 'vitest';

import { githubFullNameFromRemote } from '../src/git';
import { scanLocalTrackedFiles } from '../src/local-scan';

const temporaryDirectories: string[] = [];

afterEach(async function ()
{
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
        fs.rm(directory, { recursive: true, force: true })));
});

describe('SecureRepos CLI local scanning', function ()
{
    it('normalizes common GitHub remote formats', function ()
    {
        expect(githubFullNameFromRemote('git@github.com:merchant862/secure-repos.git')).toBe('merchant862/secure-repos');
        expect(githubFullNameFromRemote('https://github.com/merchant862/secure-repos.git')).toBe('merchant862/secure-repos');
        expect(githubFullNameFromRemote('ssh://git@github.com/merchant862/secure-repos.git')).toBe('merchant862/secure-repos');
        expect(githubFullNameFromRemote('https://gitlab.com/merchant862/secure-repos.git')).toBeNull();
    });

    it('scans tracked files in bounded batches and extracts dependencies', async function ()
    {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'securerepos-cli-'));
        temporaryDirectories.push(directory);
        await fs.mkdir(path.join(directory, 'src'), { recursive: true });
        await fs.writeFile(
            path.join(directory, 'src', 'index.js'),
            'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";\n'
        );
        await fs.writeFile(
            path.join(directory, 'package.json'),
            JSON.stringify({ dependencies: { lodash: '4.17.20' } })
        );

        const result = await scanLocalTrackedFiles(
            directory,
            ['src\\index.js', 'package.json', 'node_modules/ignored.js'],
            { lowResource: true }
        );

        expect(result.filesScanned).toBe(2);
        expect(result.filesSkipped).toBe(1);
        expect(result.findings.some((finding) => finding.ruleId === 'secret.github-token')).toBe(true);
        expect(result.dependencies).toContainEqual(
            expect.objectContaining({ ecosystem: 'npm', name: 'lodash', version: '4.17.20' })
        );
    });
});
