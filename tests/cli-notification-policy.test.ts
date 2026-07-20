import { afterEach, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => (
    {
        createTenantNotification: vi.fn()
    }
));

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
    notificationMocks.createTenantNotification.mockReset();
});

describe('CLI-compatible security email policy', function ()
{
    it('queues high finding email alerts for the single package', async function ()
    {
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
