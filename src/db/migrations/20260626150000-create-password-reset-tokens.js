'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('password_reset_tokens',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            userId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'users',
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
            usedAt:
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

        await queryInterface.addIndex('password_reset_tokens', ['userId', 'usedAt', 'expiresAt']);
        await queryInterface.addIndex('password_reset_tokens', ['tokenHash', 'usedAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('password_reset_tokens');
    }
};
