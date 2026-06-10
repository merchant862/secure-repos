import { NextFunction, Request, Response } from 'express';

import { env } from '../../bootstrap/env';

function adminApiAuthMiddleware(req: Request, res: Response, next: NextFunction)
{
    if (!env.adminApiToken)
    {
        return next();
    }

    if (req.header('authorization') !== `Bearer ${env.adminApiToken}`)
    {
        return res.status(401).json(
            {
                message: 'Unauthorized'
            }
        );
    }

    return next();
}

export {
    adminApiAuthMiddleware
};
