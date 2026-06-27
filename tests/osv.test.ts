import { afterEach, vi } from 'vitest';

import { scanDependencyVulnerabilities } from '../src/app/services/osv.service';

afterEach(function ()
{
    vi.unstubAllGlobals();
});

describe('OSV dependency scanning', function ()
{
    it('maps batch vulnerability results to branch-aware findings', async function ()
    {
        const fetchMock = vi.fn(async (input: string | URL | Request) =>
        {
            const url = String(input);

            if (url.endsWith('/v1/querybatch'))
            {
                return new Response(
                    JSON.stringify({ results: [{ vulns: [{ id: 'GHSA-test-1234' }] }] }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify(
                    {
                        id: 'GHSA-test-1234',
                        aliases: ['CVE-2026-1234'],
                        summary: 'Example package vulnerability',
                        database_specific: { severity: 'HIGH' },
                        affected:
                        [
                            {
                                package: { ecosystem: 'npm', name: 'example-package' },
                                ranges: [{ events: [{ introduced: '0' }, { fixed: '2.0.0' }] }]
                            }
                        ],
                        references: [{ type: 'ADVISORY', url: 'https://example.test/advisory' }]
                    }
                ),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        });
        vi.stubGlobal('fetch', fetchMock);

        const findings = await scanDependencyVulnerabilities(
            [
                {
                    branch: 'main',
                    dependencies:
                    [
                        {
                            ecosystem: 'npm',
                            name: 'example-package',
                            version: '1.0.0',
                            filePath: 'package-lock.json'
                        }
                    ]
                }
            ]
        );

        expect(findings).toHaveLength(1);
        expect(findings[0]).toEqual(expect.objectContaining(
            {
                ruleId: 'dependency.osv-vulnerability',
                severity: 'high',
                title: 'CVE-2026-1234: vulnerable example-package',
                filePath: 'package-lock.json'
            }
        ));
        expect(findings[0].metadata).toEqual(expect.objectContaining(
            {
                branch: 'main',
                dependencyName: 'example-package',
                detectedVersion: '1.0.0',
                patchedVersion: '2.0.0'
            }
        ));
    });

    it('follows per-query pagination tokens returned by OSV', async function ()
    {
        let batchCalls = 0;
        const fetchMock = vi.fn(async (input: string | URL | Request) =>
        {
            const url = String(input);

            if (url.endsWith('/v1/querybatch'))
            {
                batchCalls += 1;
                return new Response(
                    JSON.stringify(
                        {
                            results:
                            [
                                batchCalls === 1
                                    ? { vulns: [{ id: 'OSV-ONE' }], next_page_token: 'next' }
                                    : { vulns: [{ id: 'OSV-TWO' }] }
                            ]
                        }
                    ),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const id = url.endsWith('OSV-ONE') ? 'OSV-ONE' : 'OSV-TWO';
            return new Response(
                JSON.stringify({ id, summary: id }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        });
        vi.stubGlobal('fetch', fetchMock);

        const findings = await scanDependencyVulnerabilities(
            [
                {
                    branch: 'main',
                    dependencies: [{ ecosystem: 'npm', name: 'one', version: '1.0.0', filePath: 'package-lock.json' }]
                }
            ]
        );

        expect(batchCalls).toBe(2);
        expect(findings).toHaveLength(2);
    });
});
