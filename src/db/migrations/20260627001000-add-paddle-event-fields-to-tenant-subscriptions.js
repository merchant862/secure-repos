'use strict';

async function addColumnIfMissing(queryInterface, tableName, columnName, definition)
{
    const table = await queryInterface.describeTable(tableName);

    if (!table[columnName])
    {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
}

async function addIndexIfMissing(queryInterface, tableName, indexName, fields)
{
    const indexes = await queryInterface.showIndex(tableName);

    if (!indexes.some((index) => index.name === indexName))
    {
        await queryInterface.addIndex(tableName, fields, { name: indexName });
    }
}

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerEventId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerEventOccurredAt', { type: Sequelize.DATE, allowNull: true });
        await addIndexIfMissing(queryInterface, 'tenant_subscriptions', 'tenant_subscriptions_provider_event_id', ['providerEventId']);
    },

    async down(queryInterface)
    {
        const table = await queryInterface.describeTable('tenant_subscriptions');

        if (table.providerEventOccurredAt)
        {
            await queryInterface.removeColumn('tenant_subscriptions', 'providerEventOccurredAt');
        }

        if (table.providerEventId)
        {
            await queryInterface.removeColumn('tenant_subscriptions', 'providerEventId');
        }
    }
};
