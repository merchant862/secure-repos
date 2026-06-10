import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { Tenant } from './tenant.model';
import { User } from './user.model';

class IgnoreRule extends Model<InferAttributes<IgnoreRule>, InferCreationAttributes<IgnoreRule>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare createdByUserId: CreationOptional<ForeignKey<User['id']> | null>;
    declare ruleId: CreationOptional<string | null>;
    declare filePattern: CreationOptional<string | null>;
    declare reason: CreationOptional<string | null>;
    declare isActive: CreationOptional<boolean>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initIgnoreRuleModel(sequelize: Sequelize)
{
    IgnoreRule.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
            ruleId: { type: DataTypes.STRING(100), allowNull: true },
            filePattern: { type: DataTypes.STRING(500), allowNull: true },
            reason: { type: DataTypes.STRING(255), allowNull: true },
            isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'ignore_rules', modelName: 'IgnoreRule', timestamps: true }
    );

    return IgnoreRule;
}

export {
    IgnoreRule,
    initIgnoreRuleModel
};
