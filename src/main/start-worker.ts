import { connectDatabase } from '../bootstrap/database';
import { connectRedis } from '../bootstrap/redis';
import { env } from '../bootstrap/env';

async function startWorker()
{
    try
    {
        await connectDatabase();
        await connectRedis();

        console.log(`${env.appName} worker started`);
    }
    catch (error)
    {
        console.error('Failed to start worker:', error);
        process.exit(1);
    }
}

startWorker();
