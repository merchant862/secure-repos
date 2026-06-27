import crypto from 'crypto';
import { promisify } from 'util';

import { Op } from 'sequelize';
import { afterEach, vi } from 'vitest';

import { LoginOtp, PasswordResetToken, User, UserSession } from '../src/db/models';
import { sequelize } from '../src/db/sequelize';
import { changeUserPassword } from '../src/app/services/auth.service';

const scrypt = promisify(crypto.scrypt);

async function passwordHash(password: string)
{
    const salt = '0123456789abcdef0123456789abcdef';
    const derivedKey = await scrypt(password, salt, 64) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

afterEach(function ()
{
    vi.restoreAllMocks();
});

describe('Authenticated password changes', function ()
{
    it('rejects an incorrect current password without changing account state', async function ()
    {
        const user = { id: 7, password: await passwordHash('CorrectPassword123!'), update: vi.fn() };
        vi.spyOn(User, 'findOne').mockResolvedValue(user as never);
        const transaction = vi.spyOn(sequelize, 'transaction');

        await expect(
            changeUserPassword(7, 91, 'WrongPassword123!', 'DifferentPassword123!')
        ).rejects.toThrow('Current password is incorrect.');
        expect(user.update).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it('updates the password while preserving only the current session', async function ()
    {
        const user = { id: 7, password: await passwordHash('CorrectPassword123!'), update: vi.fn() };
        vi.spyOn(User, 'findOne').mockResolvedValue(user as never);
        vi.spyOn(sequelize, 'transaction').mockImplementation(
            (async (callback: (transaction: object) => Promise<unknown>) => callback({})) as never
        );
        const sessionUpdate = vi.spyOn(UserSession, 'update').mockResolvedValue([2] as never);
        const resetUpdate = vi.spyOn(PasswordResetToken, 'update').mockResolvedValue([1] as never);
        const otpUpdate = vi.spyOn(LoginOtp, 'update').mockResolvedValue([1] as never);

        await changeUserPassword(7, 91, 'CorrectPassword123!', 'DifferentPassword123!');

        expect(user.update).toHaveBeenCalledOnce();
        const sessionWhere = sessionUpdate.mock.calls[0][1]?.where as { id: { [Op.ne]: number } };
        expect(sessionWhere.id[Op.ne]).toBe(91);
        expect(resetUpdate).toHaveBeenCalledOnce();
        expect(otpUpdate).toHaveBeenCalledOnce();
    });
});
