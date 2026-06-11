'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Choose Starter' }, { slug: 'starter' });
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Choose Team' }, { slug: 'team' });
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Choose Growth' }, { slug: 'growth' });
    },

    async down(queryInterface)
    {
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Start trial' }, { slug: 'starter' });
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Start trial' }, { slug: 'team' });
        await queryInterface.bulkUpdate('pricing_plans', { ctaLabel: 'Start trial' }, { slug: 'growth' });
    }
};
