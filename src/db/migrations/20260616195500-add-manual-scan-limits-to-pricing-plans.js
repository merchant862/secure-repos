'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('pricing_plans', 'manualScanDailyLimit',
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            }
        );
        await queryInterface.addColumn('pricing_plans', 'manualScanCooldownMinutes',
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 15
            }
        );

        await queryInterface.bulkUpdate('pricing_plans', { manualScanDailyLimit: 10, manualScanCooldownMinutes: 15 }, { slug: 'starter' });
        await queryInterface.bulkUpdate('pricing_plans', { manualScanDailyLimit: 75, manualScanCooldownMinutes: 5 }, { slug: 'team' });
        await queryInterface.bulkUpdate('pricing_plans', { manualScanDailyLimit: 250, manualScanCooldownMinutes: 2 }, { slug: 'growth' });
    },

    async down(queryInterface)
    {
        await queryInterface.removeColumn('pricing_plans', 'manualScanCooldownMinutes');
        await queryInterface.removeColumn('pricing_plans', 'manualScanDailyLimit');
    }
};
