import app from '../app/app';
import { env } from '../bootstrap/env';
import { connectDatabase } from '../bootstrap/database';
import { connectRedis } from '../bootstrap/redis';

async function start()
{
    try
    {
        await connectDatabase();
        await connectRedis();

        app.listen(env.port, function ()
        {
            console.log(`${env.appName} listening on port ${env.port}`);
        });
    }
    catch (error)
    {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

start();
