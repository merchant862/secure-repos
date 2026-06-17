import { Response } from 'express';

import { Admin } from '../../../db/models';
import { AuthenticatedAdminRequest } from '../../middlewares/admin-api-auth.middleware';

function serializeAdmin(admin: Admin)
{
    return {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
    };
}

async function listAdminsController(req: AuthenticatedAdminRequest, res: Response)
{
    const admins = await Admin.findAll({ order: [['createdAt', 'DESC']] });

    return res.json({ data: admins.map(serializeAdmin) });
}

async function updateAdminController(req: AuthenticatedAdminRequest, res: Response)
{
    const adminId = Number(req.params.adminId);

    if (!Number.isFinite(adminId))
    {
        return res.status(400).json({ message: 'Invalid admin id' });
    }

    const admin = await Admin.findByPk(adminId);

    if (!admin)
    {
        return res.status(404).json({ message: 'Admin not found' });
    }

    await admin.update(
        {
            name: typeof req.body.name === 'string' ? req.body.name : admin.name,
            role: typeof req.body.role === 'string' ? req.body.role : admin.role,
            status: typeof req.body.status === 'string' ? req.body.status : admin.status
        }
    );

    return res.json(
        {
            message: 'Admin updated',
            data: serializeAdmin(admin)
        }
    );
}

export {
    listAdminsController,
    updateAdminController
};
