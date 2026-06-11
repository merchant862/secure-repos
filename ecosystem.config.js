'use strict';

const commonEnv =
{
    NODE_ENV: process.env.NODE_ENV || 'production'
};

function app(name, script, extraEnv = {})
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
        app('securerepos-scan-worker', 'dist/src/main/start-worker.js'),
        app('securerepos-scheduler', 'dist/src/main/start-scheduler.js'),

        app('securerepos-email-login-otp', 'dist/src/main/start-login-otp-email-worker.js'),
        app('securerepos-email-welcome', 'dist/src/main/start-welcome-email-worker.js'),
        app('securerepos-email-team-invite', 'dist/src/main/start-team-invite-email-worker.js'),
        app('securerepos-email-security-alert', 'dist/src/main/start-security-alert-email-worker.js'),
        app('securerepos-email-weekly-report', 'dist/src/main/start-weekly-report-email-worker.js'),
        app('securerepos-email-scan-summary', 'dist/src/main/start-scan-summary-email-worker.js'),
        app('securerepos-email-scan-failed', 'dist/src/main/start-scan-failed-email-worker.js'),
        app('securerepos-email-finding-assigned', 'dist/src/main/start-finding-assigned-email-worker.js'),
        app('securerepos-email-finding-status', 'dist/src/main/start-finding-status-email-worker.js'),
        app('securerepos-email-provider-status', 'dist/src/main/start-provider-status-email-worker.js'),
        app('securerepos-email-repo-access-failed', 'dist/src/main/start-repository-access-failed-email-worker.js'),
        app('securerepos-email-critical-reminder', 'dist/src/main/start-critical-finding-reminder-email-worker.js'),
        app('securerepos-email-password-reset', 'dist/src/main/start-password-reset-email-worker.js'),
        app('securerepos-email-plan-activated', 'dist/src/main/start-plan-activated-email-worker.js'),
        app('securerepos-email-payment-failed', 'dist/src/main/start-payment-failed-email-worker.js'),
        app('securerepos-email-subscription-cancelled', 'dist/src/main/start-subscription-cancelled-email-worker.js'),
        app('securerepos-email-contact', 'dist/src/main/start-contact-email-worker.js')
    ]
};
