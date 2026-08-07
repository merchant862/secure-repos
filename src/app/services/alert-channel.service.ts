import { AlertChannel, CodeHostConnection, Repository } from '../../db/models';
import { decryptSecret, encryptSecret } from './crypto.service';
import { entitlementsForPlan, getTenantPlan } from './plan-limit.service';

const supportedProviders = new Set(['slack', 'discord', 'teams', 'telegram', 'github_issues']);

function assertProvider(provider: string)
{
    if (!supportedProviders.has(provider))
    {
        throw new Error('Unsupported alert channel');
    }
}

function validateWebhookUrl(provider: string, webhookUrl: string)
{
    if (provider === 'telegram' || provider === 'github_issues')
    {
        return;
    }

    let parsed: URL;

    try
    {
        parsed = new URL(webhookUrl);
    }
    catch
    {
        throw new Error('Enter a valid webhook URL');
    }

    if (parsed.protocol !== 'https:')
    {
        throw new Error('Webhook URL must use HTTPS');
    }

    if (provider === 'slack' && !parsed.hostname.endsWith('slack.com'))
    {
        throw new Error('Slack webhook URL must be from slack.com');
    }

    if (provider === 'discord' && !parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com'))
    {
        throw new Error('Discord webhook URL must be from discord.com');
    }

    if (provider === 'teams' && !parsed.hostname.includes('office.com') && !parsed.hostname.includes('outlook.com'))
    {
        throw new Error('Microsoft Teams webhook URL must be from Microsoft connector domains');
    }
}

function maskedWebhook(provider: string)
{
    if (provider === 'slack') return 'https://hooks.slack.com/...';
    if (provider === 'discord') return 'https://discord.com/api/webhooks/...';
    if (provider === 'telegram') return 'Telegram bot token + chat ID';
    if (provider === 'github_issues') return 'Connected GitHub repository issues';
    return 'https://*.webhook.office.com/...';
}

function encryptedConfig(config: object)
{
    return encryptSecret(JSON.stringify(config));
}

function decryptedConfig(channel: AlertChannel): Record<string, unknown>
{
    if (!channel.configEncrypted) return {};

    try
    {
        const parsed = JSON.parse(decryptSecret(channel.configEncrypted)) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    }
    catch
    {
        return {};
    }
}

function publicAlertChannel(channel: AlertChannel)
{
    return {
        id: channel.id,
        provider: channel.provider,
        name: channel.name,
        isActive: channel.isActive,
        lastDeliveredAt: channel.lastDeliveredAt,
        lastError: channel.lastError,
        webhookUrl: maskedWebhook(channel.provider),
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt
    };
}

async function listAlertChannels(tenantId: number)
{
    const channels = await AlertChannel.findAll({ where: { tenantId }, order: [['createdAt', 'DESC']] });

    return channels.map(publicAlertChannel);
}

async function createAlertChannel(input: { tenantId: number; provider: string; name: string; webhookUrl?: string; botToken?: string; chatId?: string; repositoryId?: number })
{
    assertProvider(input.provider);
    validateWebhookUrl(input.provider, input.webhookUrl ?? '');

    const plan = await getTenantPlan(input.tenantId);
    const entitlements = entitlementsForPlan(plan);

    if (!entitlements.allowedAlertProviders.includes(input.provider))
    {
        throw new Error(`${input.provider === 'github_issues' ? 'GitHub Issues alerts' : 'This alert channel'} requires the Pro plan.`);
    }

    const existingCount = await AlertChannel.count({ where: { tenantId: input.tenantId, isActive: true } });
    if (existingCount >= entitlements.alertChannelLimit)
    {
        throw new Error(`Your ${plan?.name ?? 'current'} plan supports ${entitlements.alertChannelLimit} active alert channel${entitlements.alertChannelLimit === 1 ? '' : 's'}.`);
    }

    if (input.provider === 'telegram' && (!input.botToken || !input.chatId))
    {
        throw new Error('Telegram bot token and chat ID are required.');
    }

    if (input.provider === 'github_issues' && !input.repositoryId)
    {
        throw new Error('Choose a repository for GitHub Issues alerts.');
    }

    if (input.provider === 'github_issues' && input.repositoryId)
    {
        const connections = await CodeHostConnection.findAll({ where: { tenantId: input.tenantId } });
        const repository = await Repository.findOne(
            {
                where:
                {
                    id: input.repositoryId,
                    codeHostConnectionId: connections.map((connection) => connection.id),
                    isActive: true
                }
            }
        );

        if (!repository)
        {
            throw new Error('Choose a connected repository from this workspace.');
        }
    }

    const channel = await AlertChannel.create(
        {
            tenantId: input.tenantId,
            provider: input.provider,
            name: input.name.trim().slice(0, 100) || `${input.provider} alerts`,
            webhookUrlEncrypted: encryptSecret(input.provider === 'telegram' ? input.botToken ?? '' : input.webhookUrl ?? 'internal://github-issues'),
            configEncrypted: encryptedConfig(
                input.provider === 'telegram'
                    ? { chatId: input.chatId }
                    : input.provider === 'github_issues'
                        ? { repositoryId: input.repositoryId }
                        : {}
            ),
            isActive: true
        }
    );

    return publicAlertChannel(channel);
}

async function deleteAlertChannel(tenantId: number, channelId: number)
{
    const channel = await AlertChannel.findOne({ where: { id: channelId, tenantId } });
    if (!channel) return null;

    await channel.destroy();
    return channel;
}

async function activeAlertChannels(tenantId: number)
{
    return AlertChannel.findAll({ where: { tenantId, isActive: true }, order: [['createdAt', 'ASC']] });
}

function webhookUrlForChannel(channel: AlertChannel)
{
    return decryptSecret(channel.webhookUrlEncrypted);
}

function configForChannel(channel: AlertChannel)
{
    return decryptedConfig(channel);
}

export {
    activeAlertChannels,
    createAlertChannel,
    deleteAlertChannel,
    listAlertChannels,
    publicAlertChannel,
    configForChannel,
    webhookUrlForChannel
};
