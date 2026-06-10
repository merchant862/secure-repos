'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('scans',
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
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'queued'
            },
            triggerType:
            {
                type: Sequelize.STRING(30),
                allowNull: false
            },
            branch:
            {
                type: Sequelize.STRING(150),
                allowNull: true
            },
            commitSha:
            {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            findingsCritical:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsHigh:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsMedium:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            findingsLow:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            errorMessage:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            startedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            completedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
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

        await queryInterface.addIndex('scans', ['status', 'createdAt']);
        await queryInterface.addIndex('scans', ['repositoryId', 'createdAt']);
        await queryInterface.addIndex('scans', ['tenantId', 'createdAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('scans');
    }
};
