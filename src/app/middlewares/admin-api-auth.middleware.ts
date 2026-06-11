import { NextFunction, Request, Response } from 'express';

import { Admin } from '../../db/models';
import { resolveAdminSession } from '../services/admin-auth.service';

interface AuthenticatedAdminRequest extends Request
{
    currentAdmin?: Admin;
}

async function adminApiAuthMiddleware(req: AuthenticatedAdminRequest, res: Response, next: NextFunction)
{
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

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

export {
    AuthenticatedAdminRequest,
    adminApiAuthMiddleware
};
