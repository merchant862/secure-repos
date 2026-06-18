'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn(
            'findings',
            'branch',
            {
                type: Sequelize.STRING(150),
                allowNull: true,
                after: 'remediation'
            }
        );

        await queryInterface.addIndex('findings', ['repositoryId', 'branch', 'status']);
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('findings', ['repositoryId', 'branch', 'status']);
        await queryInterface.removeColumn('findings', 'branch');
    }
};
