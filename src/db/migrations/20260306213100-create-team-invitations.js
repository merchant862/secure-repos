'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('team_invitations',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            tenantId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'tenants',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            invitedByUserId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            email:
            {
                type: Sequelize.STRING(191),
                allowNull: false
            },
            role:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'member'
            },
            tokenHash:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'pending'
            },
            expiresAt:
            {
                type: Sequelize.DATE,
                allowNull: false
            },
            acceptedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
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

        await queryInterface.addIndex('team_invitations', ['tenantId', 'status']);
        await queryInterface.addIndex('team_invitations', ['email', 'status']);
        await queryInterface.addIndex('team_invitations', ['expiresAt']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('team_invitations');
    }
};
