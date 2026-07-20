#!/usr/bin/env node

import path from 'path';

import { cliApiRequest } from './api';
import { deleteCliConfig, resolveCliConfig, writeCliConfig } from './config';
import { getGitRepositoryContext } from './git';
import { scanLocalTrackedFiles } from './local-scan';

const version = '0.1.0';

type CliRepository =
{
    id: number;
    fullName: string;
    defaultBranch: string;
    isPrivate: boolean;
};

function parseArguments(values: string[])
{
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let index = 0; index < values.length; index += 1)
    {
        const value = values[index];

        if (!value.startsWith('--'))
        {
            positional.push(value);
            continue;
        }

        const name = value.slice(2);
        const next = values[index + 1];
        if (next && !next.startsWith('--'))
        {
            flags[name] = next;
            index += 1;
        }
        else
        {
            flags[name] = true;
        }
    }

    return { positional, flags };
}

function flagString(flags: Record<string, string | boolean>, name: string)
{
    return typeof flags[name] === 'string' ? flags[name] as string : undefined;
}

async function promptForToken()
{
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function')
    {
        throw new Error('Set SECUREREPOS_TOKEN when login is running without an interactive terminal');
    }

    process.stdout.write('CLI token: ');
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();

    return new Promise<string>(function (resolve, reject)
    {
        let token = '';

        const cleanup = function ()
        {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
        };
        const onData = function (chunk: string | Buffer)
        {
            const value = String(chunk);

            if (value === '\u0003')
            {
                cleanup();
                reject(new Error('Login cancelled'));
                return;
            }

            if (value.includes('\r') || value.includes('\n'))
            {
                cleanup();
                resolve(token.trim());
                return;
            }

            if (value === '\u007f' || value === '\b')
            {
                token = token.slice(0, -1);
                return;
            }

            token += value.replace(/[\u0000-\u001f\u007f]/g, '');
        };

        process.stdin.on('data', onData);
    });
}

function printHelp()
{
    console.log(`SecureRepos CLI ${version}

Usage:
  securerepos login
  securerepos logout
  securerepos repos [--json]
  securerepos scan [--path <directory>] [--repository <owner/name>]
                   [--low-resource] [--max-files <count>]
                   [--fail-on critical|high|medium|low|none] [--json]

Environment:
  SECUREREPOS_TOKEN`);
}

