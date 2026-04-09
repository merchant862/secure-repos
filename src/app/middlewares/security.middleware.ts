import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

function securityMiddleware(req: Request, res: Response, next: NextFunction)
{
    const requestId = req.header('x-request-id') ?? crypto.randomUUID();

    res.setHeader('x-request-id', requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-permitted-cross-domain-policies', 'none');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    res.setHeader(
        'content-security-policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );

    return next();
}

export {
    securityMiddleware
};
