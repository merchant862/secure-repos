import { Request, Response } from 'express';
import { sequelize } from '../../../db/sequelize';

async function healthController(req: Request, res: Response)
{
    let databaseStatus = 'down';

    try
    {
        await sequelize.authenticate();
        databaseStatus = 'up';
    }
    catch (error)
    {
        databaseStatus = 'down';
    }

    const isHealthy = databaseStatus === 'up';

    return res.status(isHealthy ? 200 : 503).json(
        {
            status: isHealthy ? 'ok' : 'degraded',
            app: 'up',
            database: databaseStatus,
            timestamp: new Date().toISOString()
        }
    );
}

export 
{
    healthController
};
