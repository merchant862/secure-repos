import { Response } from 'express';
import { Op } from 'sequelize';

import { CiRuntimeEvent, CodeHostConnection, Finding, FindingOccurrence, Repository, Scan, TenantSubscription } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import {
    getRepositoryChecklist,
    markScanAsBaseline,
    updateFindingWorkflow
} from '../../services/security-posture.service';
import { enqueueRepositoryScan } from '../../services/scan.service';
import { assertManualScanAllowed, entitlementsForPlan, getTenantPlan } from '../../services/plan-limit.service';
import { recordAuditLog } from '../../services/audit.service';
import { queueFindingStatusEmail } from '../../services/notification.service';
import { createSafeRemediationPr, isSafePrFinding } from '../../services/remediation-pr.service';

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

async function tenantHistoryCutoff(tenantId: number)
{
    const plan = await getTenantPlan(tenantId);
    const days = Number(plan?.findingHistoryDays ?? 90);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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

function buildBranchSummary(findings: Array<{ branch: string | null; severity: string }>)
{
    const summary = new Map<string, { branch: string; critical: number; high: number; medium: number; low: number; total: number }>();

    for (const finding of findings)
    {
        const branch = finding.branch || 'unknown';
        const current = summary.get(branch) ?? { branch, critical: 0, high: 0, medium: 0, low: 0, total: 0 };

        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            current[finding.severity] += 1;
        }

        current.total += 1;
        summary.set(branch, current);
    }

    return Array.from(summary.values()).sort((left, right) => left.branch.localeCompare(right.branch));
}

function findingMetadata(finding: Finding)
{
    return (finding.metadata ?? {}) as Record<string, unknown>;
}

function confidenceOf(finding: Finding)
{
    const confidence = findingMetadata(finding).confidence;
    return typeof confidence === 'string' ? confidence : 'medium';
}

function categoryOf(finding: Finding)
{
    const category = findingMetadata(finding).category;
    return typeof category === 'string' ? category : 'Security review';
}

function estimateRemainingSeconds(scan: Scan | null)
{
    if (!scan || !['queued', 'running', 'retry'].includes(scan.status)) return null;

    const metadata = (scan.metadata ?? {}) as Record<string, unknown>;
    const estimatedCompletedAt = typeof metadata.estimatedCompletedAt === 'string'
        ? new Date(metadata.estimatedCompletedAt)
        : null;
    if (!estimatedCompletedAt || Number.isNaN(estimatedCompletedAt.getTime())) return null;

    return Math.max(0, Math.ceil((estimatedCompletedAt.getTime() - Date.now()) / 1000));
}

