import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize
} from 'sequelize';

import { Tenant } from './tenant.model';
import { User } from './user.model';

class TeamInvitation extends Model<InferAttributes<TeamInvitation>, InferCreationAttributes<TeamInvitation>>
{
    declare id: CreationOptional<number>;
    declare tenantId: ForeignKey<Tenant['id']>;
    declare invitedByUserId: ForeignKey<User['id']>;
    declare email: string;
    declare role: CreationOptional<string>;
    declare tokenHash: string;
    declare status: CreationOptional<string>;
    declare expiresAt: Date;
    declare acceptedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

function initTeamInvitationModel(sequelize: Sequelize)
{
    TeamInvitation.init(
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
            invitedByUserId:
            {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false
            },
            email:
            {
                type: DataTypes.STRING(191),
                allowNull: false
            },
            role:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'member'
            },
            tokenHash:
            {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true
            },
            status:
            {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'pending'
            },
            expiresAt:
            {
                type: DataTypes.DATE,
                allowNull: false
            },
            acceptedAt:
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
            tableName: 'team_invitations',
            modelName: 'TeamInvitation',
            timestamps: true
        }
    );

    return TeamInvitation;
}

export {
    TeamInvitation,
    initTeamInvitationModel
};
