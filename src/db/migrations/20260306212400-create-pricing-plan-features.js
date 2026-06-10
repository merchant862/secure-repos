'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('pricing_plan_features',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            pricingPlanId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'pricing_plans',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            label:
            {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            isIncluded:
            {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            sortOrder:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            createdAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt:
            {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('pricing_plan_features', ['pricingPlanId', 'sortOrder']);

        const plans = await queryInterface.sequelize.query(
            'SELECT id, slug FROM pricing_plans WHERE slug IN (:slugs)',
            {
                replacements:
                {
                    slugs: ['starter', 'team', 'growth']
                },
                type: Sequelize.QueryTypes.SELECT
            }
        );
        const planBySlug = new Map(plans.map(function (plan)
        {
            return [plan.slug, plan.id];
        }));
        const now = new Date();
        const featureMap =
        {
            starter:
            [
                '3 repositories',
                'Daily security scans',
                'Secret detection',
                'Basic repo hygiene checks',
                'Email alerts'
            ],
            team:
            [
                '15 repositories',
                'Daily and push-triggered scans',
                'Secret detection',
                'Dependency and config checks',
                'Priority email alerts',
                'Weekly security report',
                '3 team members'
            ],
            growth:
            [
                '50 repositories',
                'Daily and push-triggered scans',
                'Secret detection',
                'Dependency and config checks',
                'Weekly security report',
                'Priority support',
                '10 team members'
            ]
        };
        const rows = [];

        for (const [slug, features] of Object.entries(featureMap))
        {
            const pricingPlanId = planBySlug.get(slug);

            if (!pricingPlanId)
            {
                continue;
            }

            features.forEach(function (label, index)
            {
                rows.push(
                    {
                        pricingPlanId,
                        label,
                        isIncluded: true,
                        sortOrder: (index + 1) * 10,
                        createdAt: now,
                        updatedAt: now
                    }
                );
            });
        }

        await queryInterface.bulkInsert('pricing_plan_features', rows);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('pricing_plan_features');
    }
};