async function buildRepositoryRiskSummary(repositoryId: number)
{
    const [openFindings, latestScan, previousScan] = await Promise.all(
        [
            Finding.findAll({ where: { repositoryId, status: 'open' }, order: [['severity', 'ASC'], ['lastSeenAt', 'DESC']] }),
            Scan.findOne({ where: { repositoryId }, order: [['createdAt', 'DESC']] }),
            Scan.findOne({ where: { repositoryId }, order: [['createdAt', 'DESC']], offset: 1 })
        ]
    );
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    const categories = new Map<string, number>();

    for (const finding of openFindings)
    {
        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            counts[finding.severity] += 1;
        }
        categories.set(categoryOf(finding), (categories.get(categoryOf(finding)) ?? 0) + 1);
    }

    const currentHighRisk = Number(latestScan?.findingsCritical ?? 0) + Number(latestScan?.findingsHigh ?? 0);
    const previousHighRisk = Number(previousScan?.findingsCritical ?? 0) + Number(previousScan?.findingsHigh ?? 0);
    const partial = Boolean((latestScan?.metadata as Record<string, unknown> | null)?.partial);
    const topActions = openFindings
        .filter((finding) => finding.severity === 'critical' || finding.severity === 'high')
        .slice(0, 3)
        .map((finding) => ({
            id: finding.id,
            title: finding.title,
            severity: finding.severity,
            category: categoryOf(finding),
            confidence: confidenceOf(finding),
            filePath: finding.filePath,
            remediation: finding.remediation
        }));

    return {
        posture: counts.critical > 0 ? 'Critical attention needed' : counts.high > 0 ? 'High-risk fixes pending' : openFindings.length > 0 ? 'Review recommended' : 'No open repository findings',
        counts,
        highRiskDelta: latestScan && previousScan ? currentHighRisk - previousHighRisk : null,
        topCategories: Array.from(categories.entries())
            .sort((left, right) => right[1] - left[1])
            .slice(0, 4)
            .map(([category, total]) => ({ category, total })),
        topActions,
        coverage:
        {
            partial,
            scannedFiles: (latestScan?.metadata as Record<string, unknown> | null)?.scannedFiles ?? null,
            scannedBranches: (latestScan?.metadata as Record<string, unknown> | null)?.scannedBranches ?? null,
            skippedBranches: (latestScan?.metadata as Record<string, unknown> | null)?.skippedBranches ?? null,
            limitReason: (latestScan?.metadata as Record<string, unknown> | null)?.limitReason ?? null,
            estimatedRemainingSeconds: estimateRemainingSeconds(latestScan)
        }
    };
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

    const [plan, subscription] = await Promise.all(
        [
            getTenantPlan(user.tenantId),
            TenantSubscription.findOne({ where: { tenantId: user.tenantId } })
        ]
    );
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
                    repositoryLimit: subscription?.status === 'trialing' ? 1 : plan?.repositoryLimit ?? null
                },
                subscriptionStatus: subscription?.status ?? 'pending',
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
    const [openFindings, criticalFindings, queuedScans, totalScans, recentFindings, recentScans] = await Promise.all(
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
            Scan.count({ where: { tenantId: user.tenantId } }),
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
                    scans: totalScans,
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
    const historyCutoff = await tenantHistoryCutoff(user.tenantId);
    const where =
    {
        tenantId: user.tenantId,
        createdAt: { [Op.gte]: historyCutoff },
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
    const total = await Scan.count({ where: { tenantId: user.tenantId, createdAt: { [Op.gte]: historyCutoff } } });

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

async function getUserScanController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;
    const scanId = Number(req.params.scanId);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Number.isFinite(scanId))
    {
        return res.status(400).json({ message: 'Invalid scan id' });
    }

    const repositoryIds = await getTenantRepositoryIds(user.tenantId);
    const scan = await Scan.findByPk(
        scanId,
        {
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ]
        }
    );

    const historyCutoff = await tenantHistoryCutoff(user.tenantId);
    if (!scan || !repositoryIds.includes(scan.repositoryId) || scan.createdAt < historyCutoff)
    {
        return res.status(404).json({ message: 'Scan not found' });
    }

    const occurrences = await FindingOccurrence.findAll(
        {
            where: { scanId: scan.id },
            order: [['branch', 'ASC'], ['severity', 'ASC'], ['createdAt', 'DESC']]
        }
    );
    const findings = occurrences.length > 0
        ? await Finding.findAll({ where: { id: { [Op.in]: occurrences.map((occurrence) => occurrence.findingId) } } })
        : await Finding.findAll({ where: { scanId: scan.id }, order: [['branch', 'ASC'], ['severity', 'ASC'], ['createdAt', 'DESC']] });
    const findingById = new Map(findings.map((finding) => [Number(finding.id), finding]));
    const responseFindings = occurrences.length > 0
        ? occurrences.map(function (occurrence)
        {
            const finding = findingById.get(Number(occurrence.findingId));
            return {
                ...occurrence.toJSON(),
                id: occurrence.findingId,
                status: finding?.status ?? 'open',
                firstSeenAt: finding?.firstSeenAt ?? occurrence.createdAt,
                lastSeenAt: finding?.lastSeenAt ?? occurrence.createdAt,
                resolvedAt: finding?.resolvedAt ?? null
            };
        })
        : findings;

    return res.json(
        {
            data:
            {
                scan,
                branchSummary: buildBranchSummary(responseFindings),
                findings: responseFindings
            }
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

    const [repository, latestScan, openFindingsCount, recentScans, checklist, riskSummary] = await Promise.all(
        [
            Repository.findByPk(repositoryId),
            Scan.findOne({ where: { repositoryId }, order: [['createdAt', 'DESC']] }),
            Finding.count({ where: { repositoryId, status: 'open' } }),
            Scan.findAll({ where: { repositoryId }, order: [['createdAt', 'DESC']], limit: 10 }),
            getRepositoryChecklist(repositoryId),
            buildRepositoryRiskSummary(repositoryId)
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
                checklist,
                riskSummary
            }
        }
    );
}

