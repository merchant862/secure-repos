import { Router } from 'express';
import { dashboardController } from './controllers/web/dashboard.controller';
import { healthController } from './controllers/web/health.controller';
import { githubInstallCallbackController } from './controllers/web/github-install.controller';
import { githubInstallStartController } from './controllers/web/github-install-start.controller';
import { githubInstallationListController } from './controllers/web/github-installation-list.controller';
import { githubAuthDebugController } from './controllers/web/github-auth-debug.controller';
import { githubRepositorySyncController } from './controllers/web/github-repository-sync.controller';
import { githubRepositoryListController } from './controllers/web/github-repository-list.controller';
import { repositoryScanController } from './controllers/web/repository-scan.controller';
import { repositoryFindingsController } from './controllers/web/repository-findings.controller';
import { webhookDeliveryListController } from './controllers/web/webhook-delivery-list.controller';
import { securityBulkScanController, securityOverviewController } from './controllers/web/security-overview.controller';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

router.get('/', function (req, res)
{
    return res.redirect('/dashboard');
});

router.get('/dashboard', dashboardController);
router.get('/health', healthController);
router.get('/github/install', githubInstallStartController);
router.get('/github/install/callback', githubInstallCallbackController);
router.get('/github/installations', githubInstallationListController);

if (!isProduction)
{
    router.get('/github/auth/debug', githubAuthDebugController);
}

router.post('/github/repositories/sync', githubRepositorySyncController);
router.get('/github/repositories', githubRepositoryListController);
router.get('/webhooks/github/deliveries', webhookDeliveryListController);
router.post('/repositories/:repositoryId/scan', repositoryScanController);
router.get('/repositories/:repositoryId/findings', repositoryFindingsController);
router.get('/security/overview', securityOverviewController);
router.post('/security/scan-all', securityBulkScanController);

export {
    router
};
