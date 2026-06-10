'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('in_app_notifications',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            type: { type: Sequelize.STRING(50), allowNull: false },
            title: { type: Sequelize.STRING(255), allowNull: false },
            body: { type: Sequelize.TEXT, allowNull: false },
            payload: { type: Sequelize.JSON, allowNull: true },
            readAt: { type: Sequelize.DATE, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex('in_app_notifications', ['tenantId', 'readAt']);
        await queryInterface.addIndex('in_app_notifications', ['userId', 'readAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('in_app_notifications');
    }
};
