'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.addColumn('users', 'emailVerifiedAt',
        {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.createTable('email_verification_tokens',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            userId:
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
            tokenHash:
            {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            expiresAt:
            {
                type: Sequelize.DATE,
                allowNull: false
            },
            usedAt:
            {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt:
            {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt:
            {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('email_verification_tokens', ['userId', 'usedAt', 'expiresAt']);
        await queryInterface.addIndex('email_verification_tokens', ['tokenHash', 'usedAt']);

        await queryInterface.addColumn('github_installations', 'githubAccountId',
        {
            type: Sequelize.STRING(100),
            allowNull: true
        });
        await queryInterface.addIndex('github_installations', ['githubAccountId'],
        {
            unique: true,
            name: 'github_installations_github_account_id_unique'
        });

        await queryInterface.sequelize.query(
            'UPDATE users SET emailVerifiedAt = createdAt WHERE emailVerifiedAt IS NULL'
        );
    },

    async down(queryInterface)
    {
        await queryInterface.removeIndex('github_installations', 'github_installations_github_account_id_unique');
        await queryInterface.removeColumn('github_installations', 'githubAccountId');
        await queryInterface.dropTable('email_verification_tokens');
        await queryInterface.removeColumn('users', 'emailVerifiedAt');
    }
};
