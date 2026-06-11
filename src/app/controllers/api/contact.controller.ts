import { Request, Response } from 'express';

import { env } from '../../../bootstrap/env';
import { NotificationEvent } from '../../../db/models';

function normalizeText(value: unknown, maxLength: number): string
{
    return String(value ?? '').trim().slice(0, maxLength);
}

function isValidEmail(value: string): boolean
{
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function submitContactController(req: Request, res: Response)
{
    const name = normalizeText(req.body.name, 120);
    const email = normalizeText(req.body.email, 180).toLowerCase();
    const company = normalizeText(req.body.company, 160);
    const message = normalizeText(req.body.message, 3000);

    if (!name || !isValidEmail(email) || message.length < 10)
    {
        return res.status(422).json(
            {
                message: 'Name, a valid email, and a message of at least 10 characters are required.'
            }
        );
    }

    await NotificationEvent.create(
        {
            tenantId: null,
            type: 'contact_message',
            channel: 'email',
            subject: `New SecureRepos contact message from ${name}`,
            payload:
            {
                recipients: [env.supportEmail],
                name,
                email,
                company,
                message,
                ipAddress: req.ip,
                userAgent: req.get('user-agent') ?? '',
                submittedAt: new Date().toISOString()
            }
        }
    );

    return res.status(202).json(
        {
            data:
            {
                queued: true
            }
        }
    );
}

export {
    submitContactController
};
