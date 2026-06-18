import { Request, Response, NextFunction } from 'express';

function githubWebhookRawBodyMiddleware(req: Request, res: Response, next: NextFunction)
{
    const chunks: Buffer[] = [];
    const maxBytes = 1024 * 1024;
    let totalBytes = 0;
    let rejected = false;

    req.on('data', function (chunk)
    {
        if (rejected) return;
        totalBytes += chunk.length;
        if (totalBytes > maxBytes)
        {
            rejected = true;
            res.status(413).json({ message: 'Webhook payload is too large' });
            req.destroy();
            return;
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', function ()
    {
        if (rejected) return;
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
    });

    req.on('error', function (error)
    {
        next(error);
    });
}

export {
    githubWebhookRawBodyMiddleware
};
