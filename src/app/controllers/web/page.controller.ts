import { Request, Response } from 'express';

const appName = process.env.APP_NAME && process.env.APP_NAME.trim() !== '' ? process.env.APP_NAME : 'SecureRepos';
const defaultDescription = 'SecureRepos helps teams scan GitHub, GitLab, and Bitbucket repositories for secrets, risky configs, CI/CD issues, dependency risk, and security workflow gaps.';

function getBaseUrl(req: Request): string
{
    const configuredUrl = process.env.APP_URL || process.env.SITE_URL;

    if (configuredUrl)
    {
        return configuredUrl.replace(/\/$/, '');
    }

    return `${req.protocol}://${req.get('host')}`;
}

function canonical(req: Request, path = req.path): string
{
    return `${getBaseUrl(req)}${path}`;
}

function publicSeo(req: Request, title: string, description = defaultDescription, path = req.path)
{
    return {
        title,
        description,
        canonicalUrl: canonical(req, path),
        image: `${getBaseUrl(req)}/public/images/og-secure-repos.svg`,
        robots: 'index,follow'
    };
}

function privateSeo()
{
    return {
        robots: 'noindex,nofollow'
    };
}

function landingPageController(req: Request, res: Response)
{
    return res.render('landing/index',
    {
        title: 'Repository Security Scanning',
        appName,
        seo: publicSeo(req, 'SecureRepos | Repository Security Scanning for GitHub, GitLab & Bitbucket')
    });
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
        seo: publicSeo(req, `${titles[normalizedPage]} Demo | SecureRepos`, 'Explore a SecureRepos demo workspace for repository scanning, findings triage, security reports, team workflow, and provider setup.', req.path),
        page: normalizedPage,
        pageTitle: titles[normalizedPage]
    });
}

function signInPageController(req: Request, res: Response)
{
    return res.render('auth/signin',
    {
        title: 'Sign In',
        appName,
        seo: privateSeo()
    });
}

function signUpPageController(req: Request, res: Response)
{
    return res.render('auth/signup',
    {
        title: 'Create Account',
        appName,
        seo: privateSeo()
    });
}

function pricingPageController(req: Request, res: Response)
{
    return res.render('pricing/index',
    {
        title: 'Pricing',
        appName,
        seo: publicSeo(req, 'SecureRepos Pricing | Repository Security Scanning Plans', 'Compare SecureRepos plans for repository security scanning, team seats, scheduled scans, reports, and security workflow coverage.')
    });
}

function repositoriesPageController(req: Request, res: Response)
{
    return res.render('dashboard/repositories', { title: 'Repositories', appName, seo: privateSeo() });
}

function findingsPageController(req: Request, res: Response)
{
    return res.render('dashboard/findings', { title: 'Findings', appName, seo: privateSeo() });
}

function reportsPageController(req: Request, res: Response)
{
    return res.render('dashboard/reports', { title: 'Reports', appName, seo: privateSeo() });
}

function teamPageController(req: Request, res: Response)
{
    return res.render('dashboard/team', { title: 'Team', appName, seo: privateSeo() });
}

function settingsPageController(req: Request, res: Response)
{
    return res.render('dashboard/settings', { title: 'Settings', appName, seo: privateSeo() });
}

function notificationsPageController(req: Request, res: Response)
{
    return res.render('dashboard/notifications', { title: 'Notifications', appName, seo: privateSeo() });
}

function onboardingPageController(req: Request, res: Response)
{
    return res.render('dashboard/onboarding', { title: 'Onboarding', appName, seo: privateSeo() });
}

function billingPageController(req: Request, res: Response)
{
    return res.render('dashboard/billing', { title: 'Billing', appName, seo: privateSeo() });
}

function profilePageController(req: Request, res: Response)
{
    return res.render('dashboard/profile', { title: 'Profile', appName, seo: privateSeo() });
}

function repositoryDetailPageController(req: Request, res: Response)
{
    return res.render('dashboard/repository-detail', { title: 'Repository Detail', appName, repositoryId: req.params.repositoryId, seo: privateSeo() });
}

function findingDetailPageController(req: Request, res: Response)
{
    return res.render('dashboard/finding-detail', { title: 'Finding Detail', appName, findingId: req.params.findingId, seo: privateSeo() });
}

function acceptInvitationPageController(req: Request, res: Response)
{
    return res.render('auth/accept-invitation', { title: 'Accept Invitation', appName, token: req.query.token ?? '', seo: privateSeo() });
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
        legalTitle: legalPages[normalizedSlug],
        seo: publicSeo(req, `${legalPages[normalizedSlug]} | SecureRepos`, `${legalPages[normalizedSlug]} for SecureRepos repository security scanning and workspace services.`)
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
