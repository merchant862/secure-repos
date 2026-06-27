import crypto from 'crypto';
import { promisify } from 'util';

import { Op } from 'sequelize';

import { LoginOtp, NotificationEvent, PasswordResetToken, PricingPlan, Tenant, TenantSubscription, User, UserSession } from '../../db/models';
import { sequelize } from '../../db/sequelize';
import { queueWelcomeOwnerEmail } from './notification.service';
import { env } from '../../bootstrap/env';

const scrypt = promisify(crypto.scrypt);
const sessionDays = 14;
const loginOtpMinutes = 10;
const loginOtpMaxAttempts = 5;
const loginOtpResendCooldownMs = 60 * 1000;
const passwordResetMinutes = 30;

function normalizeEmail(email: string): string
{
    return email.trim().toLowerCase();
}

function validateAccountInput(name: string, email: string, password: string)
{
    if (name.trim().length < 2 || name.trim().length > 100)
    {
        throw new Error('Name must be between 2 and 100 characters');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    {
        throw new Error('Enter a valid email address');
    }

    if (password.length < 12 || password.length > 128)
    {
        throw new Error('Password must be between 12 and 128 characters');
    }
}

function hashToken(token: string): string
{
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string): Promise<string>
{
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64) as Buffer;

    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, hashedPassword: string | null): Promise<boolean>
{
    if (!hashedPassword)
    {
        return false;
    }

    const [algorithm, salt, storedHash] = hashedPassword.split(':');

    if (algorithm !== 'scrypt' || !salt || !storedHash)
    {
        return false;
    }

    const derivedKey = await scrypt(password, salt, 64) as Buffer;
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (derivedKey.length !== storedBuffer.length)
    {
        return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedBuffer);
}

async function createSession(user: User, ipAddress?: string, userAgent?: string)
{
    const token = crypto.randomBytes(32).toString('hex');
    const session = await UserSession.create(
        {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000),
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null
        }
    );

    return {
        token,
        session
    };
}

