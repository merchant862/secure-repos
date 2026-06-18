'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('login_otps', 'attemptCount', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
        await queryInterface.addColumn('login_otps', 'lastAttemptAt', { type: Sequelize.DATE, allowNull: true });
        await queryInterface.addColumn('repositories', 'nextScheduledScanAt', { type: Sequelize.DATE, allowNull: true });
        await queryInterface.addColumn('repositories', 'lastScheduledScanAt', { type: Sequelize.DATE, allowNull: true });

        await queryInterface.createTable('provider_oauth_states',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            nonceHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onDelete: 'CASCADE' },
            userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
            provider: { type: Sequelize.STRING(30), allowNull: false },
            expiresAt: { type: Sequelize.DATE, allowNull: false },
            consumedAt: { type: Sequelize.DATE, allowNull: true },
            createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
        await queryInterface.addIndex('provider_oauth_states', ['provider', 'expiresAt']);

        await queryInterface.createTable('finding_occurrences',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            scanId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'scans', key: 'id' }, onDelete: 'CASCADE' },
            findingId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'findings', key: 'id' }, onDelete: 'CASCADE' },
            repositoryId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'repositories', key: 'id' }, onDelete: 'CASCADE' },
            branch: { type: Sequelize.STRING(150), allowNull: true },
            severity: { type: Sequelize.STRING(20), allowNull: false },
            ruleId: { type: Sequelize.STRING(100), allowNull: false },
            title: { type: Sequelize.STRING(255), allowNull: false },
            description: { type: Sequelize.TEXT, allowNull: false },
            remediation: { type: Sequelize.TEXT, allowNull: true },
            filePath: { type: Sequelize.STRING(500), allowNull: false },
            lineNumber: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
            createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
        await queryInterface.addConstraint('finding_occurrences', { fields: ['scanId', 'findingId'], type: 'unique', name: 'finding_occurrences_scan_finding_unique' });
        await queryInterface.addIndex('finding_occurrences', ['scanId', 'severity']);
        await queryInterface.addIndex('finding_occurrences', ['repositoryId', 'createdAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('finding_occurrences');
        await queryInterface.dropTable('provider_oauth_states');
        await queryInterface.removeColumn('repositories', 'lastScheduledScanAt');
        await queryInterface.removeColumn('repositories', 'nextScheduledScanAt');
        await queryInterface.removeColumn('login_otps', 'lastAttemptAt');
        await queryInterface.removeColumn('login_otps', 'attemptCount');
    }
};
