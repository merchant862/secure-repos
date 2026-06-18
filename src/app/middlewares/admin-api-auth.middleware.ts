import { NextFunction, Request, Response } from 'express';

import { Admin } from '../../db/models';
import { resolveAdminSession } from '../services/admin-auth.service';

interface AuthenticatedAdminRequest extends Request
{
    currentAdmin?: Admin;
}

const adminCookieName = 'secure_repos_admin_session';

function getCookieValue(req: Request, name: string): string
{
    const cookieHeader = req.header('cookie');

    if (!cookieHeader) return '';

    for (const cookie of cookieHeader.split(';'))
    {
        const [key, ...value] = cookie.trim().split('=');
        if (key === name) return decodeURIComponent(value.join('='));
    }

    return '';
}

async function adminApiAuthMiddleware(req: AuthenticatedAdminRequest, res: Response, next: NextFunction)
{
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : getCookieValue(req, adminCookieName);

    if (!token)
    {
        return res.status(401).json(
            {
                message: 'Unauthorized'
            }
        );
    }

    const resolved = await resolveAdminSession(token);

    if (!resolved)
    {
        return res.status(401).json(
            {
                message: 'Unauthorized'
            }
        );
    }

    req.currentAdmin = resolved.admin;

    return next();
}

async function adminPageAuthMiddleware(req: AuthenticatedAdminRequest, res: Response, next: NextFunction)
{
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const token = getCookieValue(req, adminCookieName);
    const resolved = token ? await resolveAdminSession(token) : null;

    if (!resolved)
    {
        return res.redirect('/admin/sign-in');
    }

    req.currentAdmin = resolved.admin;
    return next();
}

export {
    AuthenticatedAdminRequest,
    adminApiAuthMiddleware,
    adminPageAuthMiddleware,
    adminCookieName,
    getCookieValue
};
