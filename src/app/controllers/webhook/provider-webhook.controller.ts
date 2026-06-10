import crypto from 'crypto';
import { Request, Response } from 'express';

import { env } from '../../../bootstrap/env';
import { Repository } from '../../../db/models';
import { enqueueRepositoryScan } from '../../services/scan.service';

function verifyBitbucketSignature(rawBody: Buffer, signature?: string): boolean
{
    if (!env.bitbucketWebhookSecret || !signature)
    {
        return false;
    }

    const expected = `sha256=${crypto
        .createHmac('sha256', env.bitbucketWebhookSecret)
        .update(rawBody)
        .digest('hex')}`;
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length)
    {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

async function gitlabWebhookController(req: Request, res: Response)
{
    if (env.gitlabWebhookSecret && req.header('x-gitlab-token') !== env.gitlabWebhookSecret)
    {
        return res.status(401).json({ message: 'Invalid GitLab webhook token' });
    }

    const project = req.body?.project;
    const repositoryId = project?.id ? String(project.id) : undefined;

    if (!repositoryId)
    {
        return res.status(202).json({ message: 'GitLab webhook ignored' });
    }

    const repository = await Repository.findOne(
        {
            where:
            {
                provider: 'gitlab',
                externalRepositoryId: repositoryId,
                isActive: true
            }
        }
    );

    if (repository)
    {
        await enqueueRepositoryScan(repository.id, 'gitlab_webhook');
    }

    return res.json(
        {
            message: 'GitLab webhook processed',
            data:
            {
                repositoryMatched: Boolean(repository)
            }
        }
    );
}

async function bitbucketWebhookController(req: Request, res: Response)
{
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.header('x-hub-signature');

    if (env.bitbucketWebhookSecret && !verifyBitbucketSignature(rawBody, signature ?? undefined))
    {
        return res.status(401).json({ message: 'Invalid Bitbucket webhook signature' });
    }

    const repositoryPayload = req.body?.repository;
    const repositoryId = repositoryPayload?.uuid ? String(repositoryPayload.uuid) : undefined;

    if (!repositoryId)
    {
        return res.status(202).json({ message: 'Bitbucket webhook ignored' });
    }

    const repository = await Repository.findOne(
        {
            where:
            {
                provider: 'bitbucket',
                externalRepositoryId: repositoryId,
                isActive: true
            }
        }
    );

    if (repository)
    {
        await enqueueRepositoryScan(repository.id, 'bitbucket_webhook');
    }

    return res.json(
        {
            message: 'Bitbucket webhook processed',
            data:
            {
                repositoryMatched: Boolean(repository)
            }
        }
    );
}

export {
    gitlabWebhookController,
    bitbucketWebhookController
};
