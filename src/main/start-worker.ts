import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { runScanWorkerLoop } from '../app/services/scan.service';

async function start()
{
    try
    {
        await connectDatabase();

        console.log(`${env.appName} scan worker listening every ${env.scanWorkerPollMs}ms`);
        await runScanWorkerLoop(env.scanWorkerPollMs);
    }
    catch (error)
    {
        console.error('Failed to start scan worker:', error);
        process.exit(1);
    }
}

start();
