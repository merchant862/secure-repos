import crypto from 'crypto';
import { Request, Response } from 'express';

import { env } from '../../../bootstrap/env';
import {
    CiRuntimeEvent,
    CodeHostConnection,
    Finding,
    FindingOccurrence,
    InAppNotification,
    PricingPlan,
    Repository,
    Scan,
    Tenant,
    TenantSubscription,
    User,
    UserSession
} from '../../../db/models';
import { hashToken } from '../../services/auth.service';

const authCookieName = process.env.AUTH_COOKIE_NAME && process.env.AUTH_COOKIE_NAME.trim() !== ''
    ? process.env.AUTH_COOKIE_NAME
    : 'security_platform_token';

function uiTestEnabled()
{
    return env.nodeEnv !== 'production';
}

function selectedPlanSlug(value: unknown)
{
    return String(value || '').toLowerCase() === 'starter' ? 'solo-starter' : 'solo-pro';
}

async function ensurePlan(slug: string)
{
    const fallback = await PricingPlan.findOne({ where: { isActive: true }, order: [['sortOrder', 'ASC']] });
    const plan = await PricingPlan.findOne({ where: { slug, isActive: true } });

    if (!plan && !fallback)
    {
        throw new Error('No active pricing plan is configured.');
    }

    return plan ?? fallback as PricingPlan;
}

async function ensureUiTestWorkspace(planSlug: string)
{
    const plan = await ensurePlan(planSlug);
    const [tenant] = await Tenant.findOrCreate(
        {
            where: { slug: 'ui-test-workspace' },
            defaults:
            {
                name: 'UI Test Workspace',
                slug: 'ui-test-workspace'
            }
        }
    );
    const [user] = await User.findOrCreate(
        {
            where: { email: 'ui-test@securerepos.local' },
            defaults:
            {
                tenantId: tenant.id,
                name: 'UI Test Owner',
                email: 'ui-test@securerepos.local',
                password: null,
                role: 'owner',
                status: 'active',
                emailVerifiedAt: new Date()
            }
        }
    );

    await user.update(
        {
            tenantId: tenant.id,
            role: 'owner',
            status: 'active',
            emailVerifiedAt: user.emailVerifiedAt ?? new Date()
        }
    );

    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);
    const [subscription] = await TenantSubscription.findOrCreate(
        {
            where: { tenantId: tenant.id },
            defaults:
            {
                tenantId: tenant.id,
                pricingPlanId: plan.id,
                status: 'active',
                currentPeriodStartsAt: periodStart,
                currentPeriodEndsAt: periodEnd,
                provider: 'paddle',
                providerCustomerId: 'ctm_ui_test',
                providerSubscriptionId: 'sub_ui_test',
                providerStatus: 'active'
            }
        }
    );

    await subscription.update(
        {
            pricingPlanId: plan.id,
            pendingPricingPlanId: null,
            status: 'active',
            currentPeriodStartsAt: periodStart,
            currentPeriodEndsAt: periodEnd,
            provider: 'paddle',
            providerCustomerId: 'ctm_ui_test',
            providerSubscriptionId: 'sub_ui_test',
            providerPriceId: plan.slug,
            providerStatus: 'active'
        }
    );

    const [connection] = await CodeHostConnection.findOrCreate(
        {
            where:
            {
                tenantId: tenant.id,
                provider: 'github',
                externalId: 'ui-test-github'
            },
            defaults:
            {
                tenantId: tenant.id,
                provider: 'github',
                externalId: 'ui-test-github',
                accountLogin: 'merchant862',
                accountType: 'User',
                isActive: true,
                lastSyncAt: new Date()
            }
        }
    );

    await connection.update({ accountLogin: 'merchant862', accountType: 'User', isActive: true, lastSyncAt: new Date() });

    const repositories = await seedRepositories(connection.id);
    await seedScansAndFindings(tenant.id, repositories);
    await seedNotifications(tenant.id, user.id, repositories[0]);
    await seedRuntimeEvents(tenant.id, repositories[0]).catch((error) =>
        console.warn('UI test runtime events skipped:', error instanceof Error ? error.message : error));

    return user;
}

