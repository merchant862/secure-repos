import { WebhookDelivery } from '../../db/models/webhook-delivery.model';

async function listWebhookDeliveries(limit = 25)
{
    return WebhookDelivery.findAll(
        {
            limit,
            order:
            [
                ['createdAt', 'DESC']
            ]
        }
    );
}

async function getWebhookDeliverySummary()
{
    const totalDeliveries = await WebhookDelivery.count();
    const processedDeliveries = await WebhookDelivery.count(
        {
            where:
            {
                status: 'processed'
            }
        }
    );
    const failedDeliveries = await WebhookDelivery.count(
        {
            where:
            {
                status: 'failed'
            }
        }
    );
    const duplicateDeliveries = await WebhookDelivery.count(
        {
            where:
            {
                status: 'ignored'
            }
        }
    );

    return {
        totalDeliveries,
        processedDeliveries,
        failedDeliveries,
        duplicateDeliveries
    };
}

export {
    listWebhookDeliveries,
    getWebhookDeliverySummary
};
