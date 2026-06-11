'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('admins',
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
                type: Sequelize.STRING(150),
                allowNull: false
            },
            email:
            {
                type: Sequelize.STRING(191),
                allowNull: false,
                unique: true
            },
            password:
            {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            role:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'admin'
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'active'
            },
            lastLoginAt:
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

        await queryInterface.addIndex('admins', ['email', 'status']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('admins');
    }
};
