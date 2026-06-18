'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.bulkUpdate(
            'pricing_plan_features',
            { label: 'Up to 50 branches and 2,000 scannable files per repository scan' },
            { label: 'All-branch scanning' }
        );
    },

    async down(queryInterface)
    {
        await queryInterface.bulkUpdate(
            'pricing_plan_features',
            { label: 'All-branch scanning' },
            { label: 'Up to 50 branches and 2,000 scannable files per repository scan' }
        );
    }
};
