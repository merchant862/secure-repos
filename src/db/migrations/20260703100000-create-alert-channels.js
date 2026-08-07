'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable(
            'alert_channels',
            {
                id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
                tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onDelete: 'CASCADE' },
                provider: { type: Sequelize.STRING(30), allowNull: false },
                name: { type: Sequelize.STRING(100), allowNull: false },
                webhookUrlEncrypted: { type: Sequelize.TEXT, allowNull: false },
                configEncrypted: { type: Sequelize.TEXT, allowNull: true },
                isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                lastDeliveredAt: { type: Sequelize.DATE, allowNull: true },
                lastError: { type: Sequelize.TEXT, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
                updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
            }
        );
        await queryInterface.addIndex('alert_channels', ['tenantId', 'provider']);
        await queryInterface.addIndex('alert_channels', ['tenantId', 'isActive']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('alert_channels');
    }
};
