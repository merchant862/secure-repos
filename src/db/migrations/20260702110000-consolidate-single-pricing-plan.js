'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('pricing_plans', 'findingHistoryDays',
        {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 90
        });

        const [plans] = await queryInterface.sequelize.query(
            "SELECT id, slug FROM pricing_plans WHERE slug IN ('solo-starter', 'solo-pro')"
        );
        const starter = plans.find((plan) => plan.slug === 'solo-starter');
        const pro = plans.find((plan) => plan.slug === 'solo-pro');

        if (!starter)
        {
            throw new Error('Solo Starter pricing plan is required before consolidating packages');
        }

        if (pro)
        {
            await queryInterface.sequelize.query(
                'UPDATE tenant_subscriptions SET pricingPlanId = :starterId WHERE pricingPlanId = :proId',
                { replacements: { starterId: starter.id, proId: pro.id } }
            );
            await queryInterface.sequelize.query(
                'UPDATE tenant_subscriptions SET pendingPricingPlanId = NULL, pendingPlanChangeEffectiveAt = NULL WHERE pendingPricingPlanId = :proId',
                { replacements: { proId: pro.id } }
            );
            await queryInterface.sequelize.query(
                'DELETE FROM pricing_plan_features WHERE pricingPlanId = :proId',
                { replacements: { proId: pro.id } }
            );
            await queryInterface.sequelize.query(
                'DELETE FROM pricing_plans WHERE id = :proId',
                { replacements: { proId: pro.id } }
            );
        }

        await queryInterface.sequelize.query(
            `UPDATE pricing_plans
             SET description = 'GitHub repository security scanning with scheduled scans, dependency CVE checks, and critical/high-risk alerts.',
                 isHighlighted = TRUE,
                 sortOrder = 10,
                 ctaLabel = 'Start Security Preview',
                 findingHistoryDays = 90
             WHERE id = :starterId`,
            { replacements: { starterId: starter.id } }
        );
        await queryInterface.sequelize.query(
            "DELETE FROM pricing_plan_features WHERE pricingPlanId = :starterId AND (label LIKE '%report%' OR label LIKE '%export%')",
            { replacements: { starterId: starter.id } }
        );
        await queryInterface.sequelize.query(
            `UPDATE pricing_plan_features
             SET label = CASE
                 WHEN label = 'Critical email alerts' THEN 'Critical and high-risk email alerts'
                 WHEN label LIKE '%day findings history' THEN '90-day findings history'
                 ELSE label
             END
             WHERE pricingPlanId = :starterId`,
            { replacements: { starterId: starter.id } }
        );
    },

    async down(queryInterface, Sequelize)
    {
        const [plans] = await queryInterface.sequelize.query(
            "SELECT id FROM pricing_plans WHERE slug = 'solo-pro' LIMIT 1"
        );

        if (plans.length === 0)
        {
            await queryInterface.bulkInsert('pricing_plans',
            [
                {
                    name: 'Solo Pro',
                    slug: 'solo-pro',
                    description: 'Higher-capacity repository security scanning for independent developers.',
                    priceMonthlyCents: 2899,
                    currency: 'USD',
                    repositoryLimit: 10,
                    manualScanDailyLimit: 30,
                    manualScanCooldownMinutes: 10,
                    scanSchedule: 'daily',
                    isHighlighted: false,
                    isActive: true,
                    sortOrder: 20,
                    ctaLabel: 'Choose plan',
                    findingHistoryDays: 90,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]);
        }

        await queryInterface.removeColumn('pricing_plans', 'findingHistoryDays');
    }
};
