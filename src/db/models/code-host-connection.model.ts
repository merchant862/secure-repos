import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { Tenant } from './tenant.model';

class CodeHostConnection extends Model<InferAttributes<CodeHostConnection>, InferCreationAttributes<CodeHostConnection>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare provider: string;
    declare externalId: string;
    declare accountLogin: string;
    declare accountType: CreationOptional<string | null>;
    declare accessTokenEncrypted: CreationOptional<string | null>;
    declare refreshTokenEncrypted: CreationOptional<string | null>;
    declare tokenExpiresAt: CreationOptional<Date | null>;
    declare webhookSecretEncrypted: CreationOptional<string | null>;
    declare isActive: CreationOptional<boolean>;
    declare lastSyncAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initCodeHostConnectionModel(sequelize: Sequelize)
{
    CodeHostConnection.init(
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
            provider:
            {
                type: DataTypes.STRING(30),
                allowNull: false
            },
            externalId:
            {
                type: DataTypes.STRING(150),
                allowNull: false
            },
            accountLogin:
            {
                type: DataTypes.STRING(191),
                allowNull: false
            },
            accountType:
            {
                type: DataTypes.STRING(50),
                allowNull: true
            },
            accessTokenEncrypted:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            refreshTokenEncrypted:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            tokenExpiresAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            webhookSecretEncrypted:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            isActive:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            lastSyncAt:
            {
                type: DataTypes.DATE,
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
            tableName: 'code_host_connections',
            modelName: 'CodeHostConnection',
            timestamps: true
        }
    );

    return CodeHostConnection;
}

export {
    CodeHostConnection,
    initCodeHostConnectionModel
};
