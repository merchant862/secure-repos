import { Request, Response } from 'express';
import { env } from '../../../bootstrap/env';
import { isDatabaseConfigured, sequelize } from '../../../db/sequelize';
import { isRedisConfigured, redis } from '../../../bootstrap/redis';

async function healthController(req: Request, res: Response)
{
    let databaseStatus = 'down';
    let redisStatus = 'down';

    try
    {
        if (isDatabaseConfigured())
        {
            await sequelize.authenticate();
            databaseStatus = 'up';
        }
    }
    catch (error)
    {
        databaseStatus = 'down';
    }

    try
    {
        if (!isRedisConfigured())
        {
            redisStatus = 'down';
        }
        else if (redis.isOpen)
        {
            await redis.ping();
            redisStatus = 'up';
        }
        else
        {
            redisStatus = 'down';
        }
    }
    catch (error)
    {
        redisStatus = 'down';
    }

    const isHealthy = databaseStatus === 'up' && redisStatus === 'up';

    return res.status(isHealthy ? 200 : 503).json(
        {
            status: isHealthy ? 'ok' : 'degraded',
            app: 'up',
            appName: env.appName,
            database: databaseStatus,
            redis: redisStatus,
            timestamp: new Date().toISOString()
        }
    );
}

export 
{
    healthController
};
