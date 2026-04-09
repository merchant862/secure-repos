import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

class WebhookDelivery extends Model<InferAttributes<WebhookDelivery>, InferCreationAttributes<WebhookDelivery>>
{
    declare id: CreationOptional<number>;
    declare deliveryId: string;
    declare eventName: string;
    declare action: CreationOptional<string | null>;
    declare status: string;
    declare statusReason: CreationOptional<string | null>;
    declare processedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initWebhookDeliveryModel(sequelize: Sequelize)
{
    WebhookDelivery.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            deliveryId:
            {
                type: DataTypes.STRING(150),
                allowNull: false,
                unique: true
            },
            eventName:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            action:
            {
                type: DataTypes.STRING(100),
                allowNull: true
            },
            status:
            {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: 'received'
            },
            statusReason:
            {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            processedAt:
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
            tableName: 'webhook_deliveries',
            modelName: 'WebhookDelivery',
            timestamps: true
        }
    );

    return WebhookDelivery;
}

export {
    WebhookDelivery,
    initWebhookDeliveryModel
};
