import { Request, Response } from 'express';

import { createLoginOtpChallenge, createPasswordResetRequest, loginUser, registerOwner, resetPasswordWithToken, revokeSession, verifyLoginOtpChallenge } from '../../services/auth.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { User } from '../../../db/models';
import { createCheckoutToken, verifyCheckoutToken } from '../../services/paddle.service';
import { queueCheckoutLinkEmail } from '../../services/notification.service';
import { env } from '../../../bootstrap/env';

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
        const { name, email, password, checkoutToken } = req.body;
        let planSlug = req.body.planSlug ?? 'solo-starter';

        if (!name || !email || !password)
        {
            return res.status(400).json({ message: 'name, email, and password are required' });
        }

        if (checkoutToken)
        {
            planSlug = await verifyCheckoutToken(String(checkoutToken));
        }

        const user = await registerOwner(name, email, password, planSlug);
        const session = await loginUser(email, password, req.ip, req.header('user-agent') ?? undefined);
        const selectedCheckoutToken = createCheckoutToken(planSlug);
        const checkoutUrl = `${env.appUrl.replace(/\/$/, '')}/checkout?t=${encodeURIComponent(selectedCheckoutToken)}`;
        const planName = String(planSlug).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

        await queueCheckoutLinkEmail(user, checkoutUrl, planName);

        setAuthCookie(res, session.token);

        return res.status(201).json(
            {
                message: 'Account created. Check your email for the checkout link.',
                data:
                {
                    user: serializeUser(user),
                    checkoutLinkSent: true
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

async function passwordResetRequestController(req: Request, res: Response)
{
    const { email } = req.body;

    if (!email)
    {
        return res.status(400).json({ message: 'email is required' });
    }

    await createPasswordResetRequest(String(email), req.ip, req.header('user-agent') ?? undefined);

    return res.json({ message: 'If that email exists, a password reset link has been sent.' });
}

async function passwordResetConfirmController(req: Request, res: Response)
{
    try
    {
        const { token, password } = req.body;

        if (!token || !password)
        {
            return res.status(400).json({ message: 'token and password are required' });
        }

        await resetPasswordWithToken(String(token), String(password));

        return res.json({ message: 'Password reset successful. Sign in with your new password.' });
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Password could not be reset' });
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

export {
    signupController,
    loginController,
    loginOtpController,
    passwordResetRequestController,
    passwordResetConfirmController,
    meController,
    logoutController
};
