import { Response } from 'express';

import { TeamInvitation, User } from '../../../db/models';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { createInvitation } from '../../services/auth.service';
import { getTenantPlan } from '../../services/plan-limit.service';
import { NotificationEvent } from '../../../db/models';
import { recordAuditLog } from '../../services/audit.service';

async function listTeamMembersController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const members = await User.findAll(
        {
            where:
            {
                tenantId: user.tenantId
            },
            attributes: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'ASC']]
        }
    );

    return res.json({ data: members });
}

async function inviteTeamMemberController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { email, role } = req.body;

    if (!email)
    {
        return res.status(400).json({ message: 'email is required' });
    }

    const plan = await getTenantPlan(user.tenantId);
    const memberCount = await User.count({ where: { tenantId: user.tenantId, status: 'active' } });

    if (plan?.teamMemberLimit !== null && plan?.teamMemberLimit !== undefined && memberCount >= plan.teamMemberLimit)
    {
        return res.status(402).json(
            {
                message: `Team member limit reached for ${plan.name} plan (${plan.teamMemberLimit} members)`
            }
        );
    }

    const invitation = await createInvitation(user.tenantId, user.id, email, role ?? 'member');

    await NotificationEvent.create(
        {
            tenantId: user.tenantId,
            type: 'team_invitation',
            channel: 'email',
            status: 'queued',
            subject: 'You have been invited to join a security workspace',
            payload:
            {
                email,
                inviteToken: invitation.token,
                invitedBy: user.email
            }
        }
    );
    await recordAuditLog(
        {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'team.invitation_created',
            entityType: 'team_invitation',
            entityId: String(invitation.invitation.id),
            metadata: { email, role: role ?? 'member' }
        }
    );

    return res.status(201).json(
        {
            message: 'Invitation created',
            data:
            {
                invitation: invitation.invitation,
                inviteToken: invitation.token
            }
        }
    );
}

async function listTeamInvitationsController(req: AuthenticatedRequest, res: Response)
{
    const user = req.currentUser;

    if (!user)
    {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const invitations = await TeamInvitation.findAll(
        {
            where:
            {
                tenantId: user.tenantId
            },
            order: [['createdAt', 'DESC']]
        }
    );

    return res.json({ data: invitations });
}

export {
    listTeamMembersController,
    inviteTeamMemberController,
    listTeamInvitationsController
};
