import { Router } from 'express';
import { dashboardController } from './controllers/web/dashboard.controller';
import { healthController } from './controllers/web/health.controller';
import { githubInstallCallbackController } from './controllers/web/github-install.controller';
import {
    acceptInvitationPageController,
    billingPageController,
    demoPageController,
    findingDetailPageController,
    findingsPageController,
    landingPageController,
    legalPlaceholderPageController,
    notificationsPageController,
    onboardingPageController,
    pricingPageController,
    profilePageController,
    reportsPageController,
    repositoryDetailPageController,
    repositoriesPageController,
    settingsPageController,
    signInPageController,
    signUpPageController,
    teamPageController
} from './controllers/web/page.controller';
import { adminApiAuthMiddleware } from './middlewares/admin-api-auth.middleware';
import {
    enqueueAllRepositoriesScanController,
    enqueueRepositoryScanController,
    getScanController,
    listRepositoriesController,
    listRepositoryFindingsController
} from './controllers/api/repository.controller';
import {
    createAdminPricingPlanController,
    deactivateAdminPricingPlanController,
    listAdminPricingPlansController,
    listPublicPricingPlansController,
    updateAdminPricingPlanController
} from './controllers/api/pricing.controller';
import {
    getProviderConnectUrlController,
    providerOAuthCallbackController
} from './controllers/api/code-host.controller';
import {
    acceptInvitationController,
    loginController,
    logoutController,
    meController,
    signupController
} from './controllers/api/auth.controller';
import {
    inviteTeamMemberController,
    listTeamInvitationsController,
    listTeamMembersController
} from './controllers/api/team.controller';
import {
    getUserRepositoryChecklistController,
    listUserFindingsController,
    listUserRepositoriesController,
    markUserBaselineController,
    updateUserFindingController
} from './controllers/api/user-security.controller';
import {
    createIgnoreRuleController,
    deactivateIgnoreRuleController,
    exportReportController,
    getNotificationSettingsController,
    getSecurityTrendController,
    listAuditLogsController,
    listIgnoreRulesController,
    listNotificationsController,
    markNotificationReadController,
    updateNotificationSettingsController
} from './controllers/api/user-settings.controller';
import { notificationStreamController } from './controllers/api/notification-stream.controller';
import {
    requireOwnerOrAdmin,
    userAuthMiddleware
} from './middlewares/user-auth.middleware';
import {
    bitbucketWebhookController,
    gitlabWebhookController
} from './controllers/webhook/provider-webhook.controller';
import {
    assignTenantPlanController,
    deactivateRepositoryController,
    listAdminScansController,
    listCriticalFindingsController,
    listTenantsController,
    retryScanController
} from './controllers/api/admin-operations.controller';

const router = Router();

router.get('/', landingPageController);
router.get('/terms', legalPlaceholderPageController);
router.get('/privacy', legalPlaceholderPageController);
router.get('/refund-policy', legalPlaceholderPageController);
router.get('/do-not-sell', legalPlaceholderPageController);
router.get('/demo', demoPageController);
router.get('/demo/:page', demoPageController);

router.get('/dashboard', dashboardController);
router.get('/onboarding', onboardingPageController);
router.get('/repositories', repositoriesPageController);
router.get('/repositories/:repositoryId', repositoryDetailPageController);
router.get('/findings', findingsPageController);
router.get('/findings/:findingId', findingDetailPageController);
router.get('/reports', reportsPageController);
router.get('/team', teamPageController);
router.get('/settings', settingsPageController);
router.get('/notifications', notificationsPageController);
router.get('/billing', billingPageController);
router.get('/profile', profilePageController);
router.get('/pricing', pricingPageController);
router.get('/sign-in', signInPageController);
router.get('/sign-up', signUpPageController);
router.get('/invitations/accept', acceptInvitationPageController);
router.get('/github/install/callback', githubInstallCallbackController);
router.post('/webhooks/gitlab', gitlabWebhookController);
router.post('/webhooks/bitbucket', bitbucketWebhookController);
router.post('/api/auth/signup', signupController);
router.post('/api/auth/login', loginController);
router.post('/api/auth/logout', logoutController);
router.post('/api/auth/invitations/accept', acceptInvitationController);
router.get('/api/auth/:provider/callback', providerOAuthCallbackController);
router.get('/api/pricing', listPublicPricingPlansController);

router.use('/api/user', userAuthMiddleware);
router.get('/api/user/me', meController);
router.get('/api/user/team/members', listTeamMembersController);
router.get('/api/user/team/invitations', requireOwnerOrAdmin, listTeamInvitationsController);
router.post('/api/user/team/invitations', requireOwnerOrAdmin, inviteTeamMemberController);
router.get('/api/user/auth/:provider/connect-url', getProviderConnectUrlController);
router.get('/api/user/repositories', listUserRepositoriesController);
router.get('/api/user/repositories/:repositoryId/checklist', getUserRepositoryChecklistController);
router.get('/api/user/findings', listUserFindingsController);
router.patch('/api/user/findings/:findingId', updateUserFindingController);
router.post('/api/user/scans/:scanId/baseline', requireOwnerOrAdmin, markUserBaselineController);
router.get('/api/user/settings/notifications', getNotificationSettingsController);
router.put('/api/user/settings/notifications', requireOwnerOrAdmin, updateNotificationSettingsController);
router.get('/api/user/ignore-rules', listIgnoreRulesController);
router.post('/api/user/ignore-rules', requireOwnerOrAdmin, createIgnoreRuleController);
router.delete('/api/user/ignore-rules/:ruleId', requireOwnerOrAdmin, deactivateIgnoreRuleController);
router.get('/api/user/notifications', listNotificationsController);
router.get('/api/user/notifications/stream', notificationStreamController);
router.patch('/api/user/notifications/:notificationId/read', markNotificationReadController);
router.get('/api/user/audit-logs', requireOwnerOrAdmin, listAuditLogsController);
router.get('/api/user/security-trend', getSecurityTrendController);
router.get('/api/user/reports/export', exportReportController);

router.use('/api/admin', adminApiAuthMiddleware);
router.get('/api/admin/health', healthController);
router.get('/api/admin/pricing-plans', listAdminPricingPlansController);
router.post('/api/admin/pricing-plans', createAdminPricingPlanController);
router.put('/api/admin/pricing-plans/:planId', updateAdminPricingPlanController);
router.delete('/api/admin/pricing-plans/:planId', deactivateAdminPricingPlanController);
router.get('/api/admin/tenants', listTenantsController);
router.put('/api/admin/tenants/:tenantId/plan', assignTenantPlanController);
router.get('/api/admin/repositories', listRepositoriesController);
router.post('/api/admin/repositories/:repositoryId/scans', enqueueRepositoryScanController);
router.delete('/api/admin/repositories/:repositoryId', deactivateRepositoryController);
router.get('/api/admin/repositories/:repositoryId/findings', listRepositoryFindingsController);
router.post('/api/admin/scans/run-all', enqueueAllRepositoriesScanController);
router.get('/api/admin/scans', listAdminScansController);
router.get('/api/admin/scans/:scanId', getScanController);
router.post('/api/admin/scans/:scanId/retry', retryScanController);
router.get('/api/admin/findings/critical', listCriticalFindingsController);

export {
    router
};
