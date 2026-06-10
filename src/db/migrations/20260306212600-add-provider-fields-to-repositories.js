'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('repositories', 'codeHostConnectionId',
        {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
            references:
            {
                model: 'code_host_connections',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        await queryInterface.addColumn('repositories', 'provider',
        {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'github'
        });

        await queryInterface.addColumn('repositories', 'externalRepositoryId',
        {
            type: Sequelize.STRING(150),
            allowNull: true
        });

        await queryInterface.addColumn('repositories', 'webUrl',
        {
            type: Sequelize.STRING(500),
            allowNull: true
        });

        await queryInterface.changeColumn('repositories', 'githubInstallationId',
        {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true
        });

        await queryInterface.addIndex('repositories', ['codeHostConnectionId', 'isActive']);
        await queryInterface.addIndex('repositories', ['provider', 'externalRepositoryId'], { unique: true });
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('repositories', ['provider', 'externalRepositoryId']);
        await queryInterface.removeIndex('repositories', ['codeHostConnectionId', 'isActive']);
        await queryInterface.changeColumn('repositories', 'githubInstallationId',
        {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: false
        });
        await queryInterface.removeColumn('repositories', 'webUrl');
        await queryInterface.removeColumn('repositories', 'externalRepositoryId');
        await queryInterface.removeColumn('repositories', 'provider');
        await queryInterface.removeColumn('repositories', 'codeHostConnectionId');
    }
};
