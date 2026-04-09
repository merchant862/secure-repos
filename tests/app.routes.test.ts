import { vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import type { Express } from 'express';

process.env.APP_NAME = 'MICRO-SAAS-APP';
process.env.PORT = '3000';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_NAME = 'micro_saas';
process.env.DB_USER = 'root';
process.env.DB_PASS = '';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.GITHUB_APP_ID = '123456';
process.env.GITHUB_CLIENT_ID = 'client-id';
process.env.GITHUB_CLIENT_SECRET = 'client-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GITHUB_PRIVATE_KEY_PATH = 'storage/keys/github-app.pem';
process.env.GITHUB_APP_SLUG = 'micro-saas-app';

vi.mock('../src/modules/github/github.service', async function ()
{
    const actual = await vi.importActual<typeof import('../src/modules/github/github.service')>('../src/modules/github/github.service');

    return {
        ...actual,
        getGithubInstallationDetails: vi.fn(async function (installationId: string)
        {
            return {
                id: Number(installationId),
                account:
                {
                    login: 'acme-org',
                    type: 'Organization'
                }
            };
        }),
        generateGithubAppJwt: vi.fn(async function ()
        {
            return 'mock-jwt-token';
        }),
        getGithubInstallationAccessToken: vi.fn(async function ()
        {
            return 'mock-installation-token';
        })
    };
});

vi.mock('../src/modules/github/github-install-callback.service', function ()
{
    return {
        processGithubInstallCallback: vi.fn(async function (input: {
            tenantId?: number;
            query: {
                installation_id?: string;
            };
        })
        {
            return {
                tenant:
                {
                    id: input.tenantId ?? 1,
                    name: 'acme-org',
                    slug: 'acme-org'
                },
                installation:
                {
                    id: 1,
                    tenantId: input.tenantId ?? 1,
                    githubInstallationId: input.query.installation_id ?? '0',
                    githubAccountLogin: 'acme-org',
                    githubAccountType: 'Organization'
                }
            };
        })
    };
});

vi.mock('../src/modules/github/github-repository-sync.service', function ()
{
    return {
        syncRepositoriesForGithubInstallation: vi.fn(async function (githubInstallationPrimaryId: number)
        {
            if (githubInstallationPrimaryId === 404)
            {
                throw new Error(`GitHub installation not found for id: ${githubInstallationPrimaryId}`);
            }

            return {
                totalCount: 2,
                syncedCount: 2,
                deactivatedCount: 1
            };
        })
    };
});

vi.mock('../src/modules/github/github-event-processor.service', function ()
{
    return {
        processGithubWebhookEvent: vi.fn(async function (deliveryId: string, webhookEvent: {
            event: string | null;
            payload: unknown;
        })
        {
            const payload = webhookEvent.payload as { action?: string };

            return {
                deliveryId,
                event: webhookEvent.event,
                action: payload.action ?? null,
                status: deliveryId === 'dup-123' ? 'duplicate' : 'processed'
            };
        })
    };
});

vi.mock('../src/modules/security/security-scan.service', function ()
{
    return {
        runRepositorySecurityScan: vi.fn(async function (repositoryId: number)
        {
            if (repositoryId === 404)
            {
                throw new Error(`Repository not found for id: ${repositoryId}`);
            }

            return {
                repositoryId,
                findingsCreated: 2,
                findingsOpen: 2
            };
        })
    };
});

vi.mock('../src/modules/security/finding.service', function ()
{
    return {
        listFindingsForRepository: vi.fn(async function (repositoryId: number)
        {
            if (repositoryId === 9)
            {
                return [];
            }

            return [
                {
                    id: 1,
                    repositoryId,
                    severity: 'high',
                    category: 'repository_visibility',
                    title: 'Repository is public',
                    status: 'open'
                },
                {
                    id: 2,
                    repositoryId,
                    severity: 'low',
                    category: 'branch_hygiene',
                    title: 'Repository still uses master as default branch',
                    status: 'open'
                }
            ];
        })
    };
});

vi.mock('../src/modules/github/github-repository.service', function ()
{
    return {
        listRepositoriesForGithubInstallation: vi.fn(async function (githubInstallationPrimaryId: number)
        {
            if (githubInstallationPrimaryId === 9)
            {
                return [];
            }

            return [
                {
                    id: 1,
                    githubInstallationId: githubInstallationPrimaryId,
                    fullName: 'acme-org/api',
                    name: 'api',
                    isActive: true
                }
            ];
        })
    };
});

vi.mock('../src/modules/github/github-admin.service', function ()
{
    return {
        listGithubInstallations: vi.fn(async function ()
        {
            return [
                {
                    id: 1,
                    githubInstallationId: '12345',
                    githubAccountLogin: 'acme-org',
                    isActive: true
                }
            ];
        }),
        getGithubInstallationSummary: vi.fn(async function ()
        {
            return {
                totalInstallations: 1,
                activeInstallations: 1,
                totalRepositories: 2,
                activeRepositories: 1
            };
        })
    };
});

vi.mock('../src/modules/github/github-webhook-admin.service', function ()
{
    return {
        listWebhookDeliveries: vi.fn(async function ()
        {
            return [
                {
                    id: 1,
                    deliveryId: 'abc-123',
                    eventName: 'installation',
                    status: 'processed'
                }
            ];
        }),
        getWebhookDeliverySummary: vi.fn(async function ()
        {
            return {
                totalDeliveries: 1,
                processedDeliveries: 1,
                failedDeliveries: 0,
                duplicateDeliveries: 0
            };
        })
    };
});

vi.mock('../src/modules/security/security-admin.service', function ()
{
    return {
        listRecentFindings: vi.fn(async function (scope: { tenantId: number })
        {
            return [
                {
                    id: 1,
                    tenantId: scope.tenantId,
                    severity: 'high',
                    category: 'repository_visibility',
                    title: 'Repository is public'
                }
            ];
        }),
        getSecuritySummary: vi.fn(async function (scope: { tenantId: number })
        {
            return {
                tenantId: scope.tenantId,
                totalFindings: 2,
                openFindings: 2,
                highSeverityFindings: 1
            };
        }),
        runBulkSecurityScan: vi.fn(async function ()
        {
            return {
                repositoriesScanned: 2,
                results:
                [
                    {
                        repositoryId: 8,
                        findingsCreated: 2,
                        findingsOpen: 2
                    }
                ]
            };
        })
    };
});

let app: Express;

function createGithubSignature(payload: string): string
{
    const digest = crypto
        .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET as string)
        .update(payload)
        .digest('hex');

    return `sha256=${digest}`;
}

