import { Request, Response } from 'express';

import { acceptInvitation, createLoginOtpChallenge, loginUser, registerOwner, revokeSession, verifyLoginOtpChallenge } from '../../services/auth.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { User } from '../../../db/models';

const authCookieName = process.env.AUTH_COOKIE_NAME && process.env.AUTH_COOKIE_NAME.trim() !== ''
    ? process.env.AUTH_COOKIE_NAME
    : 'security_platform_token';
const authCookieDays = 14;

function setAuthCookie(res: Response, token: string)
{
    res.cookie(authCookieName, token,
        {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: authCookieDays * 24 * 60 * 60 * 1000,
            path: '/'
        });
}

function clearAuthCookie(res: Response)
{
    res.clearCookie(authCookieName,
        {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/'
        });
}

function getCookieValue(req: Request, name: string): string
{
    const cookieHeader = req.header('cookie');

    if (!cookieHeader)
    {
        return '';
    }

    for (const cookie of cookieHeader.split(';'))
    {
        const [rawKey, ...rawValue] = cookie.trim().split('=');

        if (rawKey === name)
        {
            return decodeURIComponent(rawValue.join('='));
        }
    }

    return '';
}

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

        setAuthCookie(res, session.token);

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

        const challenge = await createLoginOtpChallenge(email, password, req.ip, req.header('user-agent') ?? undefined);

        return res.json(
            {
                message: 'Login code sent',
                data:
                {
                    otpRequired: true,
                    challengeId: challenge.challengeId,
                    expiresAt: challenge.expiresAt
                }
            }
        );
    }
    catch (error)
    {
        return res.status(401).json({ message: 'Invalid email or password' });
    }
}

async function loginOtpController(req: Request, res: Response)
{
    try
    {
        const { challengeId, otpCode } = req.body;

        if (!challengeId || !otpCode)
        {
            return res.status(400).json({ message: 'challengeId and otpCode are required' });
        }

        const session = await verifyLoginOtpChallenge(challengeId, otpCode, req.ip, req.header('user-agent') ?? undefined);

        setAuthCookie(res, session.token);

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
        return res.status(401).json({ message: error instanceof Error ? error.message : 'Invalid or expired login code' });
    }
}

function meController(req: AuthenticatedRequest, res: Response)
{
    const session = req.currentSession;

    return res.json(
        {
            data:
            {
                ...serializeUser(req.currentUser),
                session: session
                    ? {
                        id: session.id,
                        createdAt: session.createdAt,
                        expiresAt: session.expiresAt,
                        ipAddress: session.ipAddress,
                        userAgent: session.userAgent
                    }
                    : null
            }
        }
    );
}

async function logoutController(req: Request, res: Response)
{
    const authorization = req.header('authorization');
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    const token = bearerToken || getCookieValue(req, authCookieName);

    if (token)
    {
        await revokeSession(token);
    }

    clearAuthCookie(res);

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

        setAuthCookie(res, session.token);

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
    loginOtpController,
    meController,
    logoutController,
    acceptInvitationController
};
