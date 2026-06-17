import { Request, Response } from 'express';

import { Admin } from '../../../db/models';
import { AuthenticatedAdminRequest } from '../../middlewares/admin-api-auth.middleware';
import { loginAdmin, revokeAdminSession } from '../../services/admin-auth.service';

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
    adminLoginController,
    adminMeController,
    adminLogoutController
};
