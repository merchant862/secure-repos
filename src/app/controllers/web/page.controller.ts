import { Request, Response } from 'express';

const appName = 'Security Platform';

function landingPageController(req: Request, res: Response)
{
    return res.render('landing/index', { title: 'Code Security Dashboard', appName });
}

function demoPageController(req: Request, res: Response)
{
    const requestedPage = Array.isArray(req.params.page) ? req.params.page[0] : req.params.page;
    const page = requestedPage ?? 'dashboard';
    const allowedPages = ['dashboard', 'repositories', 'findings', 'reports', 'team', 'settings', 'notifications', 'pricing', 'billing', 'profile', 'onboarding'];
    const normalizedPage = allowedPages.includes(page) ? page : 'dashboard';
    const titles: Record<string, string> =
    {
        billing: 'Billing',
        dashboard: 'Dashboard',
        findings: 'Findings',
        notifications: 'Notifications',
        onboarding: 'Onboarding',
        pricing: 'Pricing',
        profile: 'Profile',
        reports: 'Reports',
        repositories: 'Repositories',
        settings: 'Settings',
        team: 'Team'
    };

    return res.render('demo/page',
    {
        title: `Demo ${titles[normalizedPage]}`,
        appName,
        page: normalizedPage,
        pageTitle: titles[normalizedPage]
    });
}

function signInPageController(req: Request, res: Response)
{
    return res.render('auth/signin',
    {
        title: 'Sign In',
        appName
    });
}

function signUpPageController(req: Request, res: Response)
{
    return res.render('auth/signup',
    {
        title: 'Create Account',
        appName
    });
}

function pricingPageController(req: Request, res: Response)
{
    return res.render('pricing/index',
    {
        title: 'Pricing',
        appName
    });
}

function repositoriesPageController(req: Request, res: Response)
{
    return res.render('dashboard/repositories', { title: 'Repositories', appName });
}

function findingsPageController(req: Request, res: Response)
{
    return res.render('dashboard/findings', { title: 'Findings', appName });
}

function reportsPageController(req: Request, res: Response)
{
    return res.render('dashboard/reports', { title: 'Reports', appName });
}

function teamPageController(req: Request, res: Response)
{
    return res.render('dashboard/team', { title: 'Team', appName });
}

function settingsPageController(req: Request, res: Response)
{
    return res.render('dashboard/settings', { title: 'Settings', appName });
}

function notificationsPageController(req: Request, res: Response)
{
    return res.render('dashboard/notifications', { title: 'Notifications', appName });
}

function onboardingPageController(req: Request, res: Response)
{
    return res.render('dashboard/onboarding', { title: 'Onboarding', appName });
}

function billingPageController(req: Request, res: Response)
{
    return res.render('dashboard/billing', { title: 'Billing', appName });
}

function profilePageController(req: Request, res: Response)
{
    return res.render('dashboard/profile', { title: 'Profile', appName });
}

function repositoryDetailPageController(req: Request, res: Response)
{
    return res.render('dashboard/repository-detail', { title: 'Repository Detail', appName, repositoryId: req.params.repositoryId });
}

function findingDetailPageController(req: Request, res: Response)
{
    return res.render('dashboard/finding-detail', { title: 'Finding Detail', appName, findingId: req.params.findingId });
}

function acceptInvitationPageController(req: Request, res: Response)
{
    return res.render('auth/accept-invitation', { title: 'Accept Invitation', appName, token: req.query.token ?? '' });
}

function legalPlaceholderPageController(req: Request, res: Response)
{
    const legalPages: Record<string, string> =
    {
        'do-not-sell': 'Do Not Sell or Share My Personal Information',
        privacy: 'Privacy Policy',
        'refund-policy': 'Refund Policy',
        terms: 'Terms and Conditions'
    };
    const slug = req.params.legalSlug ?? req.path.replace('/', '');
    const normalizedSlug = typeof slug === 'string' && legalPages[slug] ? slug : 'terms';

    return res.render('legal/placeholder',
    {
        title: legalPages[normalizedSlug],
        appName,
        legalTitle: legalPages[normalizedSlug]
    });
}

export
{
    acceptInvitationPageController,
    billingPageController,
    demoPageController,
    findingDetailPageController,
    findingsPageController,
    landingPageController,
    legalPlaceholderPageController,
    notificationsPageController,
    onboardingPageController,
    pricingPageController,
    profilePageController,
    reportsPageController,
    repositoryDetailPageController,
    repositoriesPageController,
    settingsPageController,
    signInPageController,
    signUpPageController,
    teamPageController
};
