'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('users', 'role',
        {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'member'
        });

        await queryInterface.addColumn('users', 'status',
        {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'active'
        });

        await queryInterface.addIndex('users', ['tenantId', 'role']);
        await queryInterface.addIndex('users', ['status']);
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('users', ['status']);
        await queryInterface.removeIndex('users', ['tenantId', 'role']);
        await queryInterface.removeColumn('users', 'status');
        await queryInterface.removeColumn('users', 'role');
    }
};