async function seedRepositories(codeHostConnectionId: number)
{
    const repositoryInputs =
    [
        ['checkout-api', 'merchant862/checkout-api', 72],
        ['storefront-web', 'merchant862/storefront-web', 91],
        ['infra-deploy', 'merchant862/infra-deploy', 63]
    ] as const;
    const repositories: Repository[] = [];

    for (const [name, fullName, score] of repositoryInputs)
    {
        const [repository] = await Repository.findOrCreate(
            {
                where:
                {
                    provider: 'github',
                    externalRepositoryId: `ui-test-${name}`
                },
                defaults:
                {
                    codeHostConnectionId,
                    provider: 'github',
                    githubRepositoryId: `ui-test-${name}`,
                    externalRepositoryId: `ui-test-${name}`,
                    name,
                    fullName,
                    webUrl: `https://github.com/${fullName}`,
                    defaultBranch: 'main',
                    isPrivate: true,
                    isActive: true,
                    securityScore: score,
                    nextScheduledScanAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
                    lastScheduledScanAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
                }
            }
        );

        await repository.update(
            {
                codeHostConnectionId,
                fullName,
                webUrl: `https://github.com/${fullName}`,
                isActive: true,
                securityScore: score
            }
        );
        repositories.push(repository);
    }

    return repositories;
}

async function seedScansAndFindings(tenantId: number, repositories: Repository[])
{
    await Finding.destroy({ where: { repositoryId: repositories.map((repository) => repository.id) } });
    await Scan.destroy({ where: { repositoryId: repositories.map((repository) => repository.id) } });

    for (const repository of repositories)
    {
        const scan = await Scan.create(
            {
                tenantId,
                repositoryId: repository.id,
                status: 'completed',
                triggerType: 'manual_user',
                branch: 'main',
                commitSha: crypto.randomBytes(20).toString('hex'),
                findingsCritical: repository.name === 'infra-deploy' ? 1 : 0,
                findingsHigh: repository.name === 'storefront-web' ? 0 : 1,
                findingsMedium: 2,
                findingsLow: 1,
                metadata:
                {
                    scannedFiles: 428,
                    scannedBranches: 4,
                    progressStage: 'completed'
                } as object,
                startedAt: new Date(Date.now() - 9 * 60 * 1000),
                completedAt: new Date(Date.now() - 4 * 60 * 1000)
            }
        );
        const findings = sampleFindings(repository, scan.id);

        for (const input of findings)
        {
            const finding = await Finding.create(input);
            await FindingOccurrence.create(
                {
                    scanId: scan.id,
                    findingId: finding.id,
                    repositoryId: repository.id,
                    branch: finding.branch,
                    severity: finding.severity,
                    ruleId: finding.ruleId,
                    title: finding.title,
                    description: finding.description,
                    remediation: finding.remediation,
                    filePath: finding.filePath,
                    lineNumber: finding.lineNumber
                }
            );
        }
    }
}

