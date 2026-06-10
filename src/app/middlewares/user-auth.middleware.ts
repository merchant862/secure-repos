import { NextFunction, Request, Response } from 'express';

import { User } from '../../db/models';
import { resolveSession } from '../services/auth.service';

type AuthenticatedRequest = Request & { currentUser?: User };

async function userAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction)
{
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

    if (!token)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const resolved = await resolveSession(token);

    if (!resolved)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    req.currentUser = resolved.user;
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
    requireOwnerOrAdmin
};
