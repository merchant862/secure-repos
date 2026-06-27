import { NextFunction, Request, Response } from 'express';

import { User, UserSession } from '../../db/models';
import { resolveSession } from '../services/auth.service';

type AuthenticatedRequest = Request & { currentUser?: User; currentSession?: UserSession };

const authCookieName = process.env.AUTH_COOKIE_NAME && process.env.AUTH_COOKIE_NAME.trim() !== ''
    ? process.env.AUTH_COOKIE_NAME
    : 'security_platform_token';
const allowedNextPathPrefixes =
[
    '/billing',
    '/checkout',
    '/dashboard',
    '/findings',
    '/notifications',
    '/onboarding',
    '/repositories',
    '/scans',
    '/settings'
];

function getCookieValue(req: Request, name: string): string
{
    const cookieHeader = req.header('cookie');

    if (!cookieHeader)
    {
        return '';
    }

    const cookies = cookieHeader.split(';');

    for (const cookie of cookies)
    {
        const [rawKey, ...rawValue] = cookie.trim().split('=');

        if (rawKey === name)
        {
            return decodeURIComponent(rawValue.join('='));
        }
    }

    return '';
}

function getRequestToken(req: Request): string
{
    const authorization = req.header('authorization');

    if (authorization?.startsWith('Bearer '))
    {
        return authorization.slice('Bearer '.length);
    }

    return getCookieValue(req, authCookieName);
}

function getSafeNextPath(req: Request): string
{
    const nextPath = req.originalUrl || req.path || '/dashboard';

    if (!nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.includes('\\'))
    {
        return '/dashboard';
    }

    let parsed: URL;

    try
    {
        parsed = new URL(nextPath, 'https://securerepos.local');
    }
    catch (error)
    {
        return '/dashboard';
    }

    if (parsed.origin !== 'https://securerepos.local')
    {
        return '/dashboard';
    }

    const isAllowedPath = allowedNextPathPrefixes.some(function (prefix)
    {
        return parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`);
    });

    return isAllowedPath ? `${parsed.pathname}${parsed.search}` : '/dashboard';
}

async function resolveUserFromRequest(req: AuthenticatedRequest)
{
    const token = getRequestToken(req);

    if (!token)
    {
        return null;
    }

    const resolved = await resolveSession(token);

    if (!resolved)
    {
        return null;
    }

    req.currentUser = resolved.user;
    req.currentSession = resolved.session;
    return resolved.user;
}

async function userAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    const user = await resolveUserFromRequest(req);

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    return next();
}

async function userPageAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = await resolveUserFromRequest(req);

    if (!user)
    {
        const nextPath = encodeURIComponent(getSafeNextPath(req));

        return res.redirect(`/sign-in?next=${nextPath}`);
    }

    return next();
}

async function guestPageMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    const user = await resolveUserFromRequest(req);

    if (user)
    {
        return res.redirect('/dashboard');
    }

    return next();
}

function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    if (!req.currentUser || req.currentUser.role !== 'owner')
    {
        return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
}

export type {
    AuthenticatedRequest
};

export {
    userAuthMiddleware,
    userPageAuthMiddleware,
    guestPageMiddleware,
    resolveUserFromRequest,
    requireOwner
};
