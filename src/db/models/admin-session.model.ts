import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { Admin } from './admin.model';

class AdminSession extends Model<InferAttributes<AdminSession>, InferCreationAttributes<AdminSession>>
{
    declare id: CreationOptional<number>;
    declare adminId: ForeignKey<Admin['id']>;
    declare tokenHash: string;
    declare expiresAt: Date;
    declare revokedAt: CreationOptional<Date | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare userAgent: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initAdminSessionModel(sequelize: Sequelize)
{
    AdminSession.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            adminId:
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
            revokedAt:
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
            tableName: 'admin_sessions',
            modelName: 'AdminSession',
            timestamps: true
        }
    );

    return AdminSession;
}

export {
    AdminSession,
    initAdminSessionModel
};
