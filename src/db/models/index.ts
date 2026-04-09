import { Sequelize } from 'sequelize';

import { User, initUserModel } from './user.model';
import { Tenant, initTenantModel } from './tenant.model';
import { GithubInstallation, initGithubInstallationModel } from './github-installation.model';
import { Repository, initRepositoryModel } from './repository.model';
import { WebhookDelivery, initWebhookDeliveryModel } from './webhook-delivery.model';
import { Finding, initFindingModel } from './finding.model';

let modelsInitialized = false;

function initModels(sequelize: Sequelize)
{
    if (modelsInitialized)
    {
        return;
    }

    initTenantModel(sequelize);
    initUserModel(sequelize);
    initGithubInstallationModel(sequelize);
    initRepositoryModel(sequelize);
    initWebhookDeliveryModel(sequelize);
    initFindingModel(sequelize);

    Tenant.hasMany(User, {
        foreignKey: 'tenantId',
        as: 'users'
    });

    User.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Tenant.hasMany(GithubInstallation, {
        foreignKey: 'tenantId',
        as: 'githubInstallations'
    });

    GithubInstallation.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    GithubInstallation.hasMany(Repository, {
        foreignKey: 'githubInstallationId',
        as: 'repositories'
    });

    Repository.belongsTo(GithubInstallation, {
        foreignKey: 'githubInstallationId',
        as: 'githubInstallation'
    });

    Tenant.hasMany(Finding, {
        foreignKey: 'tenantId',
        as: 'findings'
    });

    Finding.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Repository.hasMany(Finding, {
        foreignKey: 'repositoryId',
        as: 'findings'
    });

    Finding.belongsTo(Repository, {
        foreignKey: 'repositoryId',
        as: 'repository'
    });

    modelsInitialized = true;
}

export 
{
    User,
    Tenant,
    GithubInstallation,
    Repository,
    WebhookDelivery,
    Finding,
    initModels
};
