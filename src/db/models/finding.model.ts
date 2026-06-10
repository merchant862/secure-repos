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
import { Scan } from './scan.model';
import { User } from './user.model';

class Finding extends Model<InferAttributes<Finding>, InferCreationAttributes<Finding>>
{
    declare id: CreationOptional<number>;
    declare scanId: ForeignKey<Scan['id']>;
    declare repositoryId: ForeignKey<Repository['id']>;
    declare ruleId: string;
    declare severity: string;
    declare title: string;
    declare description: string;
    declare remediation: CreationOptional<string | null>;
    declare filePath: string;
    declare lineNumber: CreationOptional<number | null>;
    declare fingerprint: string;
    declare status: CreationOptional<string>;
    declare assignedToUserId: CreationOptional<ForeignKey<User['id']> | null>;
    declare firstSeenAt: CreationOptional<Date>;
    declare lastSeenAt: CreationOptional<Date>;
    declare resolvedAt: CreationOptional<Date | null>;
    declare ignoredUntil: CreationOptional<Date | null>;
    declare metadata: CreationOptional<object | null>;
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
            scanId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            repositoryId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            ruleId:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            severity:
            {
                type: DataTypes.STRING(20),
                allowNull: false
            },
            title:
            {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            description:
            {
                type: DataTypes.TEXT,
                allowNull: false
            },
            remediation:
            {
                type: DataTypes.TEXT,
                allowNull: true
            },
            filePath:
            {
                type: DataTypes.STRING(500),
                allowNull: false
            },
            lineNumber:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true
            },
            fingerprint:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'open'
            },
            assignedToUserId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true
            },
            firstSeenAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            lastSeenAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            resolvedAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            ignoredUntil:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            metadata:
            {
                type: DataTypes.JSON,
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
