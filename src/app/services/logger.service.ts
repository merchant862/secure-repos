type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function serializeError(error: unknown): LogContext
{
    if (error instanceof Error)
    {
        return {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
    }

    return { error };
}

function writeLog(level: LogLevel, message: string, context: LogContext = {})
{
    const payload =
    {
        level,
        message,
        service: process.env.APP_NAME?.trim() || 'SecureRepos',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        ...context
    };

    const line = JSON.stringify(payload);

    if (level === 'error')
    {
        console.error(line);
        return;
    }

    if (level === 'warn')
    {
        console.warn(line);
        return;
    }

    console.log(line);
}

const logger =
{
    debug(message: string, context?: LogContext)
    {
        if (process.env.NODE_ENV === 'development')
        {
            writeLog('debug', message, context);
        }
    },

    info(message: string, context?: LogContext)
    {
        writeLog('info', message, context);
    },

    warn(message: string, context?: LogContext)
    {
        writeLog('warn', message, context);
    },

    error(message: string, error?: unknown, context: LogContext = {})
    {
        writeLog('error', message, { ...context, ...serializeError(error) });
    }
};

export
{
    logger
};
