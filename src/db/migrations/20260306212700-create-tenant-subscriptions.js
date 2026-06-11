'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('tenant_subscriptions',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            tenantId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                unique: true,
                references:
                {
                    model: 'tenants',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            pricingPlanId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'pricing_plans',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'pending'
            },
            trialEndsAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            currentPeriodEndsAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('tenant_subscriptions', ['status']);
        await queryInterface.addIndex('tenant_subscriptions', ['pricingPlanId']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('tenant_subscriptions');
    }
};
