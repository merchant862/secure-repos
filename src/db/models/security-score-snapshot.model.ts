import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { Repository } from './repository.model';
import { Tenant } from './tenant.model';

class SecurityScoreSnapshot extends Model<InferAttributes<SecurityScoreSnapshot>, InferCreationAttributes<SecurityScoreSnapshot>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare repositoryId: ForeignKey<Repository['id']>;
    declare score: number;
    declare criticalCount: CreationOptional<number>;
    declare highCount: CreationOptional<number>;
    declare mediumCount: CreationOptional<number>;
    declare lowCount: CreationOptional<number>;
    declare capturedAt: CreationOptional<Date>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initSecurityScoreSnapshotModel(sequelize: Sequelize)
{
    SecurityScoreSnapshot.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            repositoryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            score: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
            criticalCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            highCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            mediumCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            lowCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'security_score_snapshots', modelName: 'SecurityScoreSnapshot', timestamps: true }
    );

    return SecurityScoreSnapshot;
}

export {
    SecurityScoreSnapshot,
    initSecurityScoreSnapshotModel
};
