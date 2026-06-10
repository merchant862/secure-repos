import { Request, Response } from 'express';

import { acceptInvitation, loginUser, registerOwner, revokeSession } from '../../services/auth.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { User } from '../../../db/models';

function serializeUser(user: User | undefined)
{
    if (!user)
    {
        return null;
    }

    return {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
    };
}

async function signupController(req: Request, res: Response)
{
    try
    {
        const { name, email, password, planSlug } = req.body;

        if (!name || !email || !password)
        {
            return res.status(400).json({ message: 'name, email, and password are required' });
        }

        const user = await registerOwner(name, email, password, planSlug ?? 'starter');
        const session = await loginUser(email, password, req.ip, req.header('user-agent') ?? undefined);

        return res.status(201).json(
            {
                message: 'Account created',
                data:
                {
                    token: session.token,
                    user: serializeUser(user)
                }
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Signup failed' });
    }
}

async function loginController(req: Request, res: Response)
{
    try
    {
        const { email, password } = req.body;

        if (!email || !password)
        {
            return res.status(400).json({ message: 'email and password are required' });
        }

        const session = await loginUser(email, password, req.ip, req.header('user-agent') ?? undefined);

        return res.json(
            {
                message: 'Logged in',
                data:
                {
                    token: session.token,
                    expiresAt: session.session.expiresAt
                }
            }
        );
    }
    catch (error)
    {
        return res.status(401).json({ message: 'Invalid email or password' });
    }
}

function meController(req: AuthenticatedRequest, res: Response)
{
    return res.json(
        {
            data: serializeUser(req.currentUser)
        }
    );
}

async function logoutController(req: Request, res: Response)
{
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

    if (token)
    {
        await revokeSession(token);
    }

    return res.json({ message: 'Logged out' });
}

async function acceptInvitationController(req: Request, res: Response)
{
    try
    {
        const { token, name, password } = req.body;

        if (!token || !name || !password)
        {
            return res.status(400).json({ message: 'token, name, and password are required' });
        }

        const user = await acceptInvitation(token, name, password);
        const session = await loginUser(user.email, password, req.ip, req.header('user-agent') ?? undefined);

        return res.json(
            {
                message: 'Invitation accepted',
                data:
                {
                    token: session.token,
                    user: serializeUser(user)
                }
            }
        );
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Invitation could not be accepted' });
    }
}

export {
    signupController,
    loginController,
    meController,
    logoutController,
    acceptInvitationController
};
