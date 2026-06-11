import { NextFunction, Request, Response } from 'express';

import { User } from '../../db/models';
import { resolveSession } from '../services/auth.service';

type AuthenticatedRequest = Request & { currentUser?: User };

const authCookieName = process.env.AUTH_COOKIE_NAME && process.env.AUTH_COOKIE_NAME.trim() !== ''
    ? process.env.AUTH_COOKIE_NAME
    : 'security_platform_token';

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
    const user = await resolveUserFromRequest(req);

    if (!user)
    {
        const nextPath = encodeURIComponent(req.originalUrl || req.path);

        return res.redirect(`/sign-in?next=${nextPath}`);
    }

    return next();
}

function requireOwnerOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    if (!req.currentUser || !['owner', 'admin'].includes(req.currentUser.role))
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
    requireOwnerOrAdmin
};
