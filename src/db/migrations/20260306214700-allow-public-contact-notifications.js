'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.sequelize.query('ALTER TABLE `notification_events` MODIFY `tenantId` BIGINT UNSIGNED NULL');
    },

    async down(queryInterface, Sequelize)
    {
        await queryInterface.sequelize.query('ALTER TABLE `notification_events` MODIFY `tenantId` BIGINT UNSIGNED NOT NULL');
    }
};
