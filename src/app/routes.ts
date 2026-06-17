import { Router } from 'express';
import { dashboardController } from './controllers/web/dashboard.controller';
import { adminPanelPageController, adminSignInPageController } from './controllers/web/admin-page.controller';
import { healthController } from './controllers/web/health.controller';
import { githubInstallCallbackController } from './controllers/web/github-install.controller';
import {
    acceptInvitationPageController,
    billingPageController,
    contactPageController,
    demoPageController,
    faqPageController,
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
    scansPageController,
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
    getProviderConnectUrlController
} from './controllers/api/code-host.controller';
import {
    acceptInvitationController,
    loginController,
    loginOtpController,
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
    enqueueUserRepositoryScanController,
    getUserDashboardSummaryController,
    getUserRepositoryController,
    getUserRepositoryChecklistController,
    listUserFindingsController,
    listUserRepositoriesController,
    listUserScansController,
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
    userAuthMiddleware,
    userPageAuthMiddleware
} from './middlewares/user-auth.middleware';
import {
    assignTenantPlanController,
    cancelTenantSubscriptionController,
    deactivateRepositoryController,
    listAdminScansController,
    listCriticalFindingsController,
    listTenantsController,
    retryScanController
} from './controllers/api/admin-operations.controller';
import {
    cancelUserSubscriptionController,
    getUserBillingController
} from './controllers/api/billing.controller';
import {
    adminLoginController,
    adminLogoutController,
    adminMeController
} from './controllers/api/admin-auth.controller';
import {
    listAdminsController,
    updateAdminController
} from './controllers/api/admin-management.controller';
import {
    getAdminProviderSettingController,
    listAdminProviderSettingsController,
    updateAdminProviderSettingController
} from './controllers/api/admin-provider-settings.controller';
import { submitContactController } from './controllers/api/contact.controller';

const router = Router();

router.get('/', landingPageController);
router.get('/terms', legalPlaceholderPageController);
router.get('/privacy', legalPlaceholderPageController);
router.get('/refund-policy', legalPlaceholderPageController);
router.get('/do-not-sell', legalPlaceholderPageController);
router.get('/faqs', faqPageController);
router.get('/contact', contactPageController);
router.get('/demo', demoPageController);
router.get('/demo/:page', demoPageController);
router.get('/admin', adminPanelPageController);
router.get('/admin/sign-in', adminSignInPageController);
router.get('/admin/:adminPage', adminPanelPageController);

router.get('/dashboard', userPageAuthMiddleware, dashboardController);
router.get('/onboarding', userPageAuthMiddleware, onboardingPageController);
router.get('/repositories', userPageAuthMiddleware, repositoriesPageController);
router.get('/repositories/:repositoryId', userPageAuthMiddleware, repositoryDetailPageController);
router.get('/scans', userPageAuthMiddleware, scansPageController);
router.get('/findings', userPageAuthMiddleware, findingsPageController);
router.get('/findings/:findingId', userPageAuthMiddleware, findingDetailPageController);
router.get('/reports', userPageAuthMiddleware, reportsPageController);
router.get('/team', userPageAuthMiddleware, teamPageController);
router.get('/settings', userPageAuthMiddleware, settingsPageController);
router.get('/notifications', userPageAuthMiddleware, notificationsPageController);
router.get('/billing', userPageAuthMiddleware, billingPageController);
router.get('/profile', userPageAuthMiddleware, profilePageController);
router.get('/pricing', userPageAuthMiddleware, pricingPageController);
router.get('/sign-in', signInPageController);
router.get('/sign-up', signUpPageController);
router.get('/invitations/accept', acceptInvitationPageController);
router.get('/github/install/callback', githubInstallCallbackController);
router.get('/github/install/return', githubInstallCallbackController);
router.post('/api/auth/signup', signupController);
router.post('/api/auth/login', loginController);
router.post('/api/auth/login/otp', loginOtpController);
router.post('/api/auth/logout', logoutController);
router.post('/api/auth/invitations/accept', acceptInvitationController);
router.post('/api/contact', submitContactController);
router.get('/api/pricing', listPublicPricingPlansController);
router.post('/api/admin/auth/login', adminLoginController);

router.use('/api/user', userAuthMiddleware);
router.get('/api/user/me', meController);
router.get('/api/user/team/members', listTeamMembersController);
router.get('/api/user/team/invitations', requireOwnerOrAdmin, listTeamInvitationsController);
router.post('/api/user/team/invitations', requireOwnerOrAdmin, inviteTeamMemberController);
router.get('/api/user/auth/:provider/connect-url', getProviderConnectUrlController);
router.get('/api/user/dashboard-summary', getUserDashboardSummaryController);
router.get('/api/user/repositories', listUserRepositoriesController);
router.get('/api/user/repositories/:repositoryId', getUserRepositoryController);
router.get('/api/user/repositories/:repositoryId/checklist', getUserRepositoryChecklistController);
router.post('/api/user/repositories/:repositoryId/scans', enqueueUserRepositoryScanController);
router.get('/api/user/scans', listUserScansController);
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
router.get('/api/user/billing', getUserBillingController);
router.post('/api/user/billing/cancel', cancelUserSubscriptionController);

router.use('/api/admin', adminApiAuthMiddleware);
router.get('/api/admin/auth/me', adminMeController);
router.post('/api/admin/auth/logout', adminLogoutController);
router.get('/api/admin/admins', listAdminsController);
router.put('/api/admin/admins/:adminId', updateAdminController);
router.get('/api/admin/health', healthController);
router.get('/api/admin/pricing-plans', listAdminPricingPlansController);
router.post('/api/admin/pricing-plans', createAdminPricingPlanController);
router.put('/api/admin/pricing-plans/:planId', updateAdminPricingPlanController);
router.delete('/api/admin/pricing-plans/:planId', deactivateAdminPricingPlanController);
router.get('/api/admin/tenants', listTenantsController);
router.put('/api/admin/tenants/:tenantId/plan', assignTenantPlanController);
router.post('/api/admin/tenants/:tenantId/subscription/cancel', cancelTenantSubscriptionController);
router.get('/api/admin/repositories', listRepositoriesController);
router.post('/api/admin/repositories/:repositoryId/scans', enqueueRepositoryScanController);
router.delete('/api/admin/repositories/:repositoryId', deactivateRepositoryController);
router.get('/api/admin/repositories/:repositoryId/findings', listRepositoryFindingsController);
router.post('/api/admin/scans/run-all', enqueueAllRepositoriesScanController);
router.get('/api/admin/scans', listAdminScansController);
router.get('/api/admin/scans/:scanId', getScanController);
router.post('/api/admin/scans/:scanId/retry', retryScanController);
router.get('/api/admin/findings/critical', listCriticalFindingsController);
router.get('/api/admin/provider-settings', listAdminProviderSettingsController);
router.get('/api/admin/provider-settings/:provider', getAdminProviderSettingController);
router.put('/api/admin/provider-settings/:provider', updateAdminProviderSettingController);

export {
    router
};
