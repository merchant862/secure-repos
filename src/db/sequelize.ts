import { Sequelize } from 'sequelize';
import { env } from '../bootstrap/env';

const sequelize = new Sequelize(
    env.dbName ?? 'micro_saas',
    env.dbUser ?? 'root',
    env.dbPass,
    {
        host: env.dbHost ?? '127.0.0.1',
        port: env.dbPort,
        dialect: 'mysql',
        logging: false
    }
);

function isDatabaseConfigured(): boolean
{
    return Boolean(env.dbHost && env.dbName && env.dbUser);
}

export {
    sequelize,
    isDatabaseConfigured
};
