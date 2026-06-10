'use strict';

module.exports =
{
    async up(queryInterface, Sequelize)
    {
        await queryInterface.createTable('findings',
        {
            id:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            scanId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'scans',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            repositoryId:
            {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references:
                {
                    model: 'repositories',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            ruleId:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            severity:
            {
                type: Sequelize.STRING(20),
                allowNull: false
            },
            title:
            {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            description:
            {
                type: Sequelize.TEXT,
                allowNull: false
            },
            filePath:
            {
                type: Sequelize.STRING(500),
                allowNull: false
            },
            lineNumber:
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            fingerprint:
            {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            status:
            {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'open'
            },
            metadata:
            {
                type: Sequelize.JSON,
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

        await queryInterface.addIndex('findings', ['scanId']);
        await queryInterface.addIndex('findings', ['repositoryId', 'status']);
        await queryInterface.addIndex('findings', ['severity']);
        await queryInterface.addIndex('findings', ['fingerprint']);
    },

    async down(queryInterface)
    {
        await queryInterface.dropTable('findings');
    }
};
