'use strict';

module.exports =
{
    async up(queryInterface)
    {
        await queryInterface.dropTable('team_invitations');
        await queryInterface.removeColumn('pricing_plans', 'teamMemberLimit');
    },

    async down(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('pricing_plans', 'teamMemberLimit', { type: Sequelize.INTEGER.UNSIGNED, allowNull: true });
        await queryInterface.createTable('team_invitations',
        {
            id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
            tenantId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'tenants', key: 'id' }, onDelete: 'CASCADE' },
            invitedByUserId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
            email: { type: Sequelize.STRING(255), allowNull: false },
            role: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'member' },
            tokenHash: { type: Sequelize.STRING(100), allowNull: false, unique: true },
            status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'pending' },
            expiresAt: { type: Sequelize.DATE, allowNull: false },
            acceptedAt: { type: Sequelize.DATE, allowNull: true },
            createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
    }
};
