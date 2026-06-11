'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('provider_settings',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            provider:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                unique: true
            },
            displayName:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            isEnabled:
            {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            sortOrder:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            connectLabel:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: 'Connect provider'
            },
            setupInstructions:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            scanDefaults:
            {
                type: Sequelize.JSON,
                allowNull: true
            },
            planAvailability:
            {
                type: Sequelize.JSON,
                allowNull: true
            },
            metadata:
            {
                type: Sequelize.JSON,
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

        await queryInterface.bulkInsert('provider_settings',
        [
            {
                provider: 'github',
                displayName: 'GitHub',
                isEnabled: true,
                sortOrder: 10,
                connectLabel: 'Connect GitHub',
                setupInstructions: 'Install the GitHub App and select repositories for scanning.',
                scanDefaults: JSON.stringify({ triggerFirstScan: true }),
                planAvailability: JSON.stringify({ starter: true, team: true, growth: true }),
                metadata: JSON.stringify({ authMode: 'github_app' }),
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ]);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('provider_settings');
    }
};
