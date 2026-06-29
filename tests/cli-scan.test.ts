import {
    normalizeCliDependency,
    normalizeCliFinding,
    normalizeCliScanInput
} from '../src/app/services/cli-scan.service';

describe('CLI scan payload validation', function ()
{
    it('accepts bounded scan metadata', function ()
    {
        const input = normalizeCliScanInput(
            {
                repositoryId: 12,
                branch: 'main',
                commitSha: 'abcdef1234567890',
                clientVersion: '0.1.0',
                filesScanned: 25,
                filesSkipped: 2,
                durationMs: 1500,
                findings: [],
                dependencies: []
            }
        );

        expect(input.repositoryId).toBe(12);
        expect(input.branch).toBe('main');
        expect(input.commitSha).toBe('abcdef1234567890');
    });

    it('rejects oversized or malformed submissions', function ()
    {
        expect(() => normalizeCliScanInput(
            {
                repositoryId: 12,
                branch: 'main',
                findings: new Array(501).fill({}),
                dependencies: []
            }
        )).toThrow('500 finding limit');

        expect(() => normalizeCliScanInput(
            {
                repositoryId: 12,
                branch: 'main\ninvalid',
                findings: [],
                dependencies: []
            }
        )).toThrow('branch is invalid');
    });

    it('rejects absolute and traversal paths from an untrusted client', function ()
    {
        expect(() => normalizeCliFinding(
            {
                ruleId: 'secret.example',
                severity: 'high',
                title: 'Example finding',
                description: 'Example finding description',
                remediation: 'Remove the example value.',
                filePath: '../outside.txt',
                lineNumber: 1,
                fingerprint: 'a'.repeat(64)
            },
            'main'
        )).toThrow('repository-relative');

        expect(() => normalizeCliDependency(
            {
                ecosystem: 'npm',
                name: 'example',
                version: '1.0.0',
                filePath: 'C:/outside/package-lock.json'
            }
        )).toThrow('repository-relative');
    });
});
