import { ProviderSetting } from '../../db/models';

const defaultProviders =
[
    {
        provider: 'github',
        displayName: 'GitHub',
        sortOrder: 10,
        connectLabel: 'Connect GitHub',
        setupInstructions: 'Install the GitHub App and select repositories for scanning.',
        scanDefaults: { triggerFirstScan: true },
        planAvailability: { starter: true, team: true, growth: true },
        metadata: { authMode: 'github_app' }
    }
];
const supportedProviderNames = defaultProviders.map((item) => item.provider);

function isSupportedProvider(provider: string)
{
    return supportedProviderNames.includes(provider);
}

async function ensureDefaultProviderSettings()
{
    for (const provider of defaultProviders)
    {
        const existing = await ProviderSetting.findOne({ where: { provider: provider.provider } });

        if (!existing)
        {
            await ProviderSetting.create(
                {
                    ...provider,
                    isEnabled: true
                }
            );
        }
    }
}

async function listProviderSettings()
{
    await ensureDefaultProviderSettings();

    return ProviderSetting.findAll(
        {
            where:
            {
                provider: supportedProviderNames
            },
            order: [['sortOrder', 'ASC'], ['provider', 'ASC']]
        }
    );
}

async function getProviderSetting(provider: string)
{
    if (!isSupportedProvider(provider))
    {
        return null;
    }

    await ensureDefaultProviderSettings();

    return ProviderSetting.findOne({ where: { provider } });
}

async function assertProviderEnabled(provider: string)
{
    const setting = await getProviderSetting(provider);

    if (!setting)
    {
        throw new Error('Unsupported provider');
    }

    if (!setting.isEnabled)
    {
        throw new Error(`${setting.displayName} is currently disabled`);
    }

    return setting;
}

async function updateProviderSetting(provider: string, input: Record<string, unknown>)
{
    if (!isSupportedProvider(provider))
    {
        throw new Error('Unsupported provider');
    }

    const existing = await getProviderSetting(provider);
    const values =
    {
        displayName: typeof input.displayName === 'string' ? input.displayName : existing?.displayName ?? provider,
        isEnabled: typeof input.isEnabled === 'boolean' ? input.isEnabled : existing?.isEnabled ?? true,
        sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : existing?.sortOrder ?? 0,
        connectLabel: typeof input.connectLabel === 'string' ? input.connectLabel : existing?.connectLabel ?? 'Connect provider',
        setupInstructions: input.setupInstructions === null || typeof input.setupInstructions === 'string' ? input.setupInstructions : existing?.setupInstructions ?? null,
        scanDefaults: input.scanDefaults && typeof input.scanDefaults === 'object' ? input.scanDefaults : existing?.scanDefaults ?? null,
        planAvailability: input.planAvailability && typeof input.planAvailability === 'object' ? input.planAvailability : existing?.planAvailability ?? null,
        metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : existing?.metadata ?? null
    };

    if (existing)
    {
        return existing.update(values);
    }

    return ProviderSetting.create(
        {
            provider,
            ...values
        }
    );
}

export {
    assertProviderEnabled,
    listProviderSettings,
    getProviderSetting,
    updateProviderSetting
};
