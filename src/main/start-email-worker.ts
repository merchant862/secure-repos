import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { runNotificationWorkerLoop } from '../app/services/notification-worker.service';

async function start()
{
    const emailType = process.env.EMAIL_WORKER_TYPE;

    try
    {
        await connectDatabase();

        console.log(`${env.appName} ${emailType || 'all'} email worker listening every ${env.notificationWorkerPollMs}ms`);
        await runNotificationWorkerLoop(env.notificationWorkerPollMs, emailType);
    }
    catch (error)
    {
        console.error(`Failed to start ${emailType} email worker:`, error);
        process.exit(1);
    }
}

start();
