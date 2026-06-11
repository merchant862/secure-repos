'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('pricing_plans',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            name:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            slug:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            description:
            {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            priceMonthlyCents:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false
            },
            currency:
            {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: 'USD'
            },
            repositoryLimit:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            teamMemberLimit:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            scanSchedule:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: 'daily'
            },
            isHighlighted:
            {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            isActive:
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
            ctaLabel:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: 'Choose plan'
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

        await queryInterface.addIndex('pricing_plans', ['isActive', 'sortOrder']);
        await queryInterface.addIndex('pricing_plans', ['isHighlighted']);

        await queryInterface.bulkInsert('pricing_plans',
        [
            {
                name: 'Starter',
                slug: 'starter',
                description: 'For solo developers and small side projects.',
                priceMonthlyCents: 1900,
                currency: 'USD',
                repositoryLimit: 3,
                teamMemberLimit: 1,
                scanSchedule: 'daily',
                isHighlighted: false,
                isActive: true,
                sortOrder: 10,
                ctaLabel: 'Choose Starter',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Team',
                slug: 'team',
                description: 'For small SaaS teams that want continuous GitHub security monitoring.',
                priceMonthlyCents: 4900,
                currency: 'USD',
                repositoryLimit: 15,
                teamMemberLimit: 3,
                scanSchedule: 'daily_and_push',
                isHighlighted: true,
                isActive: true,
                sortOrder: 20,
                ctaLabel: 'Choose Team',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Growth',
                slug: 'growth',
                description: 'For agencies and growing teams with more repositories.',
                priceMonthlyCents: 9900,
                currency: 'USD',
                repositoryLimit: 50,
                teamMemberLimit: 10,
                scanSchedule: 'daily_and_push',
                isHighlighted: false,
                isActive: true,
                sortOrder: 30,
                ctaLabel: 'Choose Growth',
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ]);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('pricing_plans');
    }
};
