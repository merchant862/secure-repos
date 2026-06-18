import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

class Admin extends Model<InferAttributes<Admin>, InferCreationAttributes<Admin>>
{
    declare id: CreationOptional<number>;
    declare name: string;
    declare email: string;
    declare password: string;
    declare status: CreationOptional<string>;
    declare lastLoginAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initAdminModel(sequelize: Sequelize)
{
    Admin.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            name:
            {
                type: DataTypes.STRING(150),
                allowNull: false
            },
            email:
            {
                type: DataTypes.STRING(191),
                allowNull: false,
                unique: true
            },
            password:
            {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'active'
            },
            lastLoginAt:
            {
                type: DataTypes.DATE,
                allowNull: true
            },
            createdAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            updatedAt:
            {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            tableName: 'admins',
            modelName: 'Admin',
            timestamps: true
        }
    );

    return Admin;
}

export {
    Admin,
    initAdminModel
};
