import { Request, Response } from 'express';
import { env } from '../../../bootstrap/env';

function dashboardController(req: Request, res: Response)
{
    return res.render('dashboard/index',
    {
        title: 'Dashboard',
        appName: env.appName
    });
}

export 
{
    dashboardController
};
