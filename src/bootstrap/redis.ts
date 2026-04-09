import { createClient } from 'redis';
import { assertRedisEnv, env } from './env';

const redis = createClient(
    {
        socket:
        {
            host: env.redisHost ?? '127.0.0.1',
            port: env.redisPort
        }
    }
);

function isRedisConfigured(): boolean
{
    return Boolean(env.redisHost);
}

async function connectRedis()
{
    assertRedisEnv();

    if (!redis.isOpen)
    {
        await redis.connect();
    }
}

export {
    redis,
    isRedisConfigured,
    connectRedis
};
