import { NextFunction, Request, Response } from 'express';

import { CliAccessToken, User } from '../../db/models';
import { authenticateCliAccessToken } from '../services/cli-access-token.service';

type CliAuthenticatedRequest = Request & { cliAccessToken?: CliAccessToken; currentUser?: User };

async function cliAccessTokenAuthMiddleware(req: CliAuthenticatedRequest, res: Response, next: NextFunction)
{
    res.setHeader('Cache-Control', 'no-store');

    const authorization = req.header('authorization') ?? '';
    const match = authorization.match(/^Bearer (srp_cli_[A-Za-z0-9_-]+)$/);

    if (!match)
    {
        return res.status(401).json({ message: 'A valid CLI access token is required' });
    }

    const authenticated = await authenticateCliAccessToken(match[1], req.ip);

    if (!authenticated)
    {
        return res.status(401).json({ message: 'CLI access token is invalid, expired, or revoked' });
    }

    req.cliAccessToken = authenticated.accessToken;
    req.currentUser = authenticated.user;
    return next();
}

export type {
    CliAuthenticatedRequest
};

export {
    cliAccessTokenAuthMiddleware
};
