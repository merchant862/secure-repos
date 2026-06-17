import { Response } from 'express';
import { Op } from 'sequelize';

import { CodeHostConnection, Finding, Repository, Scan, User } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import {
    getRepositoryChecklist,
    markScanAsBaseline,
    updateFindingWorkflow
} from '../../services/security-posture.service';
import { enqueueRepositoryScan } from '../../services/scan.service';
import { assertManualScanAllowed, getTenantPlan } from '../../services/plan-limit.service';
import { recordAuditLog } from '../../services/audit.service';
import { queueFindingAssignedEmail, queueFindingStatusEmail } from '../../services/notification.service';

async function getTenantRepositoryIds(tenantId: number)
{
    const connections = await CodeHostConnection.findAll({ where: { tenantId } });
    const connectionIds = connections.map((connection) => connection.id);
    const repositories = await Repository.findAll(
        {
            where:
            {
                codeHostConnectionId: connectionIds,
                isActive: true
            }
        }
    );

    return repositories.map((repository) => repository.id);
}

function paginationFromRequest(req: AuthenticatedRequest)
{
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const cursor = Number(req.query.cursor);

    return {
        limit,
        cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : null
    };
}

function repositoryStatusWhere(status: unknown)
{
    if (status === 'critical')
    {
        return { securityScore: { [Op.lt]: 70 } };
    }

    if (status === 'healthy')
    {
        return { securityScore: { [Op.gte]: 85 } };
    }

    return {};
}

async function getTenantRepositories(tenantId: number)
{
    const connections = await CodeHostConnection.findAll({ where: { tenantId } });

    return Repository.findAll(
        {
            where:
            {
                codeHostConnectionId: connections.map((connection) => connection.id),
                isActive: true
            },
            order: [['securityScore', 'ASC'], ['updatedAt', 'DESC']]
        }
    );
}

async function listUserRepositoriesController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const plan = await getTenantPlan(user.tenantId);
    const githubConnection = await CodeHostConnection.findOne(
        {
            where:
            {
                tenantId: user.tenantId,
                provider: 'github',
                isActive: true
            },
            order: [['updatedAt', 'DESC']]
        }
    );
    const pagination = paginationFromRequest(req);
    const connections = await CodeHostConnection.findAll({ where: { tenantId: user.tenantId } });
    const connectionIds = connections.map((connection) => connection.id);
    const where =
    {
        codeHostConnectionId: connectionIds,
        isActive: true,
        ...repositoryStatusWhere(req.query.status),
        ...(pagination.cursor ? { id: { [Op.lt]: pagination.cursor } } : {})
    };
    const [repositoryCount, paginatedRepositories] = await Promise.all(
        [
            Repository.count(
                {
                    where:
                    {
                        codeHostConnectionId: connectionIds,
                        isActive: true,
                        ...repositoryStatusWhere(req.query.status)
                    }
                }
            ),
            Repository.findAll(
                {
                    where,
                    order: [['id', 'DESC']],
                    limit: pagination.limit + 1
                }
            )
        ]
    );
    const hasMore = paginatedRepositories.length > pagination.limit;
    const visibleRepositories = hasMore ? paginatedRepositories.slice(0, pagination.limit) : paginatedRepositories;
    const nextCursor = hasMore ? visibleRepositories[visibleRepositories.length - 1]?.id ?? null : null;

    return res.json(
        {
            data: visibleRepositories,
            meta:
            {
                plan:
                {
                    name: plan?.name ?? 'Starter',
                    repositoryLimit: plan?.repositoryLimit ?? null
                },
                repositoryCount,
                githubConnection
            },
            pagination:
            {
                limit: pagination.limit,
                nextCursor
            }
        }
    );
}

