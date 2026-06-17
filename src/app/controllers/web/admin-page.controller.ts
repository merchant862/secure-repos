import { Request, Response } from 'express';

const appName = process.env.APP_NAME && process.env.APP_NAME.trim() !== '' ? process.env.APP_NAME : 'SecureRepos';

function privateSeo()
{
    return {
        robots: 'noindex,nofollow'
    };
}

function adminSignInPageController(req: Request, res: Response)
{
    return res.render('admin/signin',
    {
        title: 'Admin Sign In',
        appName,
        seo: privateSeo()
    });
}

function adminPanelPageController(req: Request, res: Response)
{
    const requestedPage = Array.isArray(req.params.adminPage) ? req.params.adminPage[0] : req.params.adminPage;
    const page = requestedPage ?? 'overview';
    const pages: Record<string, string> =
    {
        admins: 'Admins',
        overview: 'Overview',
        pricing: 'Pricing',
        provider: 'Provider',
        repositories: 'Repositories',
        scans: 'Scans',
        tenants: 'Tenants'
    };
    const adminPage = pages[page] ? page : 'overview';

    return res.render('admin/panel',
    {
        title: `${pages[adminPage]} Admin`,
        appName,
        adminPage,
        pageTitle: pages[adminPage],
        seo: privateSeo()
    });
}

export {
    adminSignInPageController,
    adminPanelPageController
};
