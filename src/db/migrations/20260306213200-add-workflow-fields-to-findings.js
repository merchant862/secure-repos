'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('findings', 'remediation',
        {
            type: Sequelize.TEXT,
            allowNull: true
        });

        await queryInterface.addColumn('findings', 'assignedToUserId',
        {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
            references:
            {
                model: 'users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        await queryInterface.addColumn('findings', 'firstSeenAt',
        {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        });

        await queryInterface.addColumn('findings', 'lastSeenAt',
        {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        });

        await queryInterface.addColumn('findings', 'resolvedAt',
        {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('findings', 'ignoredUntil',
        {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addIndex('findings', ['assignedToUserId', 'status']);
        await queryInterface.addIndex('findings', ['ignoredUntil']);
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('findings', ['ignoredUntil']);
        await queryInterface.removeIndex('findings', ['assignedToUserId', 'status']);
        await queryInterface.removeColumn('findings', 'ignoredUntil');
        await queryInterface.removeColumn('findings', 'resolvedAt');
        await queryInterface.removeColumn('findings', 'lastSeenAt');
        await queryInterface.removeColumn('findings', 'firstSeenAt');
        await queryInterface.removeColumn('findings', 'assignedToUserId');
        await queryInterface.removeColumn('findings', 'remediation');
    }
};
