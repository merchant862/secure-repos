'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.dropTable('ignore_rules');
    },

    async down(queryInterface, Sequelize)
    {
        await queryInterface.createTable('ignore_rules',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            createdByUserId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
            ruleId: { type: Sequelize.STRING(100), allowNull: true },
            filePattern: { type: Sequelize.STRING(500), allowNull: true },
            reason: { type: Sequelize.STRING(255), allowNull: true },
            isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
        await queryInterface.addIndex('ignore_rules', ['tenantId', 'isActive']);
        await queryInterface.addIndex('ignore_rules', ['ruleId']);
    }
};
