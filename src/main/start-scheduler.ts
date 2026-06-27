import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { enqueueDueScheduledScans } from '../app/services/scan.service';
import { queuePlanReportsForAllTenants } from '../app/services/notification.service';
import { runRetentionCleanup } from '../app/services/retention.service';

async function runSchedulerTick()
{
    const scans = await enqueueDueScheduledScans();
    console.log(`Scheduled ${scans.length} repository scans`);
    await queuePlanReportsForAllTenants();
    await runRetentionCleanup();
}

async function start()
{
    try
    {
        await connectDatabase();

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
