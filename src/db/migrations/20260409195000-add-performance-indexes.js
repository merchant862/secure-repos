'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.addIndex('github_installations', ['tenantId', 'isActive'], {
            name: 'github_installations_tenant_active_idx'
        });

        await queryInterface.addIndex('repositories', ['githubInstallationId', 'isActive'], {
            name: 'repositories_installation_active_idx'
        });

        await queryInterface.addIndex('repositories', ['fullName'], {
            name: 'repositories_full_name_idx'
        });

        await queryInterface.addIndex('findings', ['repositoryId', 'status'], {
            name: 'findings_repository_status_idx'
        });

        await queryInterface.addIndex('findings', ['tenantId', 'severity'], {
            name: 'findings_tenant_severity_idx'
        });

        await queryInterface.addIndex('webhook_deliveries', ['eventName', 'status'], {
            name: 'webhook_deliveries_event_status_idx'
        });
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('webhook_deliveries', 'webhook_deliveries_event_status_idx');
        await queryInterface.removeIndex('findings', 'findings_tenant_severity_idx');
        await queryInterface.removeIndex('findings', 'findings_repository_status_idx');
        await queryInterface.removeIndex('repositories', 'repositories_full_name_idx');
        await queryInterface.removeIndex('repositories', 'repositories_installation_active_idx');
        await queryInterface.removeIndex('github_installations', 'github_installations_tenant_active_idx');
    }
};
