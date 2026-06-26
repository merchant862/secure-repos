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
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'currentPeriodStartsAt', { type: Sequelize.DATE, allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'provider', { type: Sequelize.STRING(30), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerCustomerId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerSubscriptionId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerTransactionId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerPriceId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerStatus', { type: Sequelize.STRING(50), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerEventId', { type: Sequelize.STRING(191), allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'providerEventOccurredAt', { type: Sequelize.DATE, allowNull: true });

        await addIndexIfMissing(queryInterface, 'tenant_subscriptions', 'tenant_subscriptions_provider_subscription_id', ['providerSubscriptionId']);
        await addIndexIfMissing(queryInterface, 'tenant_subscriptions', 'tenant_subscriptions_provider_customer_id', ['providerCustomerId']);
        await addIndexIfMissing(queryInterface, 'tenant_subscriptions', 'tenant_subscriptions_provider_event_id', ['providerEventId']);
    },

    async down(queryInterface)
    {
        const table = await queryInterface.describeTable('tenant_subscriptions');
        const columns = ['providerEventOccurredAt', 'providerEventId', 'providerStatus', 'providerPriceId', 'providerTransactionId', 'providerSubscriptionId', 'providerCustomerId', 'provider', 'currentPeriodStartsAt'];

        for (const column of columns)
        {
            if (table[column])
            {
                await queryInterface.removeColumn('tenant_subscriptions', column);
            }
        }
    }
};