async function getUserDashboardSummaryController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const repositories = await getTenantRepositories(user.tenantId);
    const repositoryIds = repositories.map((repository) => repository.id);
    const openFindingWhere = { repositoryId: repositoryIds, status: 'open' };
    const [openFindings, criticalFindings, queuedScans, recentFindings, recentScans] = await Promise.all(
        [
            repositoryIds.length ? Finding.count({ where: openFindingWhere }) : 0,
            repositoryIds.length ? Finding.count({ where: { ...openFindingWhere, severity: 'critical' } }) : 0,
            Scan.count(
                {
                    where:
                    {
                        tenantId: user.tenantId,
                        status:
                        {
                            [Op.in]: ['queued', 'running', 'retry']
                        }
                    }
                }
            ),
            repositoryIds.length
                ? Finding.findAll(
                    {
                        where: openFindingWhere,
                        include: [{ model: Repository, as: 'repository' }],
                        order: [['lastSeenAt', 'DESC'], ['createdAt', 'DESC']],
                        limit: 6
                    }
                )
                : [],
            Scan.findAll(
                {
                    where: { tenantId: user.tenantId },
                    include: [{ model: Repository, as: 'repository' }],
                    order: [['createdAt', 'DESC']],
                    limit: 6
                }
            )
        ]
    );
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

    if (repositoryIds.length)
    {
        const findings = await Finding.findAll({ where: openFindingWhere, attributes: ['severity'] });

        for (const finding of findings)
        {
            if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
            {
                severityCounts[finding.severity] += 1;
            }
        }
    }

    const score = repositories.length
        ? Math.round(repositories.reduce((total, repository) => total + Number(repository.securityScore ?? 0), 0) / repositories.length)
        : 0;
    const dashboardRepositories = Array.from(
        new Map(
            [
                ...recentScans
                    .map((scan) => scan.get('repository') as Repository | undefined)
                    .filter((repository): repository is Repository => Boolean(repository)),
                ...repositories
                    .slice()
                    .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime())
            ]
                .map((repository) => [repository.id, repository])
        ).values()
    ).slice(0, 3);
    const githubConnection = await CodeHostConnection.findOne(
        {
            where:
            {
                tenantId: user.tenantId,
                provider: 'github',
                isActive: true
            },
            order: [['updatedAt', 'DESC']]
        }
    );

    return res.json(
        {
            data:
            {
                metrics:
                {
                    repositories: repositories.length,
                    openFindings,
                    criticalFindings,
                    queuedScans,
                    averageScore: score
                },
                severityCounts,
                recentFindings,
                recentScans,
                dashboardRepositories,
                githubConnection
            }
        }
    );
}

async function listUserScansController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const pagination = paginationFromRequest(req);
    const where =
    {
        tenantId: user.tenantId,
        ...(pagination.cursor
            ? {
                id:
                {
                    [Op.lt]: pagination.cursor
                }
            }
            : {})
    };
    const scans = await Scan.findAll(
        {
            where,
            include: [{ model: Repository, as: 'repository' }],
            order: [['id', 'DESC']],
            limit: pagination.limit + 1
        }
    );
    const total = await Scan.count({ where: { tenantId: user.tenantId } });

    return res.json(
        {
            data: scans.slice(0, pagination.limit),
            pagination:
            {
                limit: pagination.limit,
                nextCursor: scans.length > pagination.limit ? scans[pagination.limit - 1].id : null
            },
            total
        }
    );
}

async function getUserRepositoryController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const repositoryId = Number(req.params.repositoryId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isFinite(repositoryId))
    {
        return res.status(400).json({ message: 'Invalid repository id' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);

    if (!repositoryIds.includes(repositoryId))
    {
        return res.status(404).json({ message: 'Repository not found' });
    }

    const [repository, latestScan, openFindingsCount, recentScans, checklist] = await Promise.all(
        [
            Repository.findByPk(repositoryId),
            Scan.findOne({ where: { repositoryId }, order: [['createdAt', 'DESC']] }),
            Finding.count({ where: { repositoryId, status: 'open' } }),
            Scan.findAll({ where: { repositoryId }, order: [['createdAt', 'DESC']], limit: 10 }),
            getRepositoryChecklist(repositoryId)
        ]
    );

    return res.json(
        {
            data:
            {
                repository,
                latestScan,
                openFindingsCount,
                recentScans,
                checklist
            }
        }
    );
}

async function listUserFindingsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);
    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId: repositoryIds,
                status: req.query.status ? String(req.query.status) : 'open'
            },
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 200
        }
    );

    return res.json({ data: findings });
}

