'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('notification_events',
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
            type:
            {
                type: Sequelize.STRING(50),
                allowNull: false
            },
            channel:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'email'
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'queued'
            },
            subject:
            {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            payload:
            {
                type: Sequelize.JSON,
                allowNull: false
            },
            sentAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            errorMessage:
            {
                type: Sequelize.TEXT,
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

        await queryInterface.addIndex('notification_events', ['status', 'createdAt']);
        await queryInterface.addIndex('notification_events', ['tenantId', 'type']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('notification_events');
    }
};
