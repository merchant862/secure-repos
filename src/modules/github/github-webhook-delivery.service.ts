import { WebhookDelivery } from '../../db/models/webhook-delivery.model';

async function createWebhookDelivery(deliveryId: string, eventName: string, action?: string | null)
{
    return WebhookDelivery.create(
        {
            deliveryId,
            eventName,
            action: action ?? null,
            status: 'received'
        }
    );
}

async function findWebhookDeliveryByDeliveryId(deliveryId: string)
{
    return WebhookDelivery.findOne(
        {
            where:
            {
                deliveryId
            }
        }
    );
}

async function ensureWebhookDelivery(deliveryId: string, eventName: string, action?: string | null)
{
    const existingDelivery = await findWebhookDeliveryByDeliveryId(deliveryId);

    if (existingDelivery)
    {
        return {
            delivery: existingDelivery,
            isDuplicate: true
        };
    }

    return {
        delivery: await createWebhookDelivery(deliveryId, eventName, action),
        isDuplicate: false
    };
}

async function markWebhookDeliveryProcessed(deliveryId: string)
{
    await WebhookDelivery.update(
        {
            status: 'processed',
            processedAt: new Date(),
            statusReason: null
        },
        {
            where:
            {
                deliveryId
            }
        }
    );
}

async function markWebhookDeliveryIgnored(deliveryId: string, reason: string)
{
    await WebhookDelivery.update(
        {
            status: 'ignored',
            processedAt: new Date(),
            statusReason: reason
        },
        {
            where:
            {
                deliveryId
            }
        }
    );
}

async function markWebhookDeliveryFailed(deliveryId: string, reason: string)
{
    await WebhookDelivery.update(
        {
            status: 'failed',
            statusReason: reason
        },
        {
            where:
            {
                deliveryId
            }
        }
    );
}

export {
    ensureWebhookDelivery,
    findWebhookDeliveryByDeliveryId,
    markWebhookDeliveryProcessed,
    markWebhookDeliveryIgnored,
    markWebhookDeliveryFailed
};
