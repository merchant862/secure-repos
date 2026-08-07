'use strict';

const commonEnv =
{
    NODE_ENV: process.env.NODE_ENV || 'production'
};

function app(name, script, extraEnv = {}, extraOptions = {})
{
    return {
        name,
        script,
        cwd: __dirname,
        exec_mode: 'fork',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '350M',
        kill_timeout: 10000,
        ...extraOptions,
        env:
        {
            ...commonEnv,
            ...extraEnv
        }
    };
}

module.exports =
{
    apps:
    [
        app('securerepos-web', 'dist/src/main/start-web.js'),
        app('securerepos-notification-ws', 'dist/src/main/start-notification-ws.js'),
        app('securerepos-scanner-lifecycle', 'scripts/scanner-lifecycle.js', {}, { autorestart: false }),
        app('securerepos-scan-worker', 'dist/src/main/start-worker.js'),
        app('securerepos-scheduler', 'dist/src/main/start-scheduler.js'),
        app('securerepos-email-worker', 'dist/src/main/start-email-worker.js')
    ]
};
