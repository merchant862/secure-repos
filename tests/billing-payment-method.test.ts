import { afterEach, vi } from 'vitest';

const paddleMocks = vi.hoisted(() => (
    {
        createPaymentMethodUpdateUrl: vi.fn()
    }
));

vi.mock('../src/app/services/paddle.service', async function (importOriginal)
{
    const actual = await importOriginal<typeof import('../src/app/services/paddle.service')>();

    return {
        ...actual,
        createPaddlePaymentMethodUpdateUrl: paddleMocks.createPaymentMethodUpdateUrl
    };
});

import { TenantSubscription, AuditLog } from '../src/db/models';
import { createTenantPaymentMethodUpdateLink } from '../src/app/services/billing.service';

afterEach(function ()
{
    vi.restoreAllMocks();
    paddleMocks.createPaymentMethodUpdateUrl.mockReset();
});

describe('Billing payment method updates', function ()
{
    it('blocks repeated update links for active subscriptions inside the cooldown window', async function ()
    {
        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue(
            {
                id: 12,
                tenantId: 91,
                status: 'active',
                provider: 'paddle',
                providerSubscriptionId: 'sub_123',
                lastPaymentMethodUpdateLinkAt: new Date(Date.now() - 60 * 60 * 1000)
            } as never
        );

        await expect(
            createTenantPaymentMethodUpdateLink({ tenantId: 91, userId: 7 })
        ).rejects.toThrow('Payment method updates are limited to once every 24 hours.');
        expect(paddleMocks.createPaymentMethodUpdateUrl).not.toHaveBeenCalled();
    });

    it('allows past due subscriptions to create a hosted update link despite the cooldown', async function ()
    {
        const subscription = {
            id: 12,
            tenantId: 91,
            status: 'past_due',
            provider: 'paddle',
            providerSubscriptionId: 'sub_123',
            lastPaymentMethodUpdateLinkAt: new Date(),
            update: vi.fn()
        };
        vi.spyOn(TenantSubscription, 'findOne').mockResolvedValue(subscription as never);
        vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
        paddleMocks.createPaymentMethodUpdateUrl.mockResolvedValue(
            {
                url: 'https://checkout.paddle.test/update-payment-method',
                transactionId: 'txn_123'
            }
        );

        const result = await createTenantPaymentMethodUpdateLink({ tenantId: 91, userId: 7, ipAddress: '127.0.0.1' });

        expect(result.url).toBe('https://checkout.paddle.test/update-payment-method');
        expect(result.restrictedUntil).toBeNull();
        expect(subscription.update).toHaveBeenCalledOnce();
        expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining(
            {
                action: 'billing.payment_method_update_link.created',
                metadata: expect.objectContaining(
                    {
                        bypassedCooldown: true,
                        transactionId: 'txn_123'
                    }
                )
            }
        ));
    });
});
