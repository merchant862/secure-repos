import crypto from 'crypto';
import { promisify } from 'util';

import { Op } from 'sequelize';

import { LoginOtp, NotificationEvent, PricingPlan, TeamInvitation, Tenant, User, UserSession } from '../../db/models';
import { assignTenantPlan } from './plan-limit.service';
import { queueWelcomeOwnerEmail } from './notification.service';

const scrypt = promisify(crypto.scrypt);
const sessionDays = 14;
const loginOtpMinutes = 10;

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

async function registerOwner(name: string, email: string, password: string, planSlug = 'starter')
{
    const existing = await User.findOne({ where: { email } });

    if (existing)
    {
        throw new Error('Email is already registered');
    }

    const tenant = await Tenant.create(
        {
            name,
            slug: `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
        }
    );
    const user = await User.create(
        {
            tenantId: tenant.id,
            name,
            email,
            password: await hashPassword(password),
            role: 'owner',
            status: 'active'
        }
    );
    const pricingPlan = await PricingPlan.findOne({ where: { slug: planSlug, isActive: true } })
        ?? await PricingPlan.findOne({ where: { slug: 'starter' } });

    if (pricingPlan)
    {
        await assignTenantPlan(tenant.id, pricingPlan.id, 'pending');
    }

    await queueWelcomeOwnerEmail(user);

    return user;
}

async function validateLoginCredentials(email: string, password: string)
{
    const user = await User.findOne({ where: { email, status: 'active' } });

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

    if (!otp || otp.codeHash !== hashToken(otpCode))
    {
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

async function createInvitation(tenantId: number, invitedByUserId: number, email: string, role = 'member')
{
    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await TeamInvitation.create(
        {
            tenantId,
            invitedByUserId,
            email,
            role,
            tokenHash: hashToken(token),
            status: 'pending',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
    );

    return {
        token,
        invitation
    };
}

async function acceptInvitation(token: string, name: string, password: string)
{
    const invitation = await TeamInvitation.findOne(
        {
            where:
            {
                tokenHash: hashToken(token),
                status: 'pending',
                expiresAt:
                {
                    [Op.gt]: new Date()
                }
            }
        }
    );

    if (!invitation)
    {
        throw new Error('Invitation is invalid or expired');
    }

    const existingUser = await User.findOne({ where: { email: invitation.email } });
    const user = existingUser
        ? await existingUser.update(
            {
                tenantId: invitation.tenantId,
                name,
                password: await hashPassword(password),
                role: invitation.role,
                status: 'active'
            }
        )
        : await User.create(
            {
                tenantId: invitation.tenantId,
                name,
                email: invitation.email,
                password: await hashPassword(password),
                role: invitation.role,
                status: 'active'
            }
        );

    await invitation.update(
        {
            status: 'accepted',
            acceptedAt: new Date()
        }
    );

    return user;
}

export {
    hashToken,
    registerOwner,
    loginUser,
    resolveSession,
    revokeSession,
    createInvitation,
    acceptInvitation,
    createLoginOtpChallenge,
    verifyLoginOtpChallenge
};
