'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('repositories', 'securityScore',
        {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 100
        });

        await queryInterface.addColumn('repositories', 'baselineScanId',
        {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
            references:
            {
                model: 'scans',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        await queryInterface.addIndex('repositories', ['securityScore']);
        await queryInterface.addIndex('repositories', ['baselineScanId']);
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('repositories', ['baselineScanId']);
        await queryInterface.removeIndex('repositories', ['securityScore']);
        await queryInterface.removeColumn('repositories', 'baselineScanId');
        await queryInterface.removeColumn('repositories', 'securityScore');
    }
};
