'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('tenant_subscriptions', 'cancelledAt',
        {
            type: Sequelize.DATE,
            allowNull: true
        });
        await queryInterface.addColumn('tenant_subscriptions', 'cancelledBy',
        {
            type: Sequelize.STRING(30),
            allowNull: true
        });
    },

    async down(queryInterface)
    {
        await queryInterface.removeColumn('tenant_subscriptions', 'cancelledBy');
        await queryInterface.removeColumn('tenant_subscriptions', 'cancelledAt');
    }
};
