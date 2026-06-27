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
    declare pendingPricingPlanId: CreationOptional<ForeignKey<PricingPlan['id']> | null>;
    declare status: CreationOptional<string>;
    declare trialEndsAt: CreationOptional<Date | null>;
    declare currentPeriodStartsAt: CreationOptional<Date | null>;
    declare currentPeriodEndsAt: CreationOptional<Date | null>;
    declare pendingPlanChangeEffectiveAt: CreationOptional<Date | null>;
    declare lastPlanChangedAt: CreationOptional<Date | null>;
    declare lastPaymentMethodUpdateLinkAt: CreationOptional<Date | null>;
    declare planChangeCount: CreationOptional<number>;
    declare cancelledAt: CreationOptional<Date | null>;
    declare cancelledBy: CreationOptional<string | null>;
    declare provider: CreationOptional<string | null>;
    declare providerCustomerId: CreationOptional<string | null>;
    declare providerSubscriptionId: CreationOptional<string | null>;
    declare providerTransactionId: CreationOptional<string | null>;
    declare providerPriceId: CreationOptional<string | null>;
    declare providerStatus: CreationOptional<string | null>;
    declare providerEventId: CreationOptional<string | null>;
    declare providerEventOccurredAt: CreationOptional<Date | null>;
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
            pendingPricingPlanId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'pending'
            },
            trialEndsAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            currentPeriodStartsAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            currentPeriodEndsAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            pendingPlanChangeEffectiveAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            lastPlanChangedAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            lastPaymentMethodUpdateLinkAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            planChangeCount:
            {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            cancelledAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            cancelledBy:
            {
                type: DataTypes.STRING(30),
                allowNull: true
            },
            provider:
            {
                type: DataTypes.STRING(30),
                allowNull: true
            },
            providerCustomerId:
            {
                type: DataTypes.STRING(191),
                allowNull: true
            },
            providerSubscriptionId:
            {
                type: DataTypes.STRING(191),
                allowNull: true
            },
            providerTransactionId:
            {
                type: DataTypes.STRING(191),
                allowNull: true
            },
            providerPriceId:
            {
                type: DataTypes.STRING(191),
                allowNull: true
            },
            providerStatus:
            {
                type: DataTypes.STRING(50),
                allowNull: true
            },
            providerEventId:
            {
                type: DataTypes.STRING(191),
                allowNull: true
            },
            providerEventOccurredAt:
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