async function listUserRepositoryRuntimeEventsController(req: AuthenticatedRequest, res: Response)
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

    const repository = await Repository.findByPk(repositoryId);
    if (!repository)
    {
        return res.status(404).json({ message: 'Repository not found' });
    }

    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
    const events = await CiRuntimeEvent.findAll(
        {
            where:
            {
                tenantId: user.tenantId,
                repositoryFullName: repository.fullName
            },
            order: [['observedAt', 'DESC']],
            limit
        }
    );

    return res.json(
        {
            data:
            {
                events,
                summary:
                {
                    critical: events.filter((event) => event.severity === 'critical').length,
                    high: events.filter((event) => event.severity === 'high').length,
                    medium: events.filter((event) => event.severity === 'medium').length,
                    low: events.filter((event) => event.severity === 'low').length
                }
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
    const status = String(req.query.status || 'open');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const baseWhere = { repositoryId: repositoryIds };
    const statusWhere = status === 'all'
        ? {}
        : status === 'snoozed'
            ? { ignoredUntil: { [Op.gt]: now } }
            : { status };
    const [findings, criticalCount, highCount, snoozedCount, resolvedThisMonth] = await Promise.all(
        [
            repositoryIds.length
                ? Finding.findAll(
                    {
                        where:
                        {
                            ...baseWhere,
                            ...statusWhere
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
                )
                : [],
            repositoryIds.length ? Finding.count({ where: { ...baseWhere, status: 'open', severity: 'critical' } }) : 0,
            repositoryIds.length ? Finding.count({ where: { ...baseWhere, status: 'open', severity: 'high' } }) : 0,
            repositoryIds.length ? Finding.count({ where: { ...baseWhere, ignoredUntil: { [Op.gt]: now } } }) : 0,
            repositoryIds.length ? Finding.count({ where: { ...baseWhere, status: 'resolved', resolvedAt: { [Op.gte]: monthStart } } }) : 0
        ]
    );

    return res.json(
        {
            data: findings,
            meta:
            {
                summary:
                {
                    critical: criticalCount,
                    high: highCount,
                    snoozed: snoozedCount,
                    resolvedThisMonth
                }
            }
        }
    );
}

async function getUserFindingController(req: AuthenticatedRequest, res: Response)
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
    const finding = await Finding.findByPk(
        findingId,
        {
            include:
            [
                {
                    model: Repository,
                    as: 'repository'
                }
            ]
        }
    );

    if (!finding || !repositoryIds.includes(finding.repositoryId))
    {
        return res.status(404).json({ message: 'Finding not found' });
    }

    const occurrences = await FindingOccurrence.findAll(
        {
            where: { findingId: finding.id },
            order: [['createdAt', 'DESC']],
            limit: 10
        }
    );

    const plan = await getTenantPlan(user.tenantId);
    const entitlements = entitlementsForPlan(plan);

    return res.json(
        {
            data:
            {
                finding,
                occurrences,
                remediation:
                {
                    prSupported: isSafePrFinding(finding),
                    prIncluded: entitlements.safeRemediationPr,
                    requiredPlan: entitlements.safeRemediationPr ? null : 'Pro'
                }
            }
        }
    );
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

    const previousStatus = existingFinding.status;
    const nextStatus = req.body.status === undefined ? undefined : String(req.body.status);
    const allowedStatuses = new Set(['open', 'resolved', 'ignored']);
    const ignoredUntil = req.body.ignoredUntil
        ? new Date(req.body.ignoredUntil)
        : req.body.ignoredUntil === null ? null : undefined;

    if (nextStatus !== undefined && !allowedStatuses.has(nextStatus))
    {
        return res.status(400).json({ message: 'Invalid finding status' });
    }

    if (ignoredUntil instanceof Date && Number.isNaN(ignoredUntil.getTime()))
    {
        return res.status(400).json({ message: 'Invalid ignored until date' });
    }

    const finding = await updateFindingWorkflow(
        findingId,
        {
            status: nextStatus,
            ignoredUntil
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

    const subscription = await TenantSubscription.findOne({ where: { tenantId: user.tenantId } });

    if (
        repository
        && subscription?.status === 'active'
        && nextStatus
        && nextStatus !== previousStatus
        && (finding.severity === 'critical' || finding.severity === 'high')
    )
    {
        await queueFindingStatusEmail(user.tenantId, finding, repository, nextStatus);
    }

    return res.json(
        {
            message: 'Finding updated',
            data: finding
        }
    );
}

async function verifyUserFindingController(req: AuthenticatedRequest, res: Response)
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
    const finding = await Finding.findByPk(findingId);

    if (!finding || !repositoryIds.includes(finding.repositoryId))
    {
        return res.status(404).json({ message: 'Finding not found' });
    }

    const scanMode = await assertManualScanAllowed(user.tenantId, finding.repositoryId);
    const scan = await enqueueRepositoryScan(finding.repositoryId, 'manual_user', scanMode);

    await finding.update(
        {
            metadata:
            {
                ...((finding.metadata as object | null) ?? {}),
                verificationRequestedAt: new Date().toISOString(),
                verificationScanId: scan?.id ?? null
            } as object
        }
    );

    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'finding.verify_requested',
            entityType: 'finding',
            entityId: String(finding.id),
            metadata:
            {
                scanId: scan?.id ?? null
            }
        }
    );

    return res.status(202).json(
        {
            message: scan ? 'Verification scan queued' : 'A scan is already queued or running for this repository',
            data:
            {
                finding,
                scan
            }
        }
    );
}

async function createFindingRemediationPrController(req: AuthenticatedRequest, res: Response)
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
    const finding = await Finding.findByPk(findingId);

    if (!finding || !repositoryIds.includes(finding.repositoryId))
    {
        return res.status(404).json({ message: 'Finding not found' });
    }

    const plan = await getTenantPlan(user.tenantId);
    const entitlements = entitlementsForPlan(plan);

    if (!entitlements.safeRemediationPr)
    {
        return res.status(403).json({ message: 'Safe remediation PRs require the Pro plan.' });
    }

    try
    {
        const pr = await createSafeRemediationPr(finding);
        await recordAuditLog(
            {
                tenantId: user.tenantId,
                userId: user.id,
                action: 'finding.remediation_pr_created',
                entityType: 'finding',
                entityId: String(finding.id),
                metadata: { prUrl: pr.html_url, prNumber: pr.number }
            }
        );
        return res.status(201).json({ message: 'Remediation PR created', data: pr });
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Remediation PR could not be created' });
    }
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
        const scanMode = await assertManualScanAllowed(user.tenantId, repositoryId);
        const scan = await enqueueRepositoryScan(repositoryId, 'manual_user', scanMode);

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
                    trigger: 'manual_user',
                    mode: scanMode
                }
            }
        );

        return res.status(201).json(
            {
                message: scanMode === 'preview' ? 'Security Preview queued' : 'Scan queued',
                data: scan
            }
        );
    }
    catch (error)
    {
        return res.status(429).json({ message: error instanceof Error ? error.message : 'Manual scan limit reached.' });
    }
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
    listUserRepositoryRuntimeEventsController,
    listUserScansController,
    getUserScanController,
    getUserFindingController,
    listUserFindingsController,
    updateUserFindingController,
    verifyUserFindingController,
    createFindingRemediationPrController,
    getUserRepositoryChecklistController,
    enqueueUserRepositoryScanController,
    markUserBaselineController,
    getTenantRepositoryIds
};
