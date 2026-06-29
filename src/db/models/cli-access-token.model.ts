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
import { User } from './user.model';

class CliAccessToken extends Model<InferAttributes<CliAccessToken>, InferCreationAttributes<CliAccessToken>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare userId: ForeignKey<User['id']>;
    declare name: string;
    declare tokenHash: string;
    declare tokenPrefix: string;
    declare tokenLastFour: string;
    declare expiresAt: Date;
    declare lastUsedAt: CreationOptional<Date | null>;
    declare lastUsedIp: CreationOptional<string | null>;
    declare revokedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initCliAccessTokenModel(sequelize: Sequelize)
{
    CliAccessToken.init(
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
            userId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            name:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            tokenHash:
            {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true
            },
            tokenPrefix:
            {
                type: DataTypes.STRING(24),
                allowNull: false
            },
            tokenLastFour:
            {
                type: DataTypes.STRING(4),
                allowNull: false
            },
            expiresAt:
            {
                type: DataTypes.DATE,
                allowNull: false
            },
            lastUsedAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            lastUsedIp:
            {
                type: DataTypes.STRING(100),
                allowNull: true
            },
            revokedAt:
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
            tableName: 'cli_access_tokens',
            modelName: 'CliAccessToken',
            timestamps: true
        }
    );

    return CliAccessToken;
}

export {
    CliAccessToken,
    initCliAccessTokenModel
};
