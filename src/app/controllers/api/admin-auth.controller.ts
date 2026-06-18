import { Request, Response } from 'express';

import { Admin } from '../../../db/models';
import { AuthenticatedAdminRequest, adminCookieName, getCookieValue } from '../../middlewares/admin-api-auth.middleware';
import { changeAdminPassword, loginAdmin, revokeAdminSession } from '../../services/admin-auth.service';

const adminCookieOptions =
{
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
};

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
        res.cookie(adminCookieName, session.token, { ...adminCookieOptions, maxAge: 12 * 60 * 60 * 1000 });

        return res.json(
            {
                message: 'Admin logged in',
                data:
                {
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
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : getCookieValue(req, adminCookieName);

    if (token)
    {
        await revokeAdminSession(token);
    }

    res.clearCookie(adminCookieName, adminCookieOptions);

    return res.json({ message: 'Admin logged out' });
}

async function adminChangePasswordController(req: AuthenticatedAdminRequest, res: Response)
{
    try
    {
        const { currentPassword, newPassword } = req.body;

        if (!req.currentAdmin)
        {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!currentPassword || !newPassword)
        {
            return res.status(400).json({ message: 'currentPassword and newPassword are required' });
        }

        await changeAdminPassword(req.currentAdmin.id, currentPassword, newPassword);
        res.clearCookie(adminCookieName, adminCookieOptions);

        return res.json({ message: 'Admin password updated' });
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Password could not be updated' });
    }
}

export {
    adminLoginController,
    adminMeController,
    adminLogoutController,
    adminChangePasswordController
};
