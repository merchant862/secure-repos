import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { runNotificationWorkerLoop } from '../app/services/notification-worker.service';

async function start()
{
    try
    {
        await connectDatabase();

        console.log(`${env.appName} notification worker listening every ${env.notificationWorkerPollMs}ms`);
        await runNotificationWorkerLoop(env.notificationWorkerPollMs);
    }
    catch (error)
    {
        console.error('Failed to start notification worker:', error);
        process.exit(1);
    }
}

start();
