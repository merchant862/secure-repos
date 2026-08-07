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

class AlertChannel extends Model<InferAttributes<AlertChannel>, InferCreationAttributes<AlertChannel>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare provider: string;
    declare name: string;
    declare webhookUrlEncrypted: string;
    declare configEncrypted: CreationOptional<string | null>;
    declare isActive: CreationOptional<boolean>;
    declare lastDeliveredAt: CreationOptional<Date | null>;
    declare lastError: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initAlertChannelModel(sequelize: Sequelize)
{
    AlertChannel.init(
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
            name:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            webhookUrlEncrypted:
            {
                type: DataTypes.TEXT,
                allowNull: false
            },
            configEncrypted:
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
            lastDeliveredAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            lastError:
            {
                type: DataTypes.TEXT,
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
            tableName: 'alert_channels',
            modelName: 'AlertChannel',
            timestamps: true
        }
    );

    return AlertChannel;
}

export {
    AlertChannel,
    initAlertChannelModel
};
