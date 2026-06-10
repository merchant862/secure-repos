import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { Repository } from './repository.model';
import { Tenant } from './tenant.model';

class Scan extends Model<InferAttributes<Scan>, InferCreationAttributes<Scan>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare repositoryId: ForeignKey<Repository['id']>;
    declare status: CreationOptional<string>;
    declare triggerType: string;
    declare branch: CreationOptional<string | null>;
    declare commitSha: CreationOptional<string | null>;
    declare findingsCritical: CreationOptional<number>;
    declare findingsHigh: CreationOptional<number>;
    declare findingsMedium: CreationOptional<number>;
    declare findingsLow: CreationOptional<number>;
    declare errorMessage: CreationOptional<string | null>;
    declare startedAt: CreationOptional<Date | null>;
    declare completedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initScanModel(sequelize: Sequelize)
{
    Scan.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            tenantId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            repositoryId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'queued'
            },
            triggerType:
            {
                type: DataTypes.STRING(30),
                allowNull: false
            },
            branch:
            {
                type: DataTypes.STRING(150),
                allowNull: true
            },
            commitSha:
            {
                type: DataTypes.STRING(100),
                allowNull: true
            },
            findingsCritical:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsHigh:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsMedium:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsLow:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            errorMessage:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            startedAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            completedAt:
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
            tableName: 'scans',
            modelName: 'Scan',
            timestamps: true
        }
    );

    return Scan;
}

export {
    Scan,
    initScanModel
};
