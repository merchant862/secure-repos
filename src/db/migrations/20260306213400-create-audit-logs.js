'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('audit_logs',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
            action: { type: Sequelize.STRING(100), allowNull: false },
            entityType: { type: Sequelize.STRING(100), allowNull: false },
            entityId: { type: Sequelize.STRING(100), allowNull: true },
            metadata: { type: Sequelize.JSON, allowNull: true },
            ipAddress: { type: Sequelize.STRING(100), allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex('audit_logs', ['tenantId', 'createdAt']);
        await queryInterface.addIndex('audit_logs', ['action']);
        await queryInterface.addIndex('audit_logs', ['entityType', 'entityId']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('audit_logs');
    }
};
