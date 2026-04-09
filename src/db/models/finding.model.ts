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

class Finding extends Model<InferAttributes<Finding>, InferCreationAttributes<Finding>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare repositoryId: ForeignKey<Repository['id']>;
    declare provider: string;
    declare category: string;
    declare severity: string;
    declare title: string;
    declare description: string;
    declare status: string;
    declare fingerprint: string;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initFindingModel(sequelize: Sequelize)
{
    Finding.init(
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
            provider:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                defaultValue: 'internal'
            },
            category:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            severity:
            {
                type: DataTypes.STRING(50),
                allowNull: false
            },
            title:
            {
                type: DataTypes.STRING(191),
                allowNull: false
            },
            description:
            {
                type: DataTypes.TEXT,
                allowNull: false
            },
            status:
            {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: 'open'
            },
            fingerprint:
            {
                type: DataTypes.STRING(191),
                allowNull: false,
                unique: true
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
            tableName: 'findings',
            modelName: 'Finding',
            timestamps: true
        }
    );

    return Finding;
}

export {
    Finding,
    initFindingModel
};
