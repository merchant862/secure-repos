import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

class CiRuntimeEvent extends Model<InferAttributes<CiRuntimeEvent>, InferCreationAttributes<CiRuntimeEvent>>
{
    declare id: CreationOptional<number>;
    declare tenantId: number;
    declare repositoryFullName: string;
    declare workflowName: CreationOptional<string | null>;
    declare jobName: CreationOptional<string | null>;
    declare runId: CreationOptional<string | null>;
    declare eventType: string;
    declare severity: CreationOptional<string>;
    declare summary: string;
    declare metadata: CreationOptional<object | null>;
    declare observedAt: CreationOptional<Date>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initCiRuntimeEventModel(sequelize: Sequelize)
{
    CiRuntimeEvent.init(
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
            tenantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
            repositoryFullName: { type: DataTypes.STRING(255), allowNull: false },
            workflowName: { type: DataTypes.STRING(255), allowNull: true },
            jobName: { type: DataTypes.STRING(255), allowNull: true },
            runId: { type: DataTypes.STRING(100), allowNull: true },
            eventType: { type: DataTypes.STRING(80), allowNull: false },
            severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medium' },
            summary: { type: DataTypes.STRING(500), allowNull: false },
            metadata: { type: DataTypes.JSON, allowNull: true },
            observedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        {
            sequelize,
            tableName: 'ci_runtime_events',
            modelName: 'CiRuntimeEvent',
            timestamps: true
        }
    );

    return CiRuntimeEvent;
}

export {
    CiRuntimeEvent,
    initCiRuntimeEventModel
};
