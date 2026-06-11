import { Request, Response } from 'express';

import { Admin } from '../../../db/models';
import { env } from '../../../bootstrap/env';
import { AuthenticatedAdminRequest } from '../../middlewares/admin-api-auth.middleware';
import { createAdmin, loginAdmin, revokeAdminSession } from '../../services/admin-auth.service';

function serializeAdmin(admin: Admin | undefined)
{
    if (!admin)
    {
        return null;
    }

    return {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status
    };
}

async function bootstrapAdminController(req: Request, res: Response)
{
    const setupToken = req.header('x-admin-setup-token') || req.body.setupToken;

    if (!env.adminApiToken || setupToken !== env.adminApiToken)
    {
        return res.status(401).json({ message: 'Invalid admin setup token' });
    }

    const adminCount = await Admin.count();

    if (adminCount > 0)
    {
        return res.status(409).json({ message: 'Admin already exists' });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password)
    {
        return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const admin = await createAdmin({ name, email, password, role: 'super_admin' });

    return res.status(201).json(
        {
            message: 'Admin created',
            data: serializeAdmin(admin)
        }
    );
}

async function adminLoginController(req: Request, res: Response)
{
    try
    {
        const { email, password } = req.body;

        if (!email || !password)
        {
            return res.status(400).json({ message: 'email and password are required' });
        }

        const session = await loginAdmin(email, password, req.ip, req.header('user-agent') ?? undefined);

        return res.json(
            {
                message: 'Admin logged in',
                data:
                {
                    token: session.token,
                    expiresAt: session.session.expiresAt,
                    admin: serializeAdmin(session.admin)
                }
            }
        );
    }
    catch (error)
    {
        return res.status(401).json({ message: 'Invalid email or password' });
    }
}

function adminMeController(req: AuthenticatedAdminRequest, res: Response)
{
    return res.json({ data: serializeAdmin(req.currentAdmin) });
}

async function adminLogoutController(req: Request, res: Response)
{
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

    if (token)
    {
        await revokeAdminSession(token);
    }

    return res.json({ message: 'Admin logged out' });
}

export {
    bootstrapAdminController,
    adminLoginController,
    adminMeController,
    adminLogoutController
};
