'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('admin_sessions',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            adminId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'admins',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            tokenHash:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            expiresAt:
            {
                type: Sequelize.DATE,
                allowNull: false
            },
            revokedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            ipAddress:
            {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            userAgent:
            {
                type: Sequelize.STRING(500),
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

        await queryInterface.addIndex('admin_sessions', ['adminId', 'revokedAt', 'expiresAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('admin_sessions');
    }
};
