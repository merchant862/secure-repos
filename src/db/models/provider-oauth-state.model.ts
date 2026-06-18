import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

class ProviderOauthState extends Model<InferAttributes<ProviderOauthState>, InferCreationAttributes<ProviderOauthState>>
{
    declare id: CreationOptional<number>;
    declare nonceHash: string;
    declare tenantId: number;
    declare userId: number;
    declare provider: string;
    declare expiresAt: Date;
    declare consumedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initProviderOauthStateModel(sequelize: Sequelize)
{
    ProviderOauthState.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            nonceHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            provider: { type: DataTypes.STRING(30), allowNull: false },
            expiresAt: { type: DataTypes.DATE, allowNull: false },
            consumedAt: { type: DataTypes.DATE, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'provider_oauth_states', modelName: 'ProviderOauthState', timestamps: true }
    );

    return ProviderOauthState;
}

export { ProviderOauthState, initProviderOauthStateModel };
