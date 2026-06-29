import { afterEach, vi } from 'vitest';

const planMocks = vi.hoisted(() => (
    {
        getTenantPlan: vi.fn()
    }
));
const notificationMocks = vi.hoisted(() => (
    {
        createTenantNotification: vi.fn()
    }
));

vi.mock('../src/app/services/plan-limit.service', async function (importOriginal)
{
    const actual = await importOriginal<typeof import('../src/app/services/plan-limit.service')>();
    return { ...actual, getTenantPlan: planMocks.getTenantPlan };
});

vi.mock('../src/app/services/in-app-notification.service', async function (importOriginal)
{
    const actual = await importOriginal<typeof import('../src/app/services/in-app-notification.service')>();
    return { ...actual, createTenantNotification: notificationMocks.createTenantNotification };
});

import { NotificationEvent, User } from '../src/db/models';
import { queueSecurityAlert } from '../src/app/services/notification.service';

const highFinding =
{
    ruleId: 'secret.example',
    severity: 'high' as const,
    title: 'High severity finding',
    description: 'A high severity issue was detected.',
    remediation: 'Remove the affected value.',
    filePath: 'src/index.js',
    lineNumber: 4,
    fingerprint: 'a'.repeat(64)
};

afterEach(function ()
{
    vi.restoreAllMocks();
    planMocks.getTenantPlan.mockReset();
    notificationMocks.createTenantNotification.mockReset();
});

describe('CLI-compatible security email policy', function ()
{
    it('does not email high findings on the starter plan', async function ()
    {
        planMocks.getTenantPlan.mockResolvedValue({ slug: 'solo-starter' });
        const emailCreate = vi.spyOn(NotificationEvent, 'create');

        await expect(queueSecurityAlert(3, 'owner/repo', [highFinding])).resolves.toBeNull();
        expect(emailCreate).not.toHaveBeenCalled();
    });

    it('queues high finding email alerts on the pro plan', async function ()
    {
        planMocks.getTenantPlan.mockResolvedValue({ slug: 'solo-pro' });
        notificationMocks.createTenantNotification.mockResolvedValue({});
        vi.spyOn(User, 'findOne').mockResolvedValue({ email: 'owner@example.com' } as never);
        const emailCreate = vi.spyOn(NotificationEvent, 'create').mockResolvedValue({} as never);

        await queueSecurityAlert(3, 'owner/repo', [highFinding]);

        expect(emailCreate).toHaveBeenCalledWith(
            expect.objectContaining(
                {
                    tenantId: 3,
                    type: 'security_alert',
                    payload: expect.objectContaining(
                        {
                            recipients: ['owner@example.com'],
                            findings: [expect.objectContaining({ severity: 'high' })]
                        }
                    )
                }
            )
        );
    });
});
