import { afterEach, describe, expect, it, vi } from 'vitest';

import { PricingPlan, Repository, Scan, TenantSubscription } from '../src/db/models';
import { assertManualScanAllowed, assertRepositoryLimitAvailable } from '../src/app/services/plan-limit.service';

describe('Security Preview entitlements', function ()
{
    afterEach(function ()
    {
        vi.restoreAllMocks();
    });

    it('allows exactly one preview scan while the subscription is trialing', async function ()
    {
        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue({ status: 'trialing' } as never);
        vi.spyOn(Scan, 'findOne').mockResolvedValue(null);
        vi.spyOn(Scan, 'count').mockResolvedValueOnce(0).mockResolvedValueOnce(1);

        await expect(assertManualScanAllowed(10, 20)).resolves.toBe('preview');
        await expect(assertManualScanAllowed(10, 20)).rejects.toThrow('includes one scan');
    });

    it('caps a trialing workspace at one repository regardless of the paid plan limit', async function ()
    {
        const plan = { name: 'Solo', repositoryLimit: 10 } as PricingPlan;
        const subscription = { status: 'trialing', get: () => plan } as never;

        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue(subscription);
        vi.spyOn(Repository, 'findOne').mockResolvedValue(null);
        vi.spyOn(Repository, 'count').mockResolvedValue(1);

        await expect(assertRepositoryLimitAvailable(10, 'github', '200')).rejects.toThrow(
            'Security Preview is limited to one repository'
        );
    });
});
