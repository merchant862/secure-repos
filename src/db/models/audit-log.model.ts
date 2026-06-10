import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { Tenant } from './tenant.model';
import { User } from './user.model';

class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare userId: CreationOptional<ForeignKey<User['id']> | null>;
    declare action: string;
    declare entityType: string;
    declare entityId: CreationOptional<string | null>;
    declare metadata: CreationOptional<object | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initAuditLogModel(sequelize: Sequelize)
{
    AuditLog.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
            action: { type: DataTypes.STRING(100), allowNull: false },
            entityType: { type: DataTypes.STRING(100), allowNull: false },
            entityId: { type: DataTypes.STRING(100), allowNull: true },
            metadata: { type: DataTypes.JSON, allowNull: true },
            ipAddress: { type: DataTypes.STRING(100), allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'audit_logs', modelName: 'AuditLog', timestamps: true }
    );

    return AuditLog;
}

export {
    AuditLog,
    initAuditLogModel
};
