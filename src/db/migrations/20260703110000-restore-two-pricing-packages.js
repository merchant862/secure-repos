'use strict';

const starterFeatures =
[
    ['3 repositories', true],
    ['Weekly scheduled scans', true],
    ['Secret, dependency, repo config, and basic CI/CD checks', true],
    ['SecureRepos CLI access', true],
    ['Critical and high-risk email alerts', true],
    ['30-day findings history', true],
    ['15 repositories', false],
    ['Daily scheduled scans', false],
    ['Slack, Discord, Teams, Telegram, and GitHub Issues alerts', false],
    ['CI runtime guard and event history', false],
    ['MCP / coding-agent package access', false],
    ['GitHub Issues alert delivery', false],
    ['Safe remediation PRs', false],
    ['180-day findings history', false]
];

const proFeatures =
[
    ['15 repositories', true],
    ['Daily scheduled scans', true],
    ['Dependency, secret, container, filesystem, and IaC risk checks', true],
    ['SecureRepos CLI and coding-agent package access', true],
    ['Critical and high-risk email alerts', true],
    ['Slack, Discord, Teams, Telegram, and GitHub Issues alerts', true],
    ['CI runtime guard and event history', true],
    ['Safe remediation PRs for deterministic fixes', true],
    ['180-day findings history', true]
];

async function selectPlan(queryInterface, Sequelize, slug)
{
    const rows = await queryInterface.sequelize.query(
        'SELECT id, slug FROM pricing_plans WHERE slug = :slug LIMIT 1',
        {
            replacements: { slug },
            type: Sequelize.QueryTypes.SELECT
        }
    );

    return rows[0] ?? null;
}

async function replaceFeatures(queryInterface, pricingPlanId, features)
{
    const now = new Date();
    await queryInterface.sequelize.query(
        'DELETE FROM pricing_plan_features WHERE pricingPlanId = :pricingPlanId',
        { replacements: { pricingPlanId } }
    );

    await queryInterface.bulkInsert(
        'pricing_plan_features',
        features.map(function ([label, isIncluded], index)
        {
            return {
                pricingPlanId,
                label,
                isIncluded,
                sortOrder: (index + 1) * 10,
                createdAt: now,
                updatedAt: now
            };
        })
    );
}

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        const now = new Date();
        let starter = await selectPlan(queryInterface, Sequelize, 'solo-starter');

        if (!starter)
        {
            starter = await selectPlan(queryInterface, Sequelize, 'starter');

            if (starter)
            {
                await queryInterface.sequelize.query(
                    'UPDATE pricing_plans SET slug = :slug WHERE id = :id',
                    { replacements: { slug: 'solo-starter', id: starter.id } }
                );
            }
        }

        if (!starter)
        {
            await queryInterface.bulkInsert('pricing_plans',
            [
                {
                    name: 'Starter',
                    slug: 'solo-starter',
                    description: 'Core repository security monitoring for a small GitHub workspace.',
                    priceMonthlyCents: 2999,
                    currency: 'USD',
                    repositoryLimit: 3,
                    manualScanDailyLimit: 10,
                    manualScanCooldownMinutes: 20,
                    scanSchedule: 'weekly',
                    findingHistoryDays: 30,
                    isHighlighted: false,
                    isActive: true,
                    sortOrder: 10,
                    ctaLabel: 'Start Security Preview',
                    createdAt: now,
                    updatedAt: now
                }
            ]);
            starter = await selectPlan(queryInterface, Sequelize, 'solo-starter');
        }

        await queryInterface.sequelize.query(
            `UPDATE pricing_plans
             SET name = 'Starter',
                 description = 'Core repository security monitoring for a small GitHub workspace.',
                    priceMonthlyCents = 2999,
                 currency = 'USD',
                 repositoryLimit = 3,
                 manualScanDailyLimit = 10,
                 manualScanCooldownMinutes = 20,
                 scanSchedule = 'weekly',
                 findingHistoryDays = 30,
                 isHighlighted = FALSE,
                 isActive = TRUE,
                 sortOrder = 10,
                 ctaLabel = 'Start Security Preview',
                 updatedAt = :now
             WHERE id = :id`,
            { replacements: { id: starter.id, now } }
        );

        let pro = await selectPlan(queryInterface, Sequelize, 'solo-pro');

        if (!pro)
        {
            await queryInterface.bulkInsert('pricing_plans',
            [
                {
                    name: 'Pro',
                    slug: 'solo-pro',
                    description: 'Higher scan capacity, faster schedules, and workflow integrations for active teams.',
                    priceMonthlyCents: 7999,
                    currency: 'USD',
                    repositoryLimit: 15,
                    manualScanDailyLimit: 50,
                    manualScanCooldownMinutes: 10,
                    scanSchedule: 'daily',
                    findingHistoryDays: 180,
                    isHighlighted: true,
                    isActive: true,
                    sortOrder: 20,
                    ctaLabel: 'Choose Pro',
                    createdAt: now,
                    updatedAt: now
                }
            ]);
            pro = await selectPlan(queryInterface, Sequelize, 'solo-pro');
        }
        else
        {
            await queryInterface.sequelize.query(
                `UPDATE pricing_plans
                 SET name = 'Pro',
                     description = 'Higher scan capacity, faster schedules, and workflow integrations for active teams.',
                     priceMonthlyCents = 7999,
                     currency = 'USD',
                     repositoryLimit = 15,
                     manualScanDailyLimit = 50,
                     manualScanCooldownMinutes = 10,
                     scanSchedule = 'daily',
                     findingHistoryDays = 180,
                     isHighlighted = TRUE,
                     isActive = TRUE,
                     sortOrder = 20,
                     ctaLabel = 'Choose Pro',
                     updatedAt = :now
                 WHERE id = :id`,
                { replacements: { id: pro.id, now } }
            );
        }

        await queryInterface.sequelize.query(
            "UPDATE pricing_plans SET isActive = FALSE, isHighlighted = FALSE WHERE slug NOT IN ('solo-starter', 'solo-pro')"
        );

        await replaceFeatures(queryInterface, starter.id, starterFeatures);
        await replaceFeatures(queryInterface, pro.id, proFeatures);
    },

    async down(queryInterface, Sequelize)
    {
        const starter = await selectPlan(queryInterface, Sequelize, 'solo-starter');

        if (starter)
        {
            await queryInterface.sequelize.query(
                `UPDATE pricing_plans
                 SET name = 'SecureRepos',
                     description = 'GitHub repository security scanning with scheduled scans, dependency CVE checks, and critical/high-risk alerts.',
                     priceMonthlyCents = 1900,
                     repositoryLimit = 10,
                     manualScanDailyLimit = 30,
                     manualScanCooldownMinutes = 10,
                     scanSchedule = 'daily',
                     findingHistoryDays = 90,
                     isHighlighted = TRUE,
                     isActive = TRUE,
                     sortOrder = 10,
                     ctaLabel = 'Start Security Preview',
                     updatedAt = :now
                 WHERE id = :id`,
                { replacements: { id: starter.id, now: new Date() } }
            );
            await replaceFeatures(queryInterface, starter.id,
                [
                    ['10 repositories', true],
                    ['Daily scheduled scans', true],
                    ['Dependency and configuration checks', true],
                    ['Critical and high-risk email alerts', true],
                    ['90-day findings history', true]
                ]);
        }

        await queryInterface.sequelize.query(
            "UPDATE pricing_plans SET isActive = FALSE, isHighlighted = FALSE WHERE slug = 'solo-pro'"
        );
    }
};
