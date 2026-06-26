import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { User } from './user.model';

class PasswordResetToken extends Model<InferAttributes<PasswordResetToken>, InferCreationAttributes<PasswordResetToken>>
{
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<User['id']>;
    declare tokenHash: string;
    declare expiresAt: Date;
    declare usedAt: CreationOptional<Date | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare userAgent: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initPasswordResetTokenModel(sequelize: Sequelize)
{
    PasswordResetToken.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            userId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            tokenHash:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            expiresAt:
            {
                type: DataTypes.DATE,
                allowNull: false
            },
            usedAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            ipAddress:
            {
                type: DataTypes.STRING(100),
                allowNull: true
            },
            userAgent:
            {
                type: DataTypes.STRING(500),
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
            tableName: 'password_reset_tokens',
            modelName: 'PasswordResetToken',
            timestamps: true
        }
    );

    return PasswordResetToken;
}

export {
    PasswordResetToken,
    initPasswordResetTokenModel
};
