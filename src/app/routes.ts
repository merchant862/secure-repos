import { Router } from 'express';
import { dashboardController } from './controllers/web/dashboard.controller';
import { checkoutPageController } from './controllers/web/checkout.controller';
import { githubInstallCallbackController } from './controllers/web/github-install.controller';
import { uiTestLoginController } from './controllers/web/ui-test.controller';
import {
    billingPageController,
    contactPageController,
    demoPageController,
    faqPageController,
    forgotPasswordPageController,
    findingDetailPageController,
    findingsPageController,
    landingPageController,
    legalPlaceholderPageController,
    notificationsPageController,
    onboardingPageController,
    repositoryDetailPageController,
    repositoriesPageController,
    robotsTxtController,
    scanDetailPageController,
    scansPageController,
    settingsPageController,
    sitemapXmlController,
    signInPageController,
    resetPasswordPageController,
    emailVerificationPendingPageController,
    signUpPageController,
} from './controllers/web/page.controller';
import {
    listPublicPricingPlansController,
} from './controllers/api/pricing.controller';
import {
    getProviderConnectUrlController
} from './controllers/api/code-host.controller';
import {
    changePasswordController,
    githubLoginCallbackController,
    githubLoginStartController,
    loginController,
    loginOtpController,
    logoutController,
    meController,
    passwordResetConfirmController,
    passwordResetRequestController,
    resendEmailVerificationController,
    signupController,
    verifyEmailController
} from './controllers/api/auth.controller';
import {
    enqueueUserRepositoryScanController,
    getUserDashboardSummaryController,
    getUserFindingController,
    getUserRepositoryController,
    getUserRepositoryChecklistController,
    getUserScanController,
    listUserFindingsController,
    listUserRepositoryRuntimeEventsController,
    listUserRepositoriesController,
    listUserScansController,
    markUserBaselineController,
    createFindingRemediationPrController,
    updateUserFindingController,
    verifyUserFindingController
} from './controllers/api/user-security.controller';
import {
    createAlertChannelController,
    deleteAlertChannelController,
    getSecurityTrendController,
    listAlertChannelsController,
    listAuditLogsController,
    listNotificationsController,
    markNotificationReadController,
    testAlertChannelController
} from './controllers/api/user-settings.controller';
import { notificationStreamController } from './controllers/api/notification-stream.controller';
import {
    guestPageMiddleware,
    requireOwner,
    userAuthMiddleware,
    userPageAuthMiddleware
} from './middlewares/user-auth.middleware';
import {
    cancelUserSubscriptionController,
    createUserPaymentMethodUpdateController,
    getUserBillingController,
    syncUserPaddleCheckoutController
} from './controllers/api/billing.controller';
import { submitContactController } from './controllers/api/contact.controller';
import { ingestCiRuntimeEventsController } from './controllers/api/ci-runtime.controller';
import { rateLimit, sameOriginApiMiddleware } from './middlewares/security.middleware';
import {
    createUserCliAccessTokenController,
    listUserCliAccessTokensController,
    revokeUserCliAccessTokenController
} from './controllers/api/cli-access-token.controller';
import {
    getCliIdentityController,
    listCliRepositoriesController,
    submitCliScanController
} from './controllers/api/cli.controller';
import { cliAccessTokenAuthMiddleware } from './middlewares/cli-auth.middleware';

const router = Router();
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, scope: 'auth' });
const otpRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 8, scope: 'otp' });
const contactRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, scope: 'contact' });
const passwordChangeRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, scope: 'password-change' });
const paymentMethodUpdateRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, scope: 'payment-method-update' });
const cliTokenCreateRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, scope: 'cli-token-create' });
const cliApiRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 120, scope: 'cli-api' });
const cliScanRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 10, scope: 'cli-scan' });
const ciRuntimeIngestRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, scope: 'ci-runtime-ingest' });

router.use('/api', sameOriginApiMiddleware);

router.get('/robots.txt', robotsTxtController);
router.get('/sitemap.xml', sitemapXmlController);
router.get('/ui-test/login', uiTestLoginController);
router.get('/', guestPageMiddleware, landingPageController);
router.get('/terms', legalPlaceholderPageController);
router.get('/privacy', legalPlaceholderPageController);
router.get('/refund-policy', legalPlaceholderPageController);
router.get('/do-not-sell', legalPlaceholderPageController);
router.get('/faqs', faqPageController);
router.get('/contact', contactPageController);
router.get('/checkout', checkoutPageController);
router.get('/demo', demoPageController);
router.get('/demo/:page', demoPageController);

