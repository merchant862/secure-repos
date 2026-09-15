import cluster from 'cluster';
import os from 'os';

import app from '../app/app';
import { env } from '../bootstrap/env';
import { connectDatabase } from '../bootstrap/database';
import { logger } from '../app/services/logger.service';

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
            logger.info('web worker listening', { pid: process.pid, port: env.port });
        });
    }
    catch (error)
    {
        logger.error('failed to start application', error);
        process.exit(1);
    }
}

function startCluster()
{
    const workerCount = getWorkerCount();

    if (workerCount <= 1)
    {
        logger.info('starting single web process', { pid: process.pid, nodeEnv: env.nodeEnv });
        start();
        return;
    }

    if (cluster.isPrimary)
    {
        logger.info('starting clustered web process', { pid: process.pid, workerCount, nodeEnv: env.nodeEnv });

        for (let index = 0; index < workerCount; index += 1)
        {
            cluster.fork();
        }

        cluster.on('exit', function (worker, code, signal)
        {
            logger.error('web worker exited', undefined,
                {
                    pid: worker.process.pid ?? 'unknown',
                    code: code ?? 'null',
                    signal: signal ?? 'null'
                }
            );
            cluster.fork();
        });

        return;
    }

    start();
}

startCluster();