function severityRank(severity: string)
{
    return ({ critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>)[severity] ?? 0;
}

function color(value: string, code: number)
{
    return process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[${code}m${value}\u001b[0m` : value;
}

function printFindings(findings: Array<Record<string, unknown>>, counts: Record<string, number>)
{
    console.log(`\nCritical ${counts.critical || 0}  High ${counts.high || 0}  Medium ${counts.medium || 0}  Low ${counts.low || 0}`);

    for (const finding of findings)
    {
        const severity = String(finding.severity || 'medium');
        const label = severity === 'critical' || severity === 'high'
            ? color(severity.toUpperCase(), 31)
            : severity === 'medium'
                ? color('MEDIUM', 33)
                : color('LOW', 36);
        const location = `${String(finding.filePath || 'repository')}${finding.lineNumber ? `:${finding.lineNumber}` : ''}`;
        console.log(`${label}  ${String(finding.title || 'Security finding')}`);
        console.log(`        ${location}`);
    }
}

async function commandLogin(flags: Record<string, string | boolean>)
{
    const token = flagString(flags, 'token') || process.env.SECUREREPOS_TOKEN || await promptForToken();

    if (!token)
    {
        throw new Error('Pass --token or set SECUREREPOS_TOKEN');
    }

    const config = await resolveCliConfig({ token });
    const payload = await cliApiRequest<{ data: { user: { email: string }; token: { expiresAt: string } } }>(config, '/api/cli/v1/me');
    await writeCliConfig(config);
    console.log(`Authenticated as ${payload.data.user.email}`);
    console.log(`Token expires ${new Date(payload.data.token.expiresAt).toLocaleString()}`);
}

async function commandRepos(flags: Record<string, string | boolean>)
{
    const config = await resolveCliConfig(
        {
            token: flagString(flags, 'token')
        }
    );
    const payload = await cliApiRequest<{ data: CliRepository[] }>(config, '/api/cli/v1/repositories');

    if (flags.json)
    {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (payload.data.length === 0)
    {
        console.log('No approved repositories are connected.');
        return;
    }

    for (const repository of payload.data)
    {
        console.log(`${repository.fullName}${repository.isPrivate ? ' (private)' : ''}`);
    }
}

async function commandScan(flags: Record<string, string | boolean>)
{
    const config = await resolveCliConfig(
        {
            token: flagString(flags, 'token')
        }
    );
    const directory = path.resolve(flagString(flags, 'path') || process.cwd());
    const context = await getGitRepositoryContext(directory);
    const repositories = await cliApiRequest<{ data: CliRepository[] }>(config, '/api/cli/v1/repositories');
    const requestedRepository = flagString(flags, 'repository');
    const expectedFullName = requestedRepository || context.fullName;
    const repository = repositories.data.find((item) => item.fullName.toLowerCase() === expectedFullName.toLowerCase());

    if (!repository)
    {
        throw new Error(`${expectedFullName} is not approved in your SecureRepos dashboard`);
    }

    if (requestedRepository && requestedRepository.toLowerCase() !== context.fullName.toLowerCase())
    {
        throw new Error('--repository must match the current Git origin remote');
    }

    if (!flags.json)
    {
        console.log(`Scanning ${repository.fullName} on ${context.branch}`);
    }

    const maxFilesValue = flagString(flags, 'max-files');
    const maxFiles = maxFilesValue === undefined ? undefined : Number(maxFilesValue);
    if (maxFiles !== undefined && (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 2000))
    {
        throw new Error('--max-files must be an integer between 1 and 2000');
    }

    const localResult = await scanLocalTrackedFiles(
        context.root,
        context.trackedFiles,
        {
            lowResource: Boolean(flags['low-resource']),
            maxFiles,
            onProgress: flags.json ? undefined : (message) => process.stderr.write(`\r${message}`)
        }
    );

    if (!flags.json)
    {
        process.stderr.write('\r\x1b[K');
        console.log(`Local scan complete: ${localResult.filesScanned} scanned, ${localResult.filesSkipped} skipped`);
        console.log('Checking dependency vulnerabilities and syncing dashboard...');
    }

    const payload = await cliApiRequest<{
        data: {
            scan: { id: number; counts: Record<string, number> };
            findings: Array<Record<string, unknown>>;
            newFindingCount: number;
            securityAlertCandidateCount: number;
        };
    }>(
        config,
        '/api/cli/v1/scans',
        {
            method: 'POST',
            timeoutMs: 180_000,
            body:
            {
                repositoryId: repository.id,
                branch: context.branch,
                commitSha: context.commitSha,
                clientVersion: version,
                filesScanned: localResult.filesScanned,
                filesSkipped: localResult.filesSkipped,
                durationMs: localResult.durationMs,
                findings: localResult.findings,
                dependencies: localResult.dependencies
            }
        }
    );

    if (flags.json)
    {
        console.log(JSON.stringify(payload, null, 2));
    }
    else
    {
        printFindings(payload.data.findings, payload.data.scan.counts);
        console.log(`\nDashboard synced as scan #${payload.data.scan.id}.`);
        if (payload.data.securityAlertCandidateCount > 0)
        {
            console.log('New critical/high alerts will follow your plan email policy.');
        }
    }

    const failOn = flagString(flags, 'fail-on') || 'high';
    if (!['critical', 'high', 'medium', 'low', 'none'].includes(failOn))
    {
        throw new Error('--fail-on must be critical, high, medium, low, or none');
    }

    if (failOn !== 'none' && payload.data.findings.some((finding) =>
        severityRank(String(finding.severity)) >= severityRank(failOn)))
    {
        process.exitCode = 1;
    }
}

async function main()
{
    const { positional, flags } = parseArguments(process.argv.slice(2));
    const command = positional[0] || 'help';

    if (command === 'help' || flags.help)
    {
        printHelp();
        return;
    }

    if (command === 'version' || flags.version)
    {
        console.log(version);
        return;
    }

    if (command === 'login')
    {
        await commandLogin(flags);
        return;
    }

    if (command === 'logout')
    {
        await deleteCliConfig();
        console.log('SecureRepos CLI credentials removed.');
        return;
    }

    if (command === 'repos')
    {
        await commandRepos(flags);
        return;
    }

    if (command === 'scan')
    {
        await commandScan(flags);
        return;
    }

    throw new Error(`Unknown command: ${command}`);
}

main().catch(function (error)
{
    console.error(`SecureRepos CLI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
});
