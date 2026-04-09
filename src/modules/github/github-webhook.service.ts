import { GithubWebhookHeaders, NormalizedGithubWebhookEvent } from './github.types';
import { verifyGithubWebhookSignature } from './github.service';

type VerifyGithubWebhookInput =
{
    payload: Buffer;
    headers: GithubWebhookHeaders;
};

function parseGithubWebhookPayload(payload: Buffer): unknown
{
    const rawPayload = payload.toString('utf8');

    if (!rawPayload)
    {
        return {};
    }

    try
    {
        return JSON.parse(rawPayload);
    }
    catch (error)
    {
        throw new Error('GitHub webhook payload is not valid JSON');
    }
}

function verifyAndNormalizeGithubWebhook(input: VerifyGithubWebhookInput): NormalizedGithubWebhookEvent
{
    const isSignatureValid = verifyGithubWebhookSignature(input.payload, input.headers.signature256);

    if (!isSignatureValid)
    {
        throw new Error('Invalid webhook signature');
    }

    return {
        event: input.headers.event ?? null,
        delivery: input.headers.delivery ?? null,
        payload: parseGithubWebhookPayload(input.payload)
    };
}

export {
    parseGithubWebhookPayload,
    verifyAndNormalizeGithubWebhook
};
