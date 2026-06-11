import cluster from 'cluster';
import os from 'os';

import app from '../app/app';
import { env } from '../bootstrap/env';
import { connectDatabase } from '../bootstrap/database';

function getWorkerCount()
{
    if (env.nodeEnv === 'development')
    {
        return 1;
    }

    return Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
}

async function start()
{
    try
    {
        await connectDatabase();

        app.listen(env.port, function ()
        {
            console.log(`${env.appName} worker ${process.pid} listening on port ${env.port}`);
        });
    }
    catch (error)
    {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

function startCluster()
{
    const workerCount = getWorkerCount();

    if (workerCount <= 1)
    {
        console.log(`${env.appName} starting single web process pid=${process.pid} node_env=${env.nodeEnv}`);
        start();
        return;
    }

    if (cluster.isPrimary)
    {
        console.log(`${env.appName} primary pid=${process.pid} starting ${workerCount} web workers node_env=${env.nodeEnv}`);

        for (let index = 0; index < workerCount; index += 1)
        {
            cluster.fork();
        }

        cluster.on('exit', function (worker, code, signal)
        {
            console.error(`${env.appName} web worker pid=${worker.process.pid ?? 'unknown'} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
            cluster.fork();
        });

        return;
    }

    start();
}

startCluster();
