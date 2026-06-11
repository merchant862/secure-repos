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

class NotificationEvent extends Model<InferAttributes<NotificationEvent>, InferCreationAttributes<NotificationEvent>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']> | null;
    declare type: string;
    declare channel: CreationOptional<string>;
    declare status: CreationOptional<string>;
    declare subject: string;
    declare payload: object;
    declare sentAt: CreationOptional<Date | null>;
    declare errorMessage: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initNotificationEventModel(sequelize: Sequelize)
{
    NotificationEvent.init(
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
                allowNull: true
            },
            type:
            {
                type: DataTypes.STRING(50),
                allowNull: false
            },
            channel:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'email'
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'queued'
            },
            subject:
            {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            payload:
            {
                type: DataTypes.JSON,
                allowNull: false
            },
            sentAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            errorMessage:
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
            tableName: 'notification_events',
            modelName: 'NotificationEvent',
            timestamps: true
        }
    );

    return NotificationEvent;
}

export {
    NotificationEvent,
    initNotificationEventModel
};
