import crypto from 'crypto';

import { afterEach, vi } from 'vitest';

import { CliAccessToken, TenantSubscription } from '../src/db/models';
import {
    authenticateCliAccessToken,
    createCliAccessToken
} from '../src/app/services/cli-access-token.service';

afterEach(function ()
{
    vi.restoreAllMocks();
});

describe('CLI access tokens', function ()
{
    it('enforces a maximum expiry of 30 days', async function ()
    {
        await expect(
            createCliAccessToken(
                {
                    tenantId: 11,
                    userId: 22,
                    name: 'Development laptop',
                    expiresInDays: 31
                }
            )
        ).rejects.toThrow('Token expiry must be between 1 and 30 days');
    });

    it('stores only a hash and returns the secret once', async function ()
    {
        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue({ status: 'active' } as never);
        vi.spyOn(CliAccessToken, 'count').mockResolvedValue(0);
        let storedValues: Record<string, unknown> = {};
        vi.spyOn(CliAccessToken, 'create').mockImplementation(async function (values)
        {
            storedValues = values as unknown as Record<string, unknown>;
            return {
                id: 7,
                ...values,
                lastUsedAt: null,
                revokedAt: null,
                createdAt: new Date(),
                updatedAt: new Date()
            } as never;
        });

        const created = await createCliAccessToken(
            {
                tenantId: 11,
                userId: 22,
                name: 'Development laptop',
                expiresInDays: 7
            }
        );

        expect(created.token).toMatch(/^srp_cli_[A-Za-z0-9_-]+$/);
        expect(storedValues.tokenHash).toBe(crypto.createHash('sha256').update(created.token).digest('hex'));
        expect(storedValues.tokenHash).not.toBe(created.token);
        expect(storedValues.tokenPrefix).toBe(created.token.slice(0, 16));
        expect(storedValues.tokenLastFour).toBe(created.token.slice(-4));
    });

    it('limits each user to one active token', async function ()
    {
        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue({ status: 'active' } as never);
        vi.spyOn(CliAccessToken, 'count').mockResolvedValue(1);
        const create = vi.spyOn(CliAccessToken, 'create');

        await expect(
            createCliAccessToken(
                {
                    tenantId: 11,
                    userId: 22,
                    name: 'CI runner',
                    expiresInDays: 14
                }
            )
        ).rejects.toThrow('Revoke your active CLI token before creating another one');
        expect(create).not.toHaveBeenCalled();
    });

    it('rejects malformed tokens without querying the database', async function ()
    {
        const findOne = vi.spyOn(CliAccessToken, 'findOne');

        await expect(authenticateCliAccessToken('not-a-cli-token')).resolves.toBeNull();
        expect(findOne).not.toHaveBeenCalled();
    });
});
