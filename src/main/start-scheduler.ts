import { connectDatabase } from '../bootstrap/database';
import { connectRedis } from '../bootstrap/redis';
import { env } from '../bootstrap/env';

async function startScheduler()
{
    try
    {
        await connectDatabase();
        await connectRedis();

        console.log(`${env.appName} scheduler started`);
    }
    catch (error)
    {
        console.error('Failed to start scheduler:', error);
        process.exit(1);
    }
}

startScheduler();
