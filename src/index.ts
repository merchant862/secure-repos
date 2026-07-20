#!/usr/bin/env node

import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ApiConfig, cliApiRequest } from './api.js';
import { getGitRepositoryContext } from './git.js';
import { scanLocalTrackedFiles } from './local-scan.js';

const version = '0.1.0';

type CliRepository =
{
    id: number;
    fullName: string;
    defaultBranch: string;
    isPrivate: boolean;
};

type ScanPayload =
{
    data:
    {
        scan:
        {
            id: number;
            repositoryId: number;
            repositoryFullName: string;
            branch: string;
            commitSha: string;
            status: string;
            completedAt: string | null;
            counts: Record<string, number>;
        };
        findings: Array<Record<string, unknown>>;
        newFindingCount: number;
        securityAlertCandidateCount: number;
    };
};

function getApiConfig(): ApiConfig
{
    const token = process.env.SECUREREPOS_API_KEY || process.env.SECUREREPOS_TOKEN;

    if (!token)
    {
        throw new Error('Set SECUREREPOS_API_KEY to a SecureRepos API token before starting the MCP server.');
    }

    return { token };
}

function text(value: string)
{
    return {
        content:
        [
            {
                type: 'text' as const,
                text: value
            }
        ]
    };
}

function jsonText(value: unknown)
{
    return text(JSON.stringify(value, null, 2));
}

async function listRepositories(config: ApiConfig)
{
    return cliApiRequest<{ data: CliRepository[]; meta: Record<string, unknown> }>(
        config,
        '/api/cli/v1/repositories'
    );
}

function formatRepositoryList(repositories: CliRepository[])
{
    if (repositories.length === 0)
    {
        return 'No approved repositories are connected in SecureRepos.';
    }

    return repositories
        .map((repository) => `- ${repository.fullName}${repository.isPrivate ? ' (private)' : ''}`)
        .join('\n');
}

function formatScanSummary(payload: ScanPayload)
{
    const counts = payload.data.scan.counts;
    const findings = payload.data.findings.slice(0, 20).map(function (finding)
    {
        const location = `${String(finding.filePath || 'repository')}${finding.lineNumber ? `:${finding.lineNumber}` : ''}`;
        return `- ${String(finding.severity || 'medium').toUpperCase()} ${String(finding.title || 'Security finding')} (${location})`;
    });

    return [
        `Scan #${payload.data.scan.id} synced for ${payload.data.scan.repositoryFullName}.`,
        `Branch: ${payload.data.scan.branch}`,
        `Commit: ${payload.data.scan.commitSha}`,
        `Counts: critical ${counts.critical || 0}, high ${counts.high || 0}, medium ${counts.medium || 0}, low ${counts.low || 0}`,
        `New findings: ${payload.data.newFindingCount}`,
        `Security alert candidates: ${payload.data.securityAlertCandidateCount}`,
        findings.length > 0 ? ['', 'Top findings:', ...findings].join('\n') : 'No findings returned.'
    ].join('\n');
}

const server = new McpServer(
    {
        name: 'securerepos',
        version
    }
);

server.registerTool(
    'get_identity',
    {
        title: 'Get SecureRepos Identity',
        description: 'Return the SecureRepos account, workspace, token expiry, and token scopes for this API key.',
        annotations:
        {
            readOnlyHint: true
        }
    },
    async function ()
    {
        const payload = await cliApiRequest(getApiConfig(), '/api/cli/v1/me');
        return jsonText(payload);
    }
);

server.registerTool(
    'list_repositories',
    {
        title: 'List Approved Repositories',
        description: 'List GitHub repositories approved for this SecureRepos account.',
        annotations:
        {
            readOnlyHint: true
        }
    },
    async function ()
    {
        const payload = await listRepositories(getApiConfig());
        return text(formatRepositoryList(payload.data));
    }
);

server.registerTool(
    'scan_current_repository',
    {
        title: 'Scan Current Repository',
        description: 'Scan the Git-tracked files in the current local GitHub repository and sync the result to SecureRepos.',
        inputSchema:
        {
            path: z.string().optional().describe('Local repository path. Defaults to the MCP server working directory.'),
            repository: z.string().optional().describe('Expected GitHub repository full name, for example owner/name. Must match origin remote.'),
            lowResource: z.boolean().optional().describe('Use smaller batches and scan fewer files. Defaults to true.'),
            maxFiles: z.number().int().min(1).max(2000).optional().describe('Maximum tracked files to inspect, between 1 and 2000.')
        }
    },
    async function (input)
    {
        const config = getApiConfig();
        const directory = path.resolve(input.path || process.cwd());
        const context = await getGitRepositoryContext(directory);
        const repositories = await listRepositories(config);
        const expectedFullName = input.repository || context.fullName;
        const repository = repositories.data.find((item) => item.fullName.toLowerCase() === expectedFullName.toLowerCase());

        if (!repository)
        {
            throw new Error(`${expectedFullName} is not approved in your SecureRepos dashboard.`);
        }

        if (input.repository && input.repository.toLowerCase() !== context.fullName.toLowerCase())
        {
            throw new Error('The repository input must match the current Git origin remote.');
        }

        const localResult = await scanLocalTrackedFiles(
            context.root,
            context.trackedFiles,
            {
                lowResource: input.lowResource ?? true,
                maxFiles: input.maxFiles,
                onProgress: (message) => console.error(message)
            }
        );

        const payload = await cliApiRequest<ScanPayload>(
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

        return text(formatScanSummary(payload));
    }
);

async function main()
{
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('SecureRepos MCP server running on stdio.');
}

main().catch(function (error)
{
    console.error(`SecureRepos MCP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
});
