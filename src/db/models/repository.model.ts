import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    Model,
    Sequelize
} from 'sequelize';

import { GithubInstallation } from './github-installation.model';
import { CodeHostConnection } from './code-host-connection.model';

class Repository extends Model<InferAttributes<Repository>, InferCreationAttributes<Repository>>
{
    declare id: CreationOptional<number>;
    declare githubInstallationId: CreationOptional<ForeignKey<GithubInstallation['id']> | null>;
    declare codeHostConnectionId: CreationOptional<ForeignKey<CodeHostConnection['id']> | null>;
    declare provider: CreationOptional<string>;
    declare githubRepositoryId: string;
    declare externalRepositoryId: CreationOptional<string | null>;
    declare name: string;
    declare fullName: string;
    declare webUrl: CreationOptional<string | null>;
    declare defaultBranch: string;
    declare isPrivate: boolean;
    declare isActive: CreationOptional<boolean>;
    declare securityScore: CreationOptional<number>;
    declare baselineScanId: CreationOptional<number | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initRepositoryModel(sequelize: Sequelize)
{
    Repository.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            githubInstallationId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true
            },
            codeHostConnectionId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true
            },
            provider:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'github'
            },
            githubRepositoryId:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            externalRepositoryId:
            {
                type: DataTypes.STRING(150),
                allowNull: true
            },
            name:
            {
                type: DataTypes.STRING(150),
                allowNull: false
            },
            fullName:
            {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            webUrl:
            {
                type: DataTypes.STRING(500),
                allowNull: true
            },
            defaultBranch:
            {
                type: DataTypes.STRING(150),
                allowNull: false,
                defaultValue: 'main'
            },
            isPrivate:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            isActive:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            securityScore:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 100
            },
            baselineScanId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true
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
            tableName: 'repositories',
            modelName: 'Repository',
            timestamps: true
        }
    );

    return Repository;
}

export {
    Repository,
    initRepositoryModel
};
