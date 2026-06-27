import { Request, Response } from 'express';

const appName = process.env.APP_NAME && process.env.APP_NAME.trim() !== '' ? process.env.APP_NAME : 'SecureRepos';

function dashboardController(req: Request, res: Response)
{
    return res.render('dashboard/index',
    {
        title: 'Dashboard',
        appName
    });
}

export 
{
    dashboardController
};
