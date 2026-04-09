import { sequelize } from '../db/sequelize';
import { initModels } from '../db/models';
import { assertDatabaseEnv } from './env';

async function connectDatabase()
{
    assertDatabaseEnv();

    initModels(sequelize);

    await sequelize.authenticate();
}

export {
    connectDatabase
};
