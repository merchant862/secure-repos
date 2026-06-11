'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.changeColumn('tenant_subscriptions', 'status',
        {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'pending'
        });
    },

    async down(queryInterface, Sequelize)
    {
        await queryInterface.changeColumn('tenant_subscriptions', 'status',
        {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'trialing'
        });
    }
};
