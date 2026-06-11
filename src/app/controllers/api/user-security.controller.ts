import { Response } from 'express';

import { CodeHostConnection, Finding, Repository, Scan, User } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import {
    getRepositoryChecklist,
    markScanAsBaseline,
    updateFindingWorkflow
} from '../../services/security-posture.service';
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

async function listUserRepositoriesController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const connections = await CodeHostConnection.findAll({ where: { tenantId: user.tenantId } });
    const repositories = await Repository.findAll(
        {
            where:
            {
                codeHostConnectionId: connections.map((connection) => connection.id),
                isActive: true
            },
            order: [['securityScore', 'ASC'], ['updatedAt', 'DESC']]
        }
    );

    return res.json({ data: repositories });
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
    listUserFindingsController,
    updateUserFindingController,
    getUserRepositoryChecklistController,
    markUserBaselineController,
    getTenantRepositoryIds
};
