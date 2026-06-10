import { DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, Model, Sequelize } from 'sequelize';
import { Tenant } from './tenant.model';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare name: string;
    declare email: string;
    declare password: CreationOptional<string | null>;
    declare role: CreationOptional<string>;
    declare status: CreationOptional<string>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initUserModel(sequelize: Sequelize)
{
    User.init(
        {
            id:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            tenantId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
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
                allowNull: true
            },
            role:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'member'
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'active'
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
            tableName: 'users',
            modelName: 'User',
            timestamps: true
        }
    );

    return User;
}

export 
{
    User,
    initUserModel
};
