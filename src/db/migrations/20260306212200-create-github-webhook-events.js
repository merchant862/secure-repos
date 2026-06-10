'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('github_webhook_events',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            deliveryId:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            event:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            action:
            {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'received'
            },
            errorMessage:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            processedAt:
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

        await queryInterface.addIndex('github_webhook_events', ['event', 'createdAt']);
        await queryInterface.addIndex('github_webhook_events', ['status']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('github_webhook_events');
    }
};
