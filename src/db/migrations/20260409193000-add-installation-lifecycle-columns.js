'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('github_installations', 'isActive',
        {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true
        });

        await queryInterface.addColumn('github_installations', 'lastRepositorySyncAt',
        {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('github_installations', 'uninstalledAt',
        {
            type: Sequelize.DATE,
            allowNull: true
        });
    },

    async down(queryInterface)
    {
        await queryInterface.removeColumn('github_installations', 'uninstalledAt');
        await queryInterface.removeColumn('github_installations', 'lastRepositorySyncAt');
        await queryInterface.removeColumn('github_installations', 'isActive');
    }
};
