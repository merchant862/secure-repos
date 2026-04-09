'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('webhook_deliveries',
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
                type: Sequelize.STRING(150),
                allowNull: false,
                unique: true
            },
            eventName:
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
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'received'
            },
            statusReason:
            {
                type: Sequelize.STRING(255),
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
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('webhook_deliveries');
    }
};
