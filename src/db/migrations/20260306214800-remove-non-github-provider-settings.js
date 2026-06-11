'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.sequelize.query("DELETE FROM `provider_settings` WHERE `provider` <> 'github'");
    },

    async down(queryInterface)
    {
        return Promise.resolve();
    }
};
