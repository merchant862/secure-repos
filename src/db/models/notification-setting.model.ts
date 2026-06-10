import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { Tenant } from './tenant.model';

class NotificationSetting extends Model<InferAttributes<NotificationSetting>, InferCreationAttributes<NotificationSetting>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare instantCritical: CreationOptional<boolean>;
    declare instantHigh: CreationOptional<boolean>;
    declare dailyDigest: CreationOptional<boolean>;
    declare weeklyReport: CreationOptional<boolean>;
    declare emailRecipients: CreationOptional<object | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initNotificationSettingModel(sequelize: Sequelize)
{
    NotificationSetting.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
            instantCritical: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            instantHigh: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            dailyDigest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            weeklyReport: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            emailRecipients: { type: DataTypes.JSON, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'notification_settings', modelName: 'NotificationSetting', timestamps: true }
    );

    return NotificationSetting;
}

export {
    NotificationSetting,
    initNotificationSettingModel
};
