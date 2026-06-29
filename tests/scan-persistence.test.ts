import { afterEach, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => (
    {
        queueSecurityAlert: vi.fn(),
        queueScanSummaryEmail: vi.fn()
    }
));
const postureMocks = vi.hoisted(() => (
    {
        refreshRepositorySecurityScore: vi.fn()
    }
));

vi.mock('../src/app/services/notification.service', async function (importOriginal)
{
    const actual = await importOriginal<typeof import('../src/app/services/notification.service')>();

    return {
        ...actual,
        queueSecurityAlert: notificationMocks.queueSecurityAlert,
        queueScanSummaryEmail: notificationMocks.queueScanSummaryEmail
    };
});

vi.mock('../src/app/services/security-posture.service', async function (importOriginal)
{
    const actual = await importOriginal<typeof import('../src/app/services/security-posture.service')>();

    return {
        ...actual,
        refreshRepositorySecurityScore: postureMocks.refreshRepositorySecurityScore
    };
});

import { Finding, FindingOccurrence } from '../src/db/models';
import { completeScanWithFindings } from '../src/app/services/scan.service';

afterEach(function ()
{
    vi.restoreAllMocks();
    notificationMocks.queueSecurityAlert.mockReset();
    notificationMocks.queueScanSummaryEmail.mockReset();
    postureMocks.refreshRepositorySecurityScore.mockReset();
});

describe('Scan finding persistence', function ()
{
    it('does not alert again for an unchanged open finding', async function ()
    {
        notificationMocks.queueSecurityAlert.mockResolvedValue(null);
        const finding = {
            id: 40,
            fingerprint: 'a'.repeat(64),
            status: 'open',
            branch: 'main',
            severity: 'critical',
            ruleId: 'secret.github-token',
            title: 'Possible GitHub token exposed',
            description: 'A sensitive credential pattern was found.',
            remediation: 'Rotate the token.',
            filePath: 'src/index.js',
            lineNumber: 2
        };
        vi.spyOn(Finding, 'findAll')
            .mockResolvedValueOnce([finding] as never)
            .mockResolvedValueOnce([finding] as never);
        vi.spyOn(Finding, 'update').mockResolvedValue([1] as never);
        vi.spyOn(Finding, 'bulkCreate').mockResolvedValue([] as never);
        vi.spyOn(FindingOccurrence, 'bulkCreate').mockResolvedValue([] as never);
        const scan = { id: 9, tenantId: 3, update: vi.fn() };
        const repository = { id: 5, fullName: 'owner/repo', reload: vi.fn() };

        const result = await completeScanWithFindings(
            scan as never,
            repository as never,
            [
                {
                    ruleId: finding.ruleId,
                    severity: 'critical',
                    title: finding.title,
                    description: finding.description,
                    remediation: finding.remediation,
                    filePath: finding.filePath,
                    lineNumber: finding.lineNumber,
                    fingerprint: finding.fingerprint,
                    metadata: { branch: 'main' }
                }
            ],
            { publishGithubCheck: false, sendSummaryEmail: false, branchScope: 'main' }
        );

        expect(result.alertFindings).toHaveLength(0);
        expect(Finding.findAll).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining(
                {
                    where: expect.objectContaining({ repositoryId: 5, branch: 'main' })
                }
            )
        );
        expect(notificationMocks.queueSecurityAlert).toHaveBeenCalledWith(3, 'owner/repo', []);
        expect(notificationMocks.queueScanSummaryEmail).not.toHaveBeenCalled();
    });
});
