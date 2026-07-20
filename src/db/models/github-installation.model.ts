import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    Model,
    Sequelize
} from 'sequelize';

import { Tenant } from './tenant.model';

class GithubInstallation extends Model<InferAttributes<GithubInstallation>, InferCreationAttributes<GithubInstallation>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare githubInstallationId: string;
    declare githubAccountId: CreationOptional<string | null>;
    declare githubAccountLogin: string;
    declare githubAccountType: string;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initGithubInstallationModel(sequelize: Sequelize)
{
    GithubInstallation.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            tenantId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            githubInstallationId:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            githubAccountId:
            {
                type: DataTypes.STRING(100),
                allowNull: true,
                unique: true
            },
            githubAccountLogin:
            {
                type: DataTypes.STRING(150),
                allowNull: false
            },
            githubAccountType:
            {
                type: DataTypes.STRING(50),
                allowNull: false
            },
            createdAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            updatedAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            tableName: 'github_installations',
            modelName: 'GithubInstallation',
            timestamps: true
        }
    );

    return GithubInstallation;
}

export {
    GithubInstallation,
    initGithubInstallationModel
};
