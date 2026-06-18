'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.removeColumn('admins', 'role');
    },

    async down(queryInterface, Sequelize)
    {
        await queryInterface.addColumn(
            'admins',
            'role',
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'admin',
                after: 'password'
            }
        );
    }
};
