import { Request, Response } from 'express';
import { GithubWebhookEvent, Repository } from '../../../db/models';
import { syncGithubInstallationFromWebhook } from '../../services/github-sync.service';
import { enqueueRepositoryScan } from '../../services/scan.service';
import { GithubWebhookHeaders, GithubWebhookPayload } from '../../../modules/github/github.types';
import { verifyGithubWebhookSignature } from '../../../modules/github/github.service';

async function githubWebhookController(req: Request, res: Response)
{
    const headers: GithubWebhookHeaders =
    {
        event: req.header('x-github-event') ?? undefined,
        delivery: req.header('x-github-delivery') ?? undefined,
        signature256: req.header('x-hub-signature-256') ?? undefined
    };

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody)
    {
        return res.status(500).json(
            {
                message: 'Raw body is not available for webhook verification'
            }
        );
    }

    const isSignatureValid = verifyGithubWebhookSignature(rawBody, headers.signature256);

    if (!isSignatureValid)
    {
        return res.status(401).json(
            {
                message: 'Invalid webhook signature'
            }
        );
    }

    if (!headers.delivery || !headers.event)
    {
        return res.status(400).json(
            {
                message: 'Missing GitHub delivery or event header'
            }
        );
    }

    let payload: GithubWebhookPayload;

    try
    {
        payload = JSON.parse(rawBody.toString('utf8')) as GithubWebhookPayload;
    }
    catch (error)
    {
        return res.status(400).json(
            {
                message: 'Invalid webhook JSON payload'
            }
        );
    }

    const existingDelivery = await GithubWebhookEvent.findOne(
        {
            where:
            {
                deliveryId: headers.delivery
            }
        }
    );

    if (existingDelivery)
    {
        return res.status(200).json(
            {
                message: 'GitHub webhook already processed',
                data:
                {
                    event: existingDelivery.event,
                    delivery: existingDelivery.deliveryId,
                    status: existingDelivery.status
                }
            }
        );
    }

    const webhookEvent = await GithubWebhookEvent.create(
        {
            deliveryId: headers.delivery,
            event: headers.event,
            action: payload.action ?? null,
            status: 'processing'
        }
    );

    try
    {
        const syncedRepositories = headers.event === 'installation' || headers.event === 'installation_repositories'
            ? await syncGithubInstallationFromWebhook(payload)
            : [];

        if ((headers.event === 'push' || headers.event === 'pull_request') && payload.repository)
        {
            const repository = await Repository.findOne(
                {
                    where:
                    {
                        githubRepositoryId: String(payload.repository.id),
                        isActive: true
                    }
                }
            );

            if (repository)
            {
                await enqueueRepositoryScan(repository.id, headers.event === 'pull_request' ? 'pull_request' : 'push');
            }
        }

        await webhookEvent.update(
            {
                status: 'processed',
                processedAt: new Date()
            }
        );

        return res.status(200).json(
            {
                message: 'GitHub webhook processed',
                data:
                {
                    event: headers.event,
                    delivery: headers.delivery,
                    action: payload.action ?? null,
                    repositoriesSynced: syncedRepositories.length
                }
            }
        );
    }
    catch (error)
    {
        await webhookEvent.update(
            {
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown webhook processing error',
                processedAt: new Date()
            }
        );

        throw error;
    }
}

export {
    githubWebhookController
};