async function updateUserFindingController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const findingId = Number(req.params.findingId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isFinite(findingId))
    {
        return res.status(400).json({ message: 'Invalid finding id' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);
    const existingFinding = await Finding.findByPk(findingId);

    if (!existingFinding || !repositoryIds.includes(existingFinding.repositoryId))
    {
        return res.status(404).json({ message: 'Finding not found' });
    }

    const previousAssignedToUserId = existingFinding.assignedToUserId;
    const previousStatus = existingFinding.status;
    const finding = await updateFindingWorkflow(
        findingId,
        {
            status: req.body.status,
            assignedToUserId: req.body.assignedToUserId === undefined ? undefined : Number(req.body.assignedToUserId),
            ignoredUntil: req.body.ignoredUntil ? new Date(req.body.ignoredUntil) : req.body.ignoredUntil === null ? null : undefined
        }
    );

    if (!finding)
    {
        return res.status(404).json({ message: 'Finding not found' });
    }

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'finding.updated',
            entityType: 'finding',
            entityId: String(findingId),
            metadata: req.body
        }
    );
    const repository = await Repository.findByPk(finding.repositoryId);

    if (repository && finding.assignedToUserId && finding.assignedToUserId !== previousAssignedToUserId)
    {
        const assignedUser = await User.findOne({ where: { id: finding.assignedToUserId, tenantId: user.tenantId, status: 'active' } });

        if (assignedUser)
        {
            await queueFindingAssignedEmail(finding, repository, assignedUser);
        }
    }

    if (repository && req.body.status && req.body.status !== previousStatus)
    {
        await queueFindingStatusEmail(user.tenantId, finding, repository, String(req.body.status));
    }

    return res.json(
        {
            message: 'Finding updated',
            data: finding
        }
    );
}

async function getUserRepositoryChecklistController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const repositoryId = Number(req.params.repositoryId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);

    if (!repositoryIds.includes(repositoryId))
    {
        return res.status(404).json({ message: 'Repository not found' });
    }

    return res.json(
        {
            data: await getRepositoryChecklist(repositoryId)
        }
    );
}

async function enqueueUserRepositoryScanController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const repositoryId = Number(req.params.repositoryId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isFinite(repositoryId))
    {
        return res.status(400).json({ message: 'Invalid repository id' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);

    if (!repositoryIds.includes(repositoryId))
    {
        return res.status(404).json({ message: 'Repository not found' });
    }

    try
    {
        await assertManualScanAllowed(user.tenantId, repositoryId);
    }
    catch (error)
    {
        return res.status(429).json({ message: error instanceof Error ? error.message : 'Manual scan limit reached.' });
    }

    const scan = await enqueueRepositoryScan(repositoryId, 'manual_user');

    if (!scan)
    {
        return res.status(404).json({ message: 'Repository not found or inactive' });
    }

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'scan.queued',
            entityType: 'repository',
            entityId: String(repositoryId),
            metadata:
            {
                scanId: scan.id,
                trigger: 'manual_user'
            }
        }
    );

    return res.status(201).json(
        {
            message: 'Scan queued',
            data: scan
        }
    );
}

async function markUserBaselineController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const scanId = Number(req.params.scanId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);
    const scan = await Scan.findByPk(scanId);

    if (!scan || !repositoryIds.includes(scan.repositoryId))
    {
        return res.status(404).json({ message: 'Scan not found' });
    }

    await markScanAsBaseline(scan.id);
    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'scan.baseline_set',
            entityType: 'scan',
            entityId: String(scan.id)
        }
    );

    return res.json(
        {
            message: 'Baseline scan updated',
            data: scan
        }
    );
}

export {
    listUserRepositoriesController,
    getUserDashboardSummaryController,
    getUserRepositoryController,
    listUserScansController,
    listUserFindingsController,
    updateUserFindingController,
    getUserRepositoryChecklistController,
    enqueueUserRepositoryScanController,
    markUserBaselineController,
    getTenantRepositoryIds
};
