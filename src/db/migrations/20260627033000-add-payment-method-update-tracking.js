'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('tenant_subscriptions', 'lastPaymentMethodUpdateLinkAt',
            {
                type: Sequelize.DATE,
                allowNull: true,
                after: 'lastPlanChangedAt'
            }
        );
    },

    async down(queryInterface)
    {
        await queryInterface.removeColumn('tenant_subscriptions', 'lastPaymentMethodUpdateLinkAt');
    }
};
