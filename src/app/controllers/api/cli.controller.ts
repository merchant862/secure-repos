import { Response } from 'express';

import { CodeHostConnection, Repository } from '../../../db/models';
import { CliAuthenticatedRequest } from '../../middlewares/cli-auth.middleware';
import { recordAuditLog } from '../../services/audit.service';
import { submitCliScan } from '../../services/cli-scan.service';

async function getCliIdentityController(req: CliAuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const accessToken = req.cliAccessToken;

    if (!user || !accessToken)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json(
        {
            data:
            {
                user:
                {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                workspace:
                {
                    tenantId: user.tenantId
                },
                token:
                {
                    name: accessToken.name,
                    expiresAt: accessToken.expiresAt
                },
                scopes: ['identity:read', 'repositories:read', 'scans:write']
            }
        }
    );
}

async function listCliRepositoriesController(req: CliAuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const connections = await CodeHostConnection.findAll(
        {
            where:
            {
                tenantId: user.tenantId,
                provider: 'github',
                isActive: true
            },
            attributes: ['id']
        }
    );
    const repositories = await Repository.findAll(
        {
            where:
            {
                codeHostConnectionId: connections.map((connection) => connection.id),
                provider: 'github',
                isActive: true
            },
            attributes:
            [
                'id',
                'provider',
                'githubRepositoryId',
                'externalRepositoryId',
                'name',
                'fullName',
                'webUrl',
                'defaultBranch',
                'isPrivate'
            ],
            order: [['fullName', 'ASC']]
        }
    );

    return res.json(
        {
            data: repositories,
            meta:
            {
                repositoryCount: repositories.length,
                approvalSource: 'github_app'
            }
        }
    );
}

async function submitCliScanController(req: CliAuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const accessToken = req.cliAccessToken;

    if (!user || !accessToken)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try
    {
        const result = await submitCliScan(user.tenantId, req.body ?? {});

        await recordAuditLog(
            {
                tenantId: user.tenantId,
                userId: user.id,
                action: 'scan.completed',
                entityType: 'repository',
                entityId: String(result.repository.id),
                metadata:
                {
                    scanId: result.scan.id,
                    trigger: 'cli',
                    tokenId: accessToken.id,
                    branch: result.scan.branch,
                    commitSha: result.scan.commitSha,
                    counts: result.counts
                },
                ipAddress: req.ip
            }
        ).catch((error) => console.warn('CLI scan audit log failed:', error));

        return res.status(201).json(
            {
                message: 'CLI scan completed and synced',
                data:
                {
                    scan:
                    {
                        id: result.scan.id,
                        repositoryId: result.repository.id,
                        repositoryFullName: result.repository.fullName,
                        branch: result.scan.branch,
                        commitSha: result.scan.commitSha,
                        status: result.scan.status,
                        completedAt: result.scan.completedAt,
                        counts: result.counts
                    },
                    findings: result.findings,
                    newFindingCount: result.alertFindings.length,
                    securityAlertCandidateCount: result.alertFindings.filter((finding) =>
                        finding.severity === 'critical' || finding.severity === 'high').length
                }
            }
        );
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'CLI scan could not be submitted';
        const status = /wait|limit|already queued|already running/i.test(message)
            ? 429
            : /not approved/i.test(message)
                ? 404
                : 400;

        return res.status(status).json({ message });
    }
}

export {
    getCliIdentityController,
    listCliRepositoriesController,
    submitCliScanController
};
