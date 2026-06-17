import crypto from 'crypto';
import { promisify } from 'util';

import { Op } from 'sequelize';

import { Admin, AdminSession } from '../../db/models';

const scrypt = promisify(crypto.scrypt);
const adminSessionDays = 7;

function hashToken(token: string): string
{
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function hashAdminPassword(password: string): Promise<string>
{
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64) as Buffer;

    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyAdminPassword(password: string, hashedPassword: string): Promise<boolean>
{
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

async function seedAdmin(input: { name: string; email: string; password: string; role?: string; status?: string; updateExisting?: boolean })
{
    const existing = await Admin.findOne({ where: { email: input.email } });
    const values =
    {
        name: input.name,
        email: input.email,
        password: await hashAdminPassword(input.password),
        role: input.role ?? 'super_admin',
        status: input.status ?? 'active'
    };

    if (existing)
    {
        if (!input.updateExisting)
        {
            throw new Error('Admin email already exists. Pass --update to update this admin.');
        }

        await existing.update(values);
        return {
            admin: existing,
            created: false
        };
    }

    const admin = await Admin.create(values);

    return {
        admin,
        created: true
    };
}

async function loginAdmin(email: string, password: string, ipAddress?: string, userAgent?: string)
{
    const admin = await Admin.findOne({ where: { email, status: 'active' } });

    if (!admin || !(await verifyAdminPassword(password, admin.password)))
    {
        throw new Error('Invalid email or password');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = await AdminSession.create(
        {
            adminId: admin.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + adminSessionDays * 24 * 60 * 60 * 1000),
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null
        }
    );

    await admin.update({ lastLoginAt: new Date() });

    return {
        token,
        session,
        admin
    };
}

async function resolveAdminSession(token: string)
{
    const session = await AdminSession.findOne(
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
                    model: Admin,
                    as: 'admin'
                }
            ]
        }
    );

    if (!session)
    {
        return null;
    }

    const admin = session.get('admin') as Admin | undefined;

    if (!admin || admin.status !== 'active')
    {
        return null;
    }

    return {
        session,
        admin
    };
}

async function revokeAdminSession(token: string)
{
    await AdminSession.update(
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
    seedAdmin,
    loginAdmin,
    resolveAdminSession,
    revokeAdminSession
};