describe('Application routes', function ()
{
    beforeAll(async function ()
    {
        const appModule = await import('../src/app/app');
        app = appModule.default;
    });

    it('should return health response', async function ()
    {
        const response = await request(app).get('/health');

        expect([200, 503]).toContain(response.status);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('app');
        expect(response.body).toHaveProperty('appName');
        expect(response.body).toHaveProperty('database');
        expect(response.body).toHaveProperty('redis');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should return 200 for github install callback with installation_id', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback')
            .query(
                {
                    installation_id: '12345',
                    setup_action: 'install'
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub install callback received');
        expect(response.body.data.installationId).toBe('12345');
        expect(response.body.data.setupAction).toBe('install');
        expect(response.body.data.persisted.githubAccountLogin).toBe('acme-org');
        expect(response.body.data.persisted.githubAccountType).toBe('Organization');
        expect(response.body.data.tenant.slug).toBe('acme-org');
    });

    it('should return github install URL', async function ()
    {
        const response = await request(app)
            .get('/github/install')
            .query(
                {
                    tenant_id: '7'
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub install URL generated');
        expect(response.body.data.installUrl).toContain('https://github.com/apps/micro-saas-app/installations/new');
        expect(response.body.data.installUrl).toContain('state=7');
    });

    it('should return 400 for github install callback without installation_id', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Missing installation_id');
    });

    it('should return 401 for github webhook with invalid signature', async function ()
    {
        const payload = JSON.stringify(
            {
                hello: 'world'
            }
        );

        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'abc-123')
            .set('x-hub-signature-256', 'sha256=test')
            .send(payload);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 401 for github webhook without signature', async function ()
    {
        const payload = JSON.stringify(
            {
                hello: 'world'
            }
        );

        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'abc-123')
            .send(payload);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 400 for github webhook without delivery header', async function ()
    {
        const payload = JSON.stringify(
            {
                hello: 'world'
            }
        );

        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-hub-signature-256', createGithubSignature(payload))
            .send(payload);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Missing x-github-delivery header');
    });

    it('should return 200 for github webhook with valid signature', async function ()
    {
        const payload = JSON.stringify(
            {
                action: 'created',
                installation:
                {
                    id: 12345
                }
            }
        );

        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'abc-123')
            .set('x-hub-signature-256', createGithubSignature(payload))
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub webhook verified');
        expect(response.body.data.event).toBe('installation');
        expect(response.body.data.delivery).toBe('abc-123');
        expect(response.body.data.action).toBe('created');
        expect(response.body.data.status).toBe('processed');
        expect(response.body.data.payload.action).toBe('created');
    });

    it('should return duplicate webhook status when the delivery was already seen', async function ()
    {
        const payload = JSON.stringify(
            {
                action: 'created',
                installation:
                {
                    id: 12345
                }
            }
        );

        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'dup-123')
            .set('x-hub-signature-256', createGithubSignature(payload))
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('duplicate');
    });

    it('should sync repositories when github installation id is sent in the body', async function ()
    {
        const response = await request(app)
            .post('/github/repositories/sync')
            .send(
                {
                    githubInstallationPrimaryId: 12
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Repositories synced successfully');
        expect(response.body.data).toEqual(
            {
                totalCount: 2,
                syncedCount: 2,
                deactivatedCount: 1
            }
        );
    });

    it('should return 404 when syncing repositories for a missing installation', async function ()
    {
        const response = await request(app)
            .post('/github/repositories/sync')
            .send(
                {
                    githubInstallationPrimaryId: 404
                }
            );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('GitHub installation not found');
    });

    it('should fetch repositories for a github installation', async function ()
    {
        const response = await request(app)
            .get('/github/repositories')
            .query(
                {
                    githubInstallationPrimaryId: 8
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Repositories fetched successfully');
        expect(response.body.data.githubInstallationPrimaryId).toBe(8);
        expect(response.body.data.count).toBe(1);
        expect(response.body.data.repositories[0].fullName).toBe('acme-org/api');
    });

    it('should fetch empty repositories list for a github installation without repos', async function ()
    {
        const response = await request(app)
            .get('/github/repositories')
            .query(
                {
                    githubInstallationPrimaryId: 9
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.data.githubInstallationPrimaryId).toBe(9);
        expect(response.body.data.count).toBe(0);
        expect(response.body.data.repositories).toEqual([]);
    });

    it('should return github auth debug details without installation id', async function ()
    {
        const response = await request(app)
            .get('/github/auth/debug');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub App JWT generated');
        expect(response.body.data.jwtPresent).toBe(true);
        expect(response.body.data.appId).toBe('123456');
        expect(response.body.data.appSlug).toBe('micro-saas-app');
    });

    it('should return installation token debug details when installation id is provided', async function ()
    {
        const response = await request(app)
            .get('/github/auth/debug')
            .query(
                {
                    installation_id: '12345'
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub installation access token generated');
        expect(response.body.data.installationId).toBe('12345');
        expect(response.body.data.tokenPresent).toBe(true);
    });

    it('should fetch github installations overview', async function ()
    {
        const response = await request(app)
            .get('/github/installations');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub installations fetched successfully');
        expect(response.body.data.summary.totalInstallations).toBe(1);
        expect(response.body.data.count).toBe(1);
    });

    it('should fetch webhook deliveries overview', async function ()
    {
        const response = await request(app)
            .get('/webhooks/github/deliveries');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Webhook deliveries fetched successfully');
        expect(response.body.data.summary.processedDeliveries).toBe(1);
        expect(response.body.data.count).toBe(1);
    });

    it('should run repository security scan', async function ()
    {
        const response = await request(app)
            .post('/repositories/8/scan');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Repository security scan completed');
        expect(response.body.data).toEqual(
            {
                repositoryId: 8,
                findingsCreated: 2,
                findingsOpen: 2
            }
        );
    });

    it('should return 404 for repository scan when repository is missing', async function ()
    {
        const response = await request(app)
            .post('/repositories/404/scan');

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Repository not found');
    });

    it('should fetch repository findings', async function ()
    {
        const response = await request(app)
            .get('/repositories/8/findings');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Repository findings fetched successfully');
        expect(response.body.data.repositoryId).toBe(8);
        expect(response.body.data.count).toBe(2);
        expect(response.body.data.findings[0].category).toBe('repository_visibility');
    });

    it('should fetch empty findings list for repository without findings', async function ()
    {
        const response = await request(app)
            .get('/repositories/9/findings');

        expect(response.status).toBe(200);
        expect(response.body.data.repositoryId).toBe(9);
        expect(response.body.data.count).toBe(0);
        expect(response.body.data.findings).toEqual([]);
    });

    it('should fetch security overview', async function ()
    {
        const response = await request(app)
            .get('/security/overview')
            .query(
                {
                    tenant_id: 7
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Security overview fetched successfully');
        expect(response.body.data.tenantId).toBe(7);
        expect(response.body.data.summary.tenantId).toBe(7);
        expect(response.body.data.summary.totalFindings).toBe(2);
        expect(response.body.data.count).toBe(1);
        expect(response.body.data.findings[0].tenantId).toBe(7);
    });

    it('should return 400 for security overview without tenant id', async function ()
    {
        const response = await request(app)
            .get('/security/overview');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Invalid tenant_id');
    });

    it('should run bulk security scan', async function ()
    {
        const response = await request(app)
            .post('/security/scan-all');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Bulk security scan completed');
        expect(response.body.data.repositoriesScanned).toBe(2);
    });
});
