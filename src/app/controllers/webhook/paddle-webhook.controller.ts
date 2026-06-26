import { Request, Response } from 'express';

import { applyPaddleWebhook, verifyPaddleWebhookSignature } from '../../services/paddle.service';

async function paddleWebhookController(req: Request, res: Response)
{
    const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : (req as Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody)
    {
        return res.status(400).json({ message: 'Raw body is not available for webhook verification' });
    }

    if (!verifyPaddleWebhookSignature(rawBody, req.header('Paddle-Signature') ?? undefined))
    {
        return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    let payload;

    try
    {
        payload = JSON.parse(rawBody.toString('utf8'));
    }
    catch (error)
    {
        return res.status(400).json({ message: 'Invalid webhook JSON payload' });
    }

    try
    {
        const subscription = await applyPaddleWebhook(payload);

        return res.json(
            {
                message: 'Paddle webhook processed',
                data:
                {
                    subscriptionId: subscription.id,
                    status: subscription.status
                }
            }
        );
    }
    catch (error)
    {
        return res.status(422).json({ message: error instanceof Error ? error.message : 'Paddle webhook could not be processed' });
    }
}

export {
    paddleWebhookController
};
