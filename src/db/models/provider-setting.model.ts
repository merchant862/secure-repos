import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

class ProviderSetting extends Model<InferAttributes<ProviderSetting>, InferCreationAttributes<ProviderSetting>>
{
    declare id: CreationOptional<number>;
    declare provider: string;
    declare displayName: string;
    declare isEnabled: CreationOptional<boolean>;
    declare sortOrder: CreationOptional<number>;
    declare connectLabel: CreationOptional<string>;
    declare setupInstructions: CreationOptional<string | null>;
    declare scanDefaults: CreationOptional<object | null>;
    declare planAvailability: CreationOptional<object | null>;
    declare metadata: CreationOptional<object | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initProviderSettingModel(sequelize: Sequelize)
{
    ProviderSetting.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            provider:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                unique: true
            },
            displayName:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            isEnabled:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            sortOrder:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            connectLabel:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                defaultValue: 'Connect provider'
            },
            setupInstructions:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            scanDefaults:
            {
                type: DataTypes.JSON,
                allowNull: true
            },
            planAvailability:
            {
                type: DataTypes.JSON,
                allowNull: true
            },
            metadata:
            {
                type: DataTypes.JSON,
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
            tableName: 'provider_settings',
            modelName: 'ProviderSetting',
            timestamps: true
        }
    );

    return ProviderSetting;
}

export {
    ProviderSetting,
    initProviderSettingModel
};
