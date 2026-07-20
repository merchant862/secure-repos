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

class EmailVerificationToken extends Model<InferAttributes<EmailVerificationToken>, InferCreationAttributes<EmailVerificationToken>>
{
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<User['id']>;
    declare tokenHash: string;
    declare expiresAt: Date;
    declare usedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initEmailVerificationTokenModel(sequelize: Sequelize)
{
    EmailVerificationToken.init(
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
            tableName: 'email_verification_tokens',
            modelName: 'EmailVerificationToken',
            timestamps: true
        }
    );

    return EmailVerificationToken;
}

export {
    EmailVerificationToken,
    initEmailVerificationTokenModel
};
