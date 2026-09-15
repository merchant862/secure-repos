import { NextFunction, Request, Response } from 'express';
import { logger } from '../services/logger.service';

const appName = process.env.APP_NAME?.trim() || 'SecureRepos';

function isApiRequest(req: Request)
{
    return req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/webhooks/');
}

function notFoundMiddleware(req: Request, res: Response)
{
    if (isApiRequest(req))
    {
        return res.status(404).json({ message: 'Resource not found' });
    }

    return res.status(404).render('errors/status',
        {
            title: 'Page Not Found',
            appName,
            statusCode: 404,
            heading: 'Page not found',
            message: 'The page you requested does not exist or may have moved.',
            seo: { robots: 'noindex,nofollow' }
        }
    );
}

function errorMiddleware(error: Error, req: Request, res: Response, next: NextFunction)
{
    logger.error('request failed', error,
        {
            method: req.method,
            path: req.path,
            requestId: req.header('x-request-id') || null
        }
    );

    if (res.headersSent)
    {
        return next(error);
    }

    if (isApiRequest(req))
    {
        const message = process.env.NODE_ENV === 'development' && error.message
            ? error.message
            : 'Internal Server Error';

        return res.status(500).json({ message });
    }

    return res.status(500).render('errors/status',
        {
            title: 'Internal Server Error',
            appName,
            statusCode: 500,
            heading: 'Internal Server Error',
            message: 'Something went wrong while processing your request. Please try again in a moment.',
            seo: { robots: 'noindex,nofollow' }
        }
    );
}

export 
{
    notFoundMiddleware,
    errorMiddleware
};
