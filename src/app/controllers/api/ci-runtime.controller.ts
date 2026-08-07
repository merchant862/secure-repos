import { Request, Response } from 'express';

import { assertRuntimeIngestToken, createRuntimeEvents, RuntimeEventInput } from '../../services/ci-runtime-event.service';

async function ingestCiRuntimeEventsController(req: Request, res: Response)
{
    try
    {
        assertRuntimeIngestToken(req.header('authorization') ?? undefined);

        const body = req.body ?? {};
        const events = Array.isArray(body.events)
            ? body.events as RuntimeEventInput[]
            : [body as RuntimeEventInput];
        const created = await createRuntimeEvents(events);

        return res.status(202).json(
            {
                message: 'CI runtime events accepted',
                data:
                {
                    accepted: created.length
                }
            }
        );
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'CI runtime events could not be accepted';
        const status = message.includes('token') || message.includes('configured') ? 401 : 400;
        return res.status(status).json({ message });
    }
}

export {
    ingestCiRuntimeEventsController
};