async function registerOwner(name: string, email: string, password: string, planSlug = 'solo-starter')
{
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = name.trim();
    validateAccountInput(normalizedName, normalizedEmail, password);
    const existing = await User.findOne({ where: { email: normalizedEmail } });

    if (existing)
    {
        throw new Error('Email is already registered');
    }

    const pricingPlan = await PricingPlan.findOne({ where: { slug: planSlug, isActive: true } })
        ?? await PricingPlan.findOne({ where: { isActive: true }, order: [['sortOrder', 'ASC']] });

    if (!pricingPlan)
    {
        throw new Error('No active pricing plan is available');
    }

    const passwordHash = await hashPassword(password);
    const user = await sequelize.transaction(async function (transaction)
    {
        const tenant = await Tenant.create(
            {
                name: normalizedName,
                slug: `${normalizedEmail.split('@')[0].replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
            },
            { transaction }
        );
        const createdUser = await User.create(
            {
                tenantId: tenant.id,
                name: normalizedName,
                email: normalizedEmail,
                password: passwordHash,
                role: 'owner',
                status: 'active'
            },
            { transaction }
        );

        await TenantSubscription.create(
            { tenantId: tenant.id, pricingPlanId: pricingPlan.id, status: 'pending' },
            { transaction }
        );

        return createdUser;
    });

    await queueWelcomeOwnerEmail(user);

    return user;
}

async function validateLoginCredentials(email: string, password: string)
{
    const user = await User.findOne({ where: { email: normalizeEmail(email), status: 'active' } });

    if (!user || !(await verifyPassword(password, user.password ?? null)))
    {
        throw new Error('Invalid email or password');
    }

    return user;
}

async function loginUser(email: string, password: string, ipAddress?: string, userAgent?: string)
{
    const user = await validateLoginCredentials(email, password);

    return createSession(user, ipAddress, userAgent);
}

function generateOtpCode()
{
    return String(crypto.randomInt(100000, 1000000));
}

async function createLoginOtpChallenge(email: string, password: string, ipAddress?: string, userAgent?: string)
{
    const user = await validateLoginCredentials(email, password);
    const recentOtp = await LoginOtp.findOne(
        { where: { userId: user.id, usedAt: null }, order: [['createdAt', 'DESC']] }
    );

    if (recentOtp && recentOtp.createdAt.getTime() > Date.now() - loginOtpResendCooldownMs)
    {
        throw new Error('A login code was already sent. Wait before requesting another.');
    }

    await LoginOtp.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } });
    const otpCode = generateOtpCode();
    const challengeId = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + loginOtpMinutes * 60 * 1000);
    const otp = await LoginOtp.create(
        {
            userId: user.id,
            challengeId,
            codeHash: hashToken(otpCode),
            expiresAt,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null
        }
    );

    await NotificationEvent.create(
        {
            tenantId: user.tenantId,
            type: 'login_otp',
            channel: 'email',
            status: 'queued',
            subject: 'Your SecureRepos login code',
            payload:
            {
                recipients: [user.email],
                email: user.email,
                name: user.name,
                otpCode,
                expiresMinutes: loginOtpMinutes,
                ipAddress: ipAddress ?? null
            }
        }
    );

    return {
        challengeId: otp.challengeId,
        expiresAt: otp.expiresAt
    };
}

async function verifyLoginOtpChallenge(challengeId: string, otpCode: string, ipAddress?: string, userAgent?: string)
{
    const otp = await LoginOtp.findOne(
        {
            where:
            {
                challengeId,
                usedAt: null,
                expiresAt:
                {
                    [Op.gt]: new Date()
                }
            },
            include:
            [
                {
                    model: User,
                    as: 'user'
                }
            ]
        }
    );

    if (!otp || otp.attemptCount >= loginOtpMaxAttempts)
    {
        throw new Error('Invalid or expired login code');
    }

    const providedHash = Buffer.from(hashToken(otpCode));
    const expectedHash = Buffer.from(otp.codeHash);
    const matches = providedHash.length === expectedHash.length && crypto.timingSafeEqual(providedHash, expectedHash);

    if (!matches)
    {
        const attemptCount = otp.attemptCount + 1;
        await otp.update(
            {
                attemptCount,
                lastAttemptAt: new Date(),
                usedAt: attemptCount >= loginOtpMaxAttempts ? new Date() : null
            }
        );
        throw new Error('Invalid or expired login code');
    }

    await otp.update({ usedAt: new Date() });

    const user = otp.get('user') as User | undefined ?? await User.findByPk(otp.userId);

    if (!user || user.status !== 'active')
    {
        throw new Error('Invalid or expired login code');
    }

    return createSession(user, ipAddress, userAgent);
}

async function createPasswordResetRequest(email: string, ipAddress?: string, userAgent?: string)
{
    const user = await User.findOne({ where: { email: normalizeEmail(email), status: 'active' } });

    if (!user)
    {
        return null;
    }

    await PasswordResetToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } });

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + passwordResetMinutes * 60 * 1000);
    await PasswordResetToken.create(
        {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null
        }
    );

    const resetUrl = `${env.appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await NotificationEvent.create(
        {
            tenantId: user.tenantId,
            type: 'password_reset',
            channel: 'email',
            status: 'queued',
            subject: 'Reset your SecureRepos password',
            payload:
            {
                recipients: [user.email],
                email: user.email,
                name: user.name,
                resetUrl,
                expiresMinutes: passwordResetMinutes
            }
        }
    );

    return { expiresAt };
}

async function resetPasswordWithToken(token: string, password: string)
{
    if (password.length < 12 || password.length > 128)
    {
        throw new Error('Password must be between 12 and 128 characters');
    }

    const resetToken = await PasswordResetToken.findOne(
        {
            where:
            {
                tokenHash: hashToken(token),
                usedAt: null,
                expiresAt:
                {
                    [Op.gt]: new Date()
                }
            },
            include:
            [
                {
                    model: User,
                    as: 'user'
                }
            ]
        }
    );

    if (!resetToken)
    {
        throw new Error('Invalid or expired reset link');
    }

    const user = resetToken.get('user') as User | undefined ?? await User.findByPk(resetToken.userId);

    if (!user || user.status !== 'active')
    {
        throw new Error('Invalid or expired reset link');
    }

    await sequelize.transaction(async function (transaction)
    {
        await user.update({ password: await hashPassword(password) }, { transaction });
        await resetToken.update({ usedAt: new Date() }, { transaction });
        await UserSession.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null }, transaction });
    });
}

async function changeUserPassword(userId: number, currentSessionId: number, currentPassword: string, newPassword: string)
{
    if (newPassword.length < 12 || newPassword.length > 128)
    {
        throw new Error('New password must be between 12 and 128 characters.');
    }

    const user = await User.findOne({ where: { id: userId, status: 'active' } });

    if (!user || !(await verifyPassword(currentPassword, user.password ?? null)))
    {
        throw new Error('Current password is incorrect.');
    }

    if (currentPassword === newPassword)
    {
        throw new Error('New password must be different from the current password.');
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await sequelize.transaction(async function (transaction)
    {
        await user.update({ password: passwordHash }, { transaction });
        await UserSession.update(
            { revokedAt: now },
            {
                where:
                {
                    userId: user.id,
                    id: { [Op.ne]: currentSessionId },
                    revokedAt: null
                },
                transaction
            }
        );
        await PasswordResetToken.update(
            { usedAt: now },
            { where: { userId: user.id, usedAt: null }, transaction }
        );
        await LoginOtp.update(
            { usedAt: now },
            { where: { userId: user.id, usedAt: null }, transaction }
        );
    });
}

async function resolveSession(token: string)
{
    const session = await UserSession.findOne(
        {
            where:
            {
                tokenHash: hashToken(token),
                revokedAt: null,
                expiresAt:
                {
                    [Op.gt]: new Date()
                }
            },
            include:
            [
                {
                    model: User,
                    as: 'user',
                    include:
                    [
                        {
                            model: Tenant,
                            as: 'tenant'
                        }
                    ]
                }
            ]
        }
    );

    if (!session)
    {
        return null;
    }

    return {
        session,
        user: session.get('user') as User
    };
}

async function revokeSession(token: string)
{
    await UserSession.update(
        {
            revokedAt: new Date()
        },
        {
            where:
            {
                tokenHash: hashToken(token),
                revokedAt: null
            }
        }
    );
}

export {
    hashToken,
    registerOwner,
    loginUser,
    resolveSession,
    revokeSession,
    createLoginOtpChallenge,
    verifyLoginOtpChallenge,
    createPasswordResetRequest,
    resetPasswordWithToken,
    changeUserPassword
};
