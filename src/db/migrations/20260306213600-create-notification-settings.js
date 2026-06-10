'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('notification_settings',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            instantCritical: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            instantHigh: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            dailyDigest: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
            weeklyReport: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            emailRecipients: { type: Sequelize.JSON, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('notification_settings');
    }
};
