import { Request, Response } from 'express';
import { GithubWebhookHeaders } from '../../../modules/github/github.types';
import { verifyAndNormalizeGithubWebhook } from '../../../modules/github/github-webhook.service';
import { processGithubWebhookEvent } from '../../../modules/github/github-event-processor.service';

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

    if (!headers.delivery)
    {
        return res.status(400).json(
            {
                message: 'Missing x-github-delivery header'
            }
        );
    }

    try
    {
        const webhookEvent = verifyAndNormalizeGithubWebhook(
            {
                payload: rawBody,
                headers
            }
        );

        const processingResult = await processGithubWebhookEvent(headers.delivery, webhookEvent);

        return res.status(200).json(
            {
                message: 'GitHub webhook verified',
                data:
                {
                    event: webhookEvent.event,
                    delivery: webhookEvent.delivery,
                    action: processingResult.action,
                    status: processingResult.status,
                    payload: webhookEvent.payload
                }
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error && error.message === 'GitHub webhook payload is not valid JSON')
        {
            return res.status(400).json(
                {
                    message: error.message
                }
            );
        }

        return res.status(401).json(
            {
                message: error instanceof Error ? error.message : 'Invalid webhook signature'
            }
        );
    }
}

export {
    githubWebhookController
};
