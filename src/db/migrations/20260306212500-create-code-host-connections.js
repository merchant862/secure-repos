'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('code_host_connections',
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
            provider:
            {
                type: Sequelize.STRING(30),
                allowNull: false
            },
            externalId:
            {
                type: Sequelize.STRING(150),
                allowNull: false
            },
            accountLogin:
            {
                type: Sequelize.STRING(191),
                allowNull: false
            },
            accountType:
            {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            accessTokenEncrypted:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            refreshTokenEncrypted:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            tokenExpiresAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            webhookSecretEncrypted:
            {
                type: Sequelize.TEXT,
                allowNull: true
            },
            isActive:
            {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            lastSyncAt:
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

        await queryInterface.addIndex('code_host_connections', ['tenantId', 'provider']);
        await queryInterface.addIndex('code_host_connections', ['provider', 'externalId'], { unique: true });
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('code_host_connections');
    }
};
