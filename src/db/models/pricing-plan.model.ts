import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

class PricingPlan extends Model<InferAttributes<PricingPlan>, InferCreationAttributes<PricingPlan>>
{
    declare id: CreationOptional<number>;
    declare name: string;
    declare slug: string;
    declare description: CreationOptional<string | null>;
    declare priceMonthlyCents: number;
    declare currency: CreationOptional<string>;
    declare repositoryLimit: CreationOptional<number | null>;
    declare teamMemberLimit: CreationOptional<number | null>;
    declare scanSchedule: CreationOptional<string>;
    declare isHighlighted: CreationOptional<boolean>;
    declare isActive: CreationOptional<boolean>;
    declare sortOrder: CreationOptional<number>;
    declare ctaLabel: CreationOptional<string>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initPricingPlanModel(sequelize: Sequelize)
{
    PricingPlan.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            name:
            {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            slug:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            description:
            {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            priceMonthlyCents:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false
            },
            currency:
            {
                type: DataTypes.STRING(10),
                allowNull: false,
                defaultValue: 'USD'
            },
            repositoryLimit:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true
            },
            teamMemberLimit:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true
            },
            scanSchedule:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                defaultValue: 'daily'
            },
            isHighlighted:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            isActive:
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            sortOrder:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            ctaLabel:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                defaultValue: 'Start trial'
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
            tableName: 'pricing_plans',
            modelName: 'PricingPlan',
            timestamps: true
        }
    );

    return PricingPlan;
}

export {
    PricingPlan,
    initPricingPlanModel
};