function sampleFindings(repository: Repository, scanId: number)
{
    const now = new Date();
    const base =
    [
        {
            scanId,
            repositoryId: repository.id,
            ruleId: 'secret.high-confidence-token',
            severity: repository.name === 'infra-deploy' ? 'critical' : 'high',
            title: 'Credential-like token in application configuration',
            description: 'A high-confidence credential pattern was found in a repository file.',
            remediation: 'Rotate the credential, remove it from source control, and move it to protected runtime configuration.',
            branch: 'main',
            filePath: repository.name === 'infra-deploy' ? 'terraform/prod.tfvars' : 'config/production.env',
            lineNumber: 18,
            fingerprint: `ui-test-${repository.id}-secret`,
            status: 'open',
            firstSeenAt: now,
            lastSeenAt: now,
            metadata:
            {
                category: 'Secrets',
                confidence: 'high',
                falsePositiveRisk: 'low',
                recommendedAction: 'Rotate the exposed value first, then remove it from the repository and rerun verification.',
                fixVerification: 'Run a verification scan after the fix. This finding closes when the token pattern is no longer detected.'
            } as object
        },
        {
            scanId,
            repositoryId: repository.id,
            ruleId: 'ci.workflow-broad-permissions',
            severity: 'high',
            title: 'GitHub Actions workflow grants broad write permissions',
            description: 'A workflow grants more repository permissions than the job appears to need.',
            remediation: 'Set workflow permissions to read-only by default and grant write permissions only to the specific job that needs them.',
            branch: 'main',
            filePath: '.github/workflows/deploy.yml',
            lineNumber: 7,
            fingerprint: `ui-test-${repository.id}-ci-permissions`,
            status: 'open',
            firstSeenAt: now,
            lastSeenAt: now,
            metadata:
            {
                category: 'CI/CD',
                confidence: 'medium',
                falsePositiveRisk: 'medium',
                recommendedAction: 'Review the workflow permissions block and reduce it to least privilege.',
                fixVerification: 'Run a new scan after updating the workflow file.'
            } as object
        },
        {
            scanId,
            repositoryId: repository.id,
            ruleId: 'dependency.vulnerable-package',
            severity: 'medium',
            title: 'Dependency version has known security advisories',
            description: 'A dependency lockfile references a version associated with published vulnerability advisories.',
            remediation: 'Upgrade the dependency to a patched version and run the package manager test suite.',
            branch: 'main',
            filePath: 'package-lock.json',
            lineNumber: 284,
            fingerprint: `ui-test-${repository.id}-dependency`,
            status: repository.name === 'storefront-web' ? 'resolved' : 'open',
            firstSeenAt: now,
            lastSeenAt: now,
            resolvedAt: repository.name === 'storefront-web' ? now : null,
            metadata:
            {
                category: 'Dependencies',
                confidence: 'high',
                falsePositiveRisk: 'low'
            } as object
        }
    ];

    return base;
}

async function seedNotifications(tenantId: number, userId: number, repository: Repository)
{
    await InAppNotification.destroy({ where: { tenantId } });
    await InAppNotification.bulkCreate(
        [
            {
                tenantId,
                userId,
                type: 'security_alert',
                title: 'High-risk findings detected',
                body: `${repository.fullName} has critical or high-risk findings ready for review.`,
                payload: { repositoryId: repository.id, repositoryFullName: repository.fullName } as object
            },
            {
                tenantId,
                userId,
                type: 'scan_summary',
                title: 'Scan complete',
                body: '3 repositories were scanned and the dashboard has been refreshed.',
                payload: { repositoryCount: 3 } as object,
                readAt: new Date()
            }
        ]
    );
}

async function seedRuntimeEvents(tenantId: number, repository: Repository)
{
    await CiRuntimeEvent.destroy({ where: { tenantId } });
    await CiRuntimeEvent.bulkCreate(
        [
            {
                tenantId,
                repositoryFullName: repository.fullName,
                workflowName: 'deploy',
                jobName: 'production',
                runId: '982341',
                eventType: 'ci.remote-script-execution',
                severity: 'high',
                summary: 'CI command pipes remote content into an executable runtime.',
                metadata: { ref: 'refs/heads/main', sha: 'ui-test' } as object,
                observedAt: new Date(Date.now() - 18 * 60 * 1000)
            },
            {
                tenantId,
                repositoryFullName: repository.fullName,
                workflowName: 'test',
                jobName: 'unit',
                runId: '982340',
                eventType: 'ci.unapproved-network-host',
                severity: 'medium',
                summary: 'CI contacted an unapproved host during a guarded job.',
                metadata: { host: 'downloads.example.invalid' } as object,
                observedAt: new Date(Date.now() - 45 * 60 * 1000)
            }
        ]
    );
}

async function uiTestLoginController(req: Request, res: Response)
{
    if (!uiTestEnabled())
    {
        return res.status(404).send('Not found');
    }

    const user = await ensureUiTestWorkspace(selectedPlanSlug(req.query.plan));
    const token = crypto.randomBytes(32).toString('hex');

    await UserSession.create(
        {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            ipAddress: req.ip,
            userAgent: req.header('user-agent') ?? null
        }
    );

    res.cookie(authCookieName, token,
        {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            maxAge: 14 * 24 * 60 * 60 * 1000,
            path: '/'
        });

    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//')
        ? req.query.next
        : '/dashboard';

    return res.redirect(next);
}

export {
    uiTestLoginController
};
