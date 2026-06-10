import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { Tenant } from './tenant.model';
import { User } from './user.model';

class InAppNotification extends Model<InferAttributes<InAppNotification>, InferCreationAttributes<InAppNotification>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare userId: CreationOptional<ForeignKey<User['id']> | null>;
    declare type: string;
    declare title: string;
    declare body: string;
    declare payload: CreationOptional<object | null>;
    declare readAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initInAppNotificationModel(sequelize: Sequelize)
{
    InAppNotification.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
            type: { type: DataTypes.STRING(50), allowNull: false },
            title: { type: DataTypes.STRING(255), allowNull: false },
            body: { type: DataTypes.TEXT, allowNull: false },
            payload: { type: DataTypes.JSON, allowNull: true },
            readAt: { type: DataTypes.DATE, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'in_app_notifications', modelName: 'InAppNotification', timestamps: true }
    );

    return InAppNotification;
}

export {
    InAppNotification,
    initInAppNotificationModel
};
