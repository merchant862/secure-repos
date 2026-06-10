'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('security_score_snapshots',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            repositoryId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'repositories', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
            score: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
            criticalCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            highCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            mediumCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            lowCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
            capturedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex('security_score_snapshots', ['tenantId', 'capturedAt']);
        await queryInterface.addIndex('security_score_snapshots', ['repositoryId', 'capturedAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('security_score_snapshots');
    }
};