router.get('/dashboard', userPageAuthMiddleware, dashboardController);
router.get('/onboarding', userPageAuthMiddleware, onboardingPageController);
router.get('/repositories', userPageAuthMiddleware, repositoriesPageController);
router.get('/repositories/:repositoryId', userPageAuthMiddleware, repositoryDetailPageController);
router.get('/scans', userPageAuthMiddleware, scansPageController);
router.get('/scans/:scanId', userPageAuthMiddleware, scanDetailPageController);
router.get('/findings', userPageAuthMiddleware, findingsPageController);
router.get('/findings/:findingId', userPageAuthMiddleware, findingDetailPageController);
router.get('/settings', userPageAuthMiddleware, settingsPageController);
router.get('/notifications', userPageAuthMiddleware, notificationsPageController);
router.get('/billing', userPageAuthMiddleware, billingPageController);
router.get('/sign-in', guestPageMiddleware, signInPageController);
router.get('/sign-up', guestPageMiddleware, signUpPageController);
router.get('/forgot-password', guestPageMiddleware, forgotPasswordPageController);
router.get('/reset-password', guestPageMiddleware, resetPasswordPageController);
router.get('/verify-email/pending', guestPageMiddleware, emailVerificationPendingPageController);
router.get('/verify-email', guestPageMiddleware, verifyEmailController);
router.get('/github/install/callback', githubInstallCallbackController);
router.get('/github/install/return', githubInstallCallbackController);
router.post('/api/auth/signup', authRateLimit, signupController);
router.post('/api/auth/email-verification/resend', authRateLimit, resendEmailVerificationController);
router.post('/api/auth/login', authRateLimit, loginController);
router.post('/api/auth/login/otp', otpRateLimit, loginOtpController);
router.get('/api/auth/github', githubLoginStartController);
router.get('/api/auth/github/callback', githubLoginCallbackController);
router.post('/api/auth/password-reset/request', authRateLimit, passwordResetRequestController);
router.post('/api/auth/password-reset/confirm', authRateLimit, passwordResetConfirmController);
router.post('/api/auth/logout', logoutController);
router.post('/api/contact', contactRateLimit, submitContactController);
router.get('/api/pricing', listPublicPricingPlansController);
router.post('/api/ci/runtime/events', ciRuntimeIngestRateLimit, ingestCiRuntimeEventsController);

router.use('/api/cli/v1', cliApiRateLimit, cliAccessTokenAuthMiddleware);
router.get('/api/cli/v1/me', getCliIdentityController);
router.get('/api/cli/v1/repositories', listCliRepositoriesController);
router.post('/api/cli/v1/scans', cliScanRateLimit, submitCliScanController);

router.use('/api/user', userAuthMiddleware);
router.get('/api/user/me', meController);
router.put('/api/user/auth/password', passwordChangeRateLimit, changePasswordController);
router.get('/api/user/auth/:provider/connect-url', getProviderConnectUrlController);
router.get('/api/user/dashboard-summary', getUserDashboardSummaryController);
router.get('/api/user/repositories', listUserRepositoriesController);
router.get('/api/user/repositories/:repositoryId', getUserRepositoryController);
router.get('/api/user/repositories/:repositoryId/runtime-events', listUserRepositoryRuntimeEventsController);
router.get('/api/user/repositories/:repositoryId/checklist', getUserRepositoryChecklistController);
router.post('/api/user/repositories/:repositoryId/scans', enqueueUserRepositoryScanController);
router.get('/api/user/scans', listUserScansController);
router.get('/api/user/scans/:scanId', getUserScanController);
router.get('/api/user/findings', listUserFindingsController);
router.get('/api/user/findings/:findingId', getUserFindingController);
router.patch('/api/user/findings/:findingId', updateUserFindingController);
router.post('/api/user/findings/:findingId/verify', verifyUserFindingController);
router.post('/api/user/findings/:findingId/remediation-pr', createFindingRemediationPrController);
router.post('/api/user/scans/:scanId/baseline', requireOwner, markUserBaselineController);
router.get('/api/user/notifications', listNotificationsController);
router.get('/api/user/notifications/stream', notificationStreamController);
router.patch('/api/user/notifications/:notificationId/read', markNotificationReadController);
router.get('/api/user/alert-channels', listAlertChannelsController);
router.post('/api/user/alert-channels', requireOwner, createAlertChannelController);
router.delete('/api/user/alert-channels/:channelId', requireOwner, deleteAlertChannelController);
router.post('/api/user/alert-channels/:channelId/test', requireOwner, testAlertChannelController);
router.get('/api/user/audit-logs', requireOwner, listAuditLogsController);
router.get('/api/user/cli-tokens', requireOwner, listUserCliAccessTokensController);
router.post('/api/user/cli-tokens', requireOwner, cliTokenCreateRateLimit, createUserCliAccessTokenController);
router.delete('/api/user/cli-tokens/:tokenId', requireOwner, revokeUserCliAccessTokenController);
router.get('/api/user/security-trend', getSecurityTrendController);
router.get('/api/user/billing', getUserBillingController);
router.post('/api/user/billing/paddle-sync', syncUserPaddleCheckoutController);
router.post('/api/user/billing/payment-method/update-link', paymentMethodUpdateRateLimit, createUserPaymentMethodUpdateController);
router.post('/api/user/billing/cancel', cancelUserSubscriptionController);

export {
    router
};
