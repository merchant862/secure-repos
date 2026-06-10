import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { enqueueAllActiveRepositories } from '../app/services/scan.service';
import { queueWeeklyReportsForAllTenants } from '../app/services/notification.service';

async function runSchedulerTick()
{
    const scans = await enqueueAllActiveRepositories('scheduled');
    console.log(`Scheduled ${scans.length} repository scans`);
    await queueWeeklyReportsForAllTenants();
}

async function start()
{
    try
    {
        await connectDatabase();

        await runSchedulerTick();

        setInterval(function ()
        {
            runSchedulerTick().catch(function (error)
            {
                console.error('Scheduler tick failed:', error);
            });
        }, env.scanSchedulerIntervalMs);

        console.log(`${env.appName} scheduler running every ${env.scanSchedulerIntervalMs}ms`);
    }
    catch (error)
    {
        console.error('Failed to start scheduler:', error);
        process.exit(1);
    }
}

start();
