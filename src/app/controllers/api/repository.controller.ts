import { Request, Response } from 'express';
import { Op } from 'sequelize';

import { Finding, GithubInstallation, Repository, Scan } from '../../../db/models';
import { enqueueAllActiveRepositories, enqueueRepositoryScan } from '../../services/scan.service';

function paginationFromRequest(req: Request)
{
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const cursor = Number(req.query.cursor);

    return {
        limit,
        cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : null
    };
}

async function listRepositoriesController(req: Request, res: Response)
{
    const pagination = paginationFromRequest(req);
    const repositories = await Repository.findAll(
        {
            where:
            {
                isActive: true,
                ...(pagination.cursor
                    ? {
                        id:
                        {
                            [Op.lt]: pagination.cursor
                        }
                    }
                    : {})
            },
            include:
            [
                {
                    model: GithubInstallation,
                    as: 'githubInstallation'
                }
            ],
            order: [['id', 'DESC']],
            limit: pagination.limit + 1
        }
    );
    const total = await Repository.count({ where: { isActive: true } });
    const nextCursor = repositories.length > pagination.limit ? repositories[pagination.limit - 1].id : null;

    return res.json(
        {
            data: repositories.slice(0, pagination.limit),
            pagination:
            {
                limit: pagination.limit,
                nextCursor
            },
            total
        }
    );
}

async function enqueueRepositoryScanController(req: Request, res: Response)
{
    const repositoryId = Number(req.params.repositoryId);

    if (!Number.isFinite(repositoryId))
    {
        return res.status(400).json(
            {
                message: 'Invalid repository id'
            }
        );
    }

    const scan = await enqueueRepositoryScan(repositoryId, 'manual');

    if (!scan)
    {
        return res.status(404).json(
            {
                message: 'Repository not found or inactive'
            }
        );
    }

    return res.status(201).json(
        {
            message: 'Scan queued',
            data: scan
        }
    );
}

async function enqueueAllRepositoriesScanController(req: Request, res: Response)
{
    const scans = await enqueueAllActiveRepositories('manual_all');

    return res.status(201).json(
        {
            message: 'Scans queued',
            data:
            {
                count: scans.length
            }
        }
    );
}

async function getScanController(req: Request, res: Response)
{
    const scanId = Number(req.params.scanId);

    if (!Number.isFinite(scanId))
    {
        return res.status(400).json(
            {
                message: 'Invalid scan id'
            }
        );
    }

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

    if (!scan)
    {
        return res.status(404).json(
            {
                message: 'Scan not found'
            }
        );
    }

    return res.json(
        {
            data: scan
        }
    );
}

async function listRepositoryFindingsController(req: Request, res: Response)
{
    const repositoryId = Number(req.params.repositoryId);

    if (!Number.isFinite(repositoryId))
    {
        return res.status(400).json(
            {
                message: 'Invalid repository id'
            }
        );
    }

    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId,
                status: 'open'
            },
            order:
            [
                ['severity', 'ASC'],
                ['createdAt', 'DESC']
            ]
        }
    );

    return res.json(
        {
            data: findings
        }
    );
}

export {
    listRepositoriesController,
    enqueueRepositoryScanController,
    enqueueAllRepositoriesScanController,
    getScanController,
    listRepositoryFindingsController
};
