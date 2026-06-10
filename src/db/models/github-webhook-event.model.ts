import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

class GithubWebhookEvent extends Model<InferAttributes<GithubWebhookEvent>, InferCreationAttributes<GithubWebhookEvent>>
{
    declare id: CreationOptional<number>;
    declare deliveryId: string;
    declare event: string;
    declare action: CreationOptional<string | null>;
    declare status: CreationOptional<string>;
    declare errorMessage: CreationOptional<string | null>;
    declare processedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initGithubWebhookEventModel(sequelize: Sequelize)
{
    GithubWebhookEvent.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            deliveryId:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            event:
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
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'received'
            },
            errorMessage:
            {
                type: DataTypes.TEXT,
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
            tableName: 'github_webhook_events',
            modelName: 'GithubWebhookEvent',
            timestamps: true
        }
    );

    return GithubWebhookEvent;
}

export {
    GithubWebhookEvent,
    initGithubWebhookEventModel
};
