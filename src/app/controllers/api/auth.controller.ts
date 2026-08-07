import { Request, Response } from 'express';

import { buildGithubOauthLoginUrl, changeUserPassword, createEmailVerificationRequest, createLoginOtpChallenge, createPasswordResetRequest, loginWithGithubOAuth, registerOwner, resetPasswordWithToken, revokeSession, verifyEmailWithToken, verifyLoginOtpChallenge } from '../../services/auth.service';
import { AuthenticatedRequest } from '../../middlewares/user-auth.middleware';
import { CodeHostConnection, TenantSubscription, User } from '../../../db/models';
import { verifyCheckoutToken } from '../../services/paddle.service';
import { recordAuditLog } from '../../services/audit.service';

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
        return res.status(201).json(
            {
                message: 'Account created. Check your email to verify your address.',
                data:
                {
                    user: serializeUser(user),
                    verificationRequired: true
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
        const message = error instanceof Error ? error.message : '';
        return res.status(message === 'Verify your email before signing in' ? 403 : 401).json(
            { message: message === 'Verify your email before signing in' ? message : 'Invalid email or password' }
        );
    }
}

async function verifyEmailController(req: Request, res: Response)
{
    const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;

    if (typeof token !== 'string' || token.trim() === '')
    {
        return res.redirect('/sign-in?verification=invalid');
    }

    try
    {
        await verifyEmailWithToken(token);
        return res.redirect('/sign-in?verification=success');
    }
    catch (error)
    {
        return res.redirect('/sign-in?verification=invalid');
    }
}

async function resendEmailVerificationController(req: Request, res: Response)
{
    const email = typeof req.body?.email === 'string' ? req.body.email : '';

    if (!email)
    {
        return res.status(400).json({ message: 'email is required' });
    }

    await createEmailVerificationRequest(email);

    return res.json({ message: 'If the account is awaiting verification, a new link has been sent.' });
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
        const user = await User.findByPk(session.session.userId);
        const [subscription, githubConnection] = user
            ? await Promise.all(
                [
                    TenantSubscription.findOne({ where: { tenantId: user.tenantId } }),
                    CodeHostConnection.findOne({ where: { tenantId: user.tenantId, provider: 'github', isActive: true } })
                ]
            )
            : [null, null];
        const onboardingRequired = !subscription
            || !['active', 'trialing'].includes(subscription.status)
            || !githubConnection;

        setAuthCookie(res, session.token);

        return res.json(
            {
                message: 'Logged in',
                data:
                {
                    expiresAt: session.session.expiresAt,
                    redirectTo: onboardingRequired ? '/onboarding' : '/dashboard'
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

function githubLoginStartController(_req: Request, res: Response)
{
    return res.redirect(buildGithubOauthLoginUrl());
}

async function githubLoginCallbackController(req: Request, res: Response)
{
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    try
    {
        if (!code || !state)
        {
            throw new Error('GitHub login was cancelled or incomplete');
        }

        const session = await loginWithGithubOAuth(code, state, req.ip, req.header('user-agent') ?? undefined);
        const user = await User.findByPk(session.session.userId);
        const [subscription, githubConnection] = user
            ? await Promise.all(
                [
                    TenantSubscription.findOne({ where: { tenantId: user.tenantId } }),
                    CodeHostConnection.findOne({ where: { tenantId: user.tenantId, provider: 'github', isActive: true } })
                ]
            )
            : [null, null];
        const onboardingRequired = !subscription
            || !['active', 'trialing'].includes(subscription.status)
            || !githubConnection;

        setAuthCookie(res, session.token);
        return res.redirect(onboardingRequired ? '/onboarding' : '/dashboard');
    }
    catch (error)
    {
        return res.redirect(`/sign-in?github=${encodeURIComponent(error instanceof Error ? error.message : 'GitHub login failed')}`);
    }
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

async function changePasswordController(req: AuthenticatedRequest, res: Response)
{
    try
    {
        const user = req.currentUser;
        const session = req.currentSession;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!user || !session)
        {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string')
        {
            return res.status(400).json({ message: 'All password fields are required.' });
        }

        if (newPassword !== confirmPassword)
        {
            return res.status(400).json({ message: 'New password and confirmation do not match.' });
        }

        await changeUserPassword(user.id, session.id, currentPassword, newPassword);
        await recordAuditLog(
            {
                tenantId: user.tenantId,
                userId: user.id,
                action: 'user.password.changed',
                entityType: 'user',
                entityId: String(user.id)
            }
        ).catch((error) => console.warn('Password change audit log failed:', error));

        return res.json({ message: 'Password updated. Other sessions have been signed out.' });
    }
    catch (error)
    {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Password could not be updated.' });
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
    verifyEmailController,
    resendEmailVerificationController,
    loginController,
    loginOtpController,
    githubLoginStartController,
    githubLoginCallbackController,
    passwordResetRequestController,
    passwordResetConfirmController,
    changePasswordController,
    meController,
    logoutController
};
