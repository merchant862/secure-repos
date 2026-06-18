import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

class FindingOccurrence extends Model<InferAttributes<FindingOccurrence>, InferCreationAttributes<FindingOccurrence>>
{
    declare id: CreationOptional<number>;
    declare scanId: number;
    declare findingId: number;
    declare repositoryId: number;
    declare branch: CreationOptional<string | null>;
    declare severity: string;
    declare ruleId: string;
    declare title: string;
    declare description: string;
    declare remediation: CreationOptional<string | null>;
    declare filePath: string;
    declare lineNumber: CreationOptional<number | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initFindingOccurrenceModel(sequelize: Sequelize)
{
    FindingOccurrence.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            scanId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            findingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            repositoryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            branch: { type: DataTypes.STRING(150), allowNull: true },
            severity: { type: DataTypes.STRING(20), allowNull: false },
            ruleId: { type: DataTypes.STRING(100), allowNull: false },
            title: { type: DataTypes.STRING(255), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: false },
            remediation: { type: DataTypes.TEXT, allowNull: true },
            filePath: { type: DataTypes.STRING(500), allowNull: false },
            lineNumber: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        { sequelize, tableName: 'finding_occurrences', modelName: 'FindingOccurrence', timestamps: true }
    );

    return FindingOccurrence;
}

export { FindingOccurrence, initFindingOccurrenceModel };
