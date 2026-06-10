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
import { Tenant } from './tenant.model';

class TenantSubscription extends Model<InferAttributes<TenantSubscription>, InferCreationAttributes<TenantSubscription>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare pricingPlanId: ForeignKey<PricingPlan['id']>;
    declare status: CreationOptional<string>;
    declare trialEndsAt: CreationOptional<Date | null>;
    declare currentPeriodEndsAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initTenantSubscriptionModel(sequelize: Sequelize)
{
    TenantSubscription.init(
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
            pricingPlanId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'trialing'
            },
            trialEndsAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            currentPeriodEndsAt:
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
            tableName: 'tenant_subscriptions',
            modelName: 'TenantSubscription',
            timestamps: true
        }
    );

    return TenantSubscription;
}

export {
    TenantSubscription,
    initTenantSubscriptionModel
};
