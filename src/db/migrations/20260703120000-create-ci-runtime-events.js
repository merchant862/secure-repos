'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('ci_runtime_events',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: 'tenants', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            repositoryFullName: { type: Sequelize.STRING(255), allowNull: false },
            workflowName: { type: Sequelize.STRING(255), allowNull: true },
            jobName: { type: Sequelize.STRING(255), allowNull: true },
            runId: { type: Sequelize.STRING(100), allowNull: true },
            eventType: { type: Sequelize.STRING(80), allowNull: false },
            severity: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'medium' },
            summary: { type: Sequelize.STRING(500), allowNull: false },
            metadata: { type: Sequelize.JSON, allowNull: true },
            observedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex('ci_runtime_events', ['tenantId', 'createdAt']);
        await queryInterface.addIndex('ci_runtime_events', ['tenantId', 'repositoryFullName']);
        await queryInterface.addIndex('ci_runtime_events', ['tenantId', 'runId']);
        await queryInterface.addIndex('ci_runtime_events', ['eventType', 'severity']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('ci_runtime_events');
    }
};
