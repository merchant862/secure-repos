'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('cli_access_tokens',
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
                references: { model: 'tenants', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            userId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            name:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            tokenHash:
            {
                type: Sequelize.STRING(64),
                allowNull: false,
                unique: true
            },
            tokenPrefix:
            {
                type: Sequelize.STRING(24),
                allowNull: false
            },
            tokenLastFour:
            {
                type: Sequelize.STRING(4),
                allowNull: false
            },
            expiresAt:
            {
                type: Sequelize.DATE,
                allowNull: false
            },
            lastUsedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            lastUsedIp:
            {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            revokedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt:
            {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt:
            {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('cli_access_tokens', ['tenantId', 'revokedAt', 'expiresAt']);
        await queryInterface.addIndex('cli_access_tokens', ['userId', 'revokedAt']);
        await queryInterface.addIndex('cli_access_tokens', ['tokenHash', 'revokedAt', 'expiresAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('cli_access_tokens');
    }
};
