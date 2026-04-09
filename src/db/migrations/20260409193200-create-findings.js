'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('findings',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            tenantId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'tenants',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            repositoryId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'repositories',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            provider:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: 'internal'
            },
            category:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            severity:
            {
                type: Sequelize.STRING(50),
                allowNull: false
            },
            title:
            {
                type: Sequelize.STRING(191),
                allowNull: false
            },
            description:
            {
                type: Sequelize.TEXT,
                allowNull: false
            },
            status:
            {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'open'
            },
            fingerprint:
            {
                type: Sequelize.STRING(191),
                allowNull: false,
                unique: true
            },
            createdAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('findings');
    }
};
