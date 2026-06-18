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

class LoginOtp extends Model<InferAttributes<LoginOtp>, InferCreationAttributes<LoginOtp>>
{
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<User['id']>;
    declare challengeId: string;
    declare codeHash: string;
    declare expiresAt: Date;
    declare usedAt: CreationOptional<Date | null>;
    declare attemptCount: CreationOptional<number>;
    declare lastAttemptAt: CreationOptional<Date | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare userAgent: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initLoginOtpModel(sequelize: Sequelize)
{
    LoginOtp.init(
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
            challengeId:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            codeHash:
            {
                type: DataTypes.STRING(100),
                allowNull: false
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
            attemptCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            lastAttemptAt: { type: DataTypes.DATE, allowNull: true },
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
            tableName: 'login_otps',
            modelName: 'LoginOtp',
            timestamps: true
        }
    );

    return LoginOtp;
}

export {
    LoginOtp,
    initLoginOtpModel
};
