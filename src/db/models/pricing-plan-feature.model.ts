import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { PricingPlan } from './pricing-plan.model';

class PricingPlanFeature extends Model<InferAttributes<PricingPlanFeature>, InferCreationAttributes<PricingPlanFeature>>
{
    declare id: CreationOptional<number>;
    declare pricingPlanId: ForeignKey<PricingPlan['id']>;
    declare label: string;
    declare isIncluded: CreationOptional<boolean>;
    declare sortOrder: CreationOptional<number>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initPricingPlanFeatureModel(sequelize: Sequelize)
{
    PricingPlanFeature.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            pricingPlanId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            label:
            {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            isIncluded:
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
            tableName: 'pricing_plan_features',
            modelName: 'PricingPlanFeature',
            timestamps: true
        }
    );

    return PricingPlanFeature;
}

export {
    PricingPlanFeature,
    initPricingPlanFeatureModel
};
