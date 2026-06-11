'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('login_otps',
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
            challengeId:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            codeHash:
            {
                type: Sequelize.STRING(100),
                allowNull: false
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

        await queryInterface.addIndex('login_otps', ['userId', 'usedAt', 'expiresAt']);
        await queryInterface.addIndex('login_otps', ['challengeId', 'usedAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('login_otps');
    }
};
