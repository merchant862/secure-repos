import { Request, Response } from 'express';

const appName = process.env.APP_NAME && process.env.APP_NAME.trim() !== '' ? process.env.APP_NAME : 'SecureRepos';
const defaultDescription = 'SecureRepos helps GitHub teams scan repositories for secrets, risky configs, CI/CD issues, dependency risk, and security workflow gaps.';
const supportEmail = 'support@purple-flare.com';

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
        seo: publicSeo(req, 'SecureRepos | GitHub Repository Security Scanning')
    });
}

function demoPageController(req: Request, res: Response)
{
    const requestedPage = Array.isArray(req.params.page) ? req.params.page[0] : req.params.page;
    const page = requestedPage ?? 'dashboard';
    const allowedPages = ['dashboard', 'repositories', 'scans', 'findings', 'reports', 'team', 'settings', 'notifications', 'pricing', 'billing', 'profile', 'onboarding'];
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
        scans: 'Scans',
        settings: 'Settings',
        team: 'Team'
    };

    return res.render('demo/page',
    {
        title: `Demo ${titles[normalizedPage]}`,
        appName,
        seo: publicSeo(req, `${titles[normalizedPage]} Demo | SecureRepos`, 'Explore a SecureRepos demo workspace for GitHub repository scanning, findings triage, security reports, team workflow, and app setup.', req.path),
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
        seo: publicSeo(req, 'SecureRepos Pricing | GitHub Security Scanning Plans', 'Compare SecureRepos plans for GitHub repository security scanning, team seats, scheduled scans, reports, and security workflow coverage.')
    });
}

function faqPageController(req: Request, res: Response)
{
    return res.render('public/faq',
    {
        title: 'FAQ',
        appName,
        supportEmail,
        seo: publicSeo(req, 'SecureRepos FAQ | GitHub Security Scanner Questions', 'Answers about SecureRepos GitHub repository scanning, app access, findings, reports, team seats, billing, and support.', '/faqs')
    });
}

function contactPageController(req: Request, res: Response)
{
    return res.render('public/contact',
    {
        title: 'Contact Us',
        appName,
        supportEmail,
        seo: publicSeo(req, 'Contact SecureRepos | GitHub Security Scanner Support', 'Contact SecureRepos for account, billing, support, GitHub repository scanning, and security workflow questions.', '/contact')
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

function scansPageController(req: Request, res: Response)
{
    return res.render('dashboard/scans', { title: 'Scans', appName, seo: privateSeo() });
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
    const rootUrl = getBaseUrl(req);

    return res.render('legal/placeholder',
    {
        title: legalPages[normalizedSlug],
        appName,
        legalTitle: legalPages[normalizedSlug],
        supportEmail,
        websiteUrl: rootUrl,
        legalSlug: normalizedSlug,
        seo: publicSeo(req, `${legalPages[normalizedSlug]} | SecureRepos`, `${legalPages[normalizedSlug]} for SecureRepos GitHub repository security scanning and workspace services.`)
    });
}

export
{
    acceptInvitationPageController,
    billingPageController,
    contactPageController,
    demoPageController,
    faqPageController,
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
    scansPageController,
    settingsPageController,
    signInPageController,
    signUpPageController,
    teamPageController
};
