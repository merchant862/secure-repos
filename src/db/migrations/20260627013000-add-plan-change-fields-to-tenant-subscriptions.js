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
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'pendingPricingPlanId', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'pendingPlanChangeEffectiveAt', { type: Sequelize.DATE, allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'lastPlanChangedAt', { type: Sequelize.DATE, allowNull: true });
        await addColumnIfMissing(queryInterface, 'tenant_subscriptions', 'planChangeCount', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });

        await addIndexIfMissing(queryInterface, 'tenant_subscriptions', 'tenant_subscriptions_pending_pricing_plan_id', ['pendingPricingPlanId']);
    },

    async down(queryInterface)
    {
        const table = await queryInterface.describeTable('tenant_subscriptions');
        const columns = ['planChangeCount', 'lastPlanChangedAt', 'pendingPlanChangeEffectiveAt', 'pendingPricingPlanId'];

        for (const column of columns)
        {
            if (table[column])
            {
                await queryInterface.removeColumn('tenant_subscriptions', column);
            }
        }
    }
};
