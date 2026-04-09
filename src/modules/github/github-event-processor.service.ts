import { syncRepositoriesForGithubInstallation } from './github-repository-sync.service';
import { deactivateGithubInstallationByGithubId, findGithubInstallationByGithubId } from './github-installation.service';
import {
    ensureWebhookDelivery,
    markWebhookDeliveryFailed,
    markWebhookDeliveryIgnored,
    markWebhookDeliveryProcessed
} from './github-webhook-delivery.service';
import { GithubInstallCallbackQuery, NormalizedGithubWebhookEvent } from './github.types';
import { processGithubInstallCallback } from './github-install-callback.service';

type GithubWebhookPayloadWithAction =
{
    action?: string;
    installation?: {
        id?: number;
    };
    repositories_removed?: Array<{ id?: number }>;
};

type ProcessGithubWebhookResult =
{
    deliveryId: string;
    event: string | null;
    action: string | null;
    status: 'processed' | 'ignored' | 'duplicate';
};

async function handleInstallationEvent(action: string | undefined, payload: GithubWebhookPayloadWithAction)
{
    const installationId = payload.installation?.id ? String(payload.installation.id) : undefined;

    if (!installationId)
    {
        return 'installation id missing in payload';
    }

    if (action === 'deleted')
    {
        await deactivateGithubInstallationByGithubId(installationId);
        return null;
    }

    await processGithubInstallCallback(
        {
            query:
            {
                installation_id: installationId
            } as GithubInstallCallbackQuery
        }
    );

    const installation = await findGithubInstallationByGithubId(installationId);

    if (!installation)
    {
        return 'installation was not persisted locally';
    }

    await syncRepositoriesForGithubInstallation(installation.id);

    return null;
}

async function handleInstallationRepositoriesEvent(payload: GithubWebhookPayloadWithAction)
{
    const installationId = payload.installation?.id ? String(payload.installation.id) : undefined;

    if (!installationId)
    {
        return 'installation id missing in payload';
    }

    const installation = await findGithubInstallationByGithubId(installationId);

    if (!installation)
    {
        return 'installation not found locally';
    }

    await syncRepositoriesForGithubInstallation(installation.id);

    return null;
}

async function processGithubWebhookEvent(deliveryId: string, webhookEvent: NormalizedGithubWebhookEvent): Promise<ProcessGithubWebhookResult>
{
    const payload = (webhookEvent.payload ?? {}) as GithubWebhookPayloadWithAction;
    const action = payload.action ?? null;

    const webhookDeliveryState = await ensureWebhookDelivery(deliveryId, webhookEvent.event ?? 'unknown', action);

    if (webhookDeliveryState.isDuplicate)
    {
        return {
            deliveryId,
            event: webhookEvent.event,
            action,
            status: 'duplicate'
        };
    }

    try
    {
        let ignoreReason: string | null = null;

        if (webhookEvent.event === 'installation')
        {
            ignoreReason = await handleInstallationEvent(payload.action, payload);
        }
        else if (webhookEvent.event === 'installation_repositories')
        {
            ignoreReason = await handleInstallationRepositoriesEvent(payload);
        }
        else
        {
            ignoreReason = `event ${webhookEvent.event ?? 'unknown'} is not handled yet`;
        }

        if (ignoreReason)
        {
            await markWebhookDeliveryIgnored(deliveryId, ignoreReason);

            return {
                deliveryId,
                event: webhookEvent.event,
                action,
                status: 'ignored'
            };
        }

        await markWebhookDeliveryProcessed(deliveryId);

        return {
            deliveryId,
            event: webhookEvent.event,
            action,
            status: 'processed'
        };
    }
    catch (error)
    {
        await markWebhookDeliveryFailed(
            deliveryId,
            error instanceof Error ? error.message : 'webhook processing failed'
        );

        throw error;
    }
}

export {
    processGithubWebhookEvent
};
