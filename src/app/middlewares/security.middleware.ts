import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateLimitEntry>();

function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction)
{
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https://github.com https://avatars.githubusercontent.com https://cdn.jsdelivr.net",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "connect-src 'self'",
        "font-src 'self' data: https://fonts.gstatic.com"
    ].join('; '));
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    if (process.env.NODE_ENV === 'production' && req.secure)
    {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
}

function rateLimit(options: { windowMs: number; limit: number; scope: string })
{
    return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction)
    {
        const now = Date.now();
        const identity = crypto.createHash('sha256').update(`${req.ip}:${req.body?.email ?? ''}`).digest('hex');
        const key = `${options.scope}:${identity}`;
        const current = rateLimitBuckets.get(key);
        const entry = !current || current.resetAt <= now
            ? { count: 0, resetAt: now + options.windowMs }
            : current;

        entry.count += 1;
        rateLimitBuckets.set(key, entry);
        res.setHeader('RateLimit-Limit', String(options.limit));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, options.limit - entry.count)));
        res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > options.limit)
        {
            res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ message: 'Too many requests. Try again later.' });
        }

        if (rateLimitBuckets.size > 10000)
        {
            for (const [bucketKey, bucket] of rateLimitBuckets)
            {
                if (bucket.resetAt <= now)
                {
                    rateLimitBuckets.delete(bucketKey);
                }
            }
        }

        return next();
    };
}

function sameOriginApiMiddleware(req: Request, res: Response, next: NextFunction)
{
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const origin = req.header('origin');
    if (!origin) return next();

    try
    {
        const originUrl = new URL(origin);
        if (originUrl.host !== req.get('host'))
        {
            return res.status(403).json({ message: 'Cross-origin request rejected' });
        }
    }
    catch (error)
    {
        return res.status(403).json({ message: 'Invalid request origin' });
    }

    return next();
}

export { securityHeadersMiddleware, rateLimit, sameOriginApiMiddleware };
