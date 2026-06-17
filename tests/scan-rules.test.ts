import { scanFiles } from '../src/app/services/scan-rules.service';

describe('Scanner sample path handling', function ()
{
    it('should suppress low-confidence key file findings in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/ca.pem',
                    content: '-----BEGIN CERTIFICATE-----\nMIIDexample\n-----END CERTIFICATE-----'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'repo.key-file-committed')).toBe(false);
    });

    it('should suppress generic secret assignments in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/constructor.php',
                    content: '$api_key = "example_api_key_value_123456";'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'secret.generic-assignment')).toBe(false);
    });

    it('should still report high-confidence secrets in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/private.key',
                    content: '-----BEGIN PRIVATE KEY-----\nreal-looking-private-key\n-----END PRIVATE KEY-----'
                },
                {
                    path: 'examples/config.js',
                    content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456";'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'secret.private-key')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'secret.github-token')).toBe(true);
    });
});
