'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('scans', 'metadata',
        {
            type: Sequelize.JSON,
            allowNull: true,
            after: 'errorMessage'
        });
    },

    async down(queryInterface)
    {
        await queryInterface.removeColumn('scans', 'metadata');
    }
};
