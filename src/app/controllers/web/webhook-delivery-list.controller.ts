import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/app-error';
import { getWebhookDeliverySummary, listWebhookDeliveries } from '../../../modules/github/github-webhook-admin.service';

async function webhookDeliveryListController(req: Request, res: Response, next: NextFunction)
{
    try
    {
        const rawLimit = Number(req.query.limit ?? 25);
        const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 25 : Math.min(rawLimit, 100);

        const deliveries = await listWebhookDeliveries(limit);
        const summary = await getWebhookDeliverySummary();

        return res.status(200).json(
            {
                message: 'Webhook deliveries fetched successfully',
                data:
                {
                    summary,
                    count: deliveries.length,
                    deliveries
                }
            }
        );
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            return next(new AppError(error.message, 500));
        }

        return next(new AppError('Failed to fetch webhook deliveries', 500));
    }
}

export {
    webhookDeliveryListController
};
