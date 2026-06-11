import { Request, Response } from 'express';

import {
    getProviderSetting,
    listProviderSettings,
    updateProviderSetting
} from '../../services/provider-setting.service';

async function listAdminProviderSettingsController(req: Request, res: Response)
{
    const settings = await listProviderSettings();

    return res.json({ data: settings });
}

async function getAdminProviderSettingController(req: Request, res: Response)
{
    const setting = await getProviderSetting(String(req.params.provider));

    if (!setting)
    {
        return res.status(404).json({ message: 'Provider setting not found' });
    }

    return res.json({ data: setting });
}

async function updateAdminProviderSettingController(req: Request, res: Response)
{
    try
    {
        const setting = await updateProviderSetting(String(req.params.provider), req.body);

        return res.json(
            {
                message: 'Provider setting updated',
                data: setting
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Provider setting update failed' });
    }
}

export {
    listAdminProviderSettingsController,
    getAdminProviderSettingController,
    updateAdminProviderSettingController
};
