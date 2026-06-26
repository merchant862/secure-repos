import { Sequelize } from 'sequelize';

import { User, initUserModel } from './user.model';
import { UserSession, initUserSessionModel } from './user-session.model';
import { Tenant, initTenantModel } from './tenant.model';
import { GithubInstallation, initGithubInstallationModel } from './github-installation.model';
import { CodeHostConnection, initCodeHostConnectionModel } from './code-host-connection.model';
import { Repository, initRepositoryModel } from './repository.model';
import { Scan, initScanModel } from './scan.model';
import { Finding, initFindingModel } from './finding.model';
import { GithubWebhookEvent, initGithubWebhookEventModel } from './github-webhook-event.model';
import { PricingPlan, initPricingPlanModel } from './pricing-plan.model';
import { PricingPlanFeature, initPricingPlanFeatureModel } from './pricing-plan-feature.model';
import { TenantSubscription, initTenantSubscriptionModel } from './tenant-subscription.model';
import { NotificationEvent, initNotificationEventModel } from './notification-event.model';
import { AuditLog, initAuditLogModel } from './audit-log.model';
import { IgnoreRule, initIgnoreRuleModel } from './ignore-rule.model';
import { NotificationSetting, initNotificationSettingModel } from './notification-setting.model';
import { InAppNotification, initInAppNotificationModel } from './in-app-notification.model';
import { SecurityScoreSnapshot, initSecurityScoreSnapshotModel } from './security-score-snapshot.model';
import { LoginOtp, initLoginOtpModel } from './login-otp.model';
import { Admin, initAdminModel } from './admin.model';
import { AdminSession, initAdminSessionModel } from './admin-session.model';
import { ProviderSetting, initProviderSettingModel } from './provider-setting.model';
import { ProviderOauthState, initProviderOauthStateModel } from './provider-oauth-state.model';
import { FindingOccurrence, initFindingOccurrenceModel } from './finding-occurrence.model';
import { PasswordResetToken, initPasswordResetTokenModel } from './password-reset-token.model';

function initModels(sequelize: Sequelize)
{
    initTenantModel(sequelize);
    initUserModel(sequelize);
    initUserSessionModel(sequelize);
    initGithubInstallationModel(sequelize);
    initCodeHostConnectionModel(sequelize);
    initRepositoryModel(sequelize);
    initScanModel(sequelize);
    initFindingModel(sequelize);
    initGithubWebhookEventModel(sequelize);
    initPricingPlanModel(sequelize);
    initPricingPlanFeatureModel(sequelize);
    initTenantSubscriptionModel(sequelize);
    initNotificationEventModel(sequelize);
    initAuditLogModel(sequelize);
    initIgnoreRuleModel(sequelize);
    initNotificationSettingModel(sequelize);
    initInAppNotificationModel(sequelize);
    initSecurityScoreSnapshotModel(sequelize);
    initLoginOtpModel(sequelize);
    initAdminModel(sequelize);
    initAdminSessionModel(sequelize);
    initProviderSettingModel(sequelize);
    initProviderOauthStateModel(sequelize);
    initFindingOccurrenceModel(sequelize);
    initPasswordResetTokenModel(sequelize);

    Tenant.hasMany(User, {
        foreignKey: 'tenantId',
        as: 'users'
    });

    User.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    User.hasMany(UserSession, {
        foreignKey: 'userId',
        as: 'sessions'
    });

    UserSession.belongsTo(User, {
        foreignKey: 'userId',
        as: 'user'
    });

    User.hasMany(LoginOtp, {
        foreignKey: 'userId',
        as: 'loginOtps'
    });

    LoginOtp.belongsTo(User, {
        foreignKey: 'userId',
        as: 'user'
    });

    User.hasMany(PasswordResetToken, {
        foreignKey: 'userId',
        as: 'passwordResetTokens'
    });

    PasswordResetToken.belongsTo(User, {
        foreignKey: 'userId',
        as: 'user'
    });

    Admin.hasMany(AdminSession, {
        foreignKey: 'adminId',
        as: 'sessions'
    });

    AdminSession.belongsTo(Admin, {
        foreignKey: 'adminId',
        as: 'admin'
    });

    Tenant.hasMany(GithubInstallation, {
        foreignKey: 'tenantId',
        as: 'githubInstallations'
    });

    GithubInstallation.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    GithubInstallation.hasMany(Repository, {
        foreignKey: 'githubInstallationId',
        as: 'repositories'
    });

    Repository.belongsTo(GithubInstallation, {
        foreignKey: 'githubInstallationId',
        as: 'githubInstallation'
    });

    Tenant.hasMany(CodeHostConnection, {
        foreignKey: 'tenantId',
        as: 'codeHostConnections'
    });

    CodeHostConnection.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    CodeHostConnection.hasMany(Repository, {
        foreignKey: 'codeHostConnectionId',
        as: 'repositories'
    });

    Repository.belongsTo(CodeHostConnection, {
        foreignKey: 'codeHostConnectionId',
        as: 'codeHostConnection'
    });

    Tenant.hasMany(Scan, {
        foreignKey: 'tenantId',
        as: 'scans'
    });

    Scan.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Repository.hasMany(Scan, {
        foreignKey: 'repositoryId',
        as: 'scans'
    });

    Scan.belongsTo(Repository, {
        foreignKey: 'repositoryId',
        as: 'repository'
    });

    Scan.hasMany(Finding, {
        foreignKey: 'scanId',
        as: 'findings'
    });

    Finding.belongsTo(Scan, {
        foreignKey: 'scanId',
        as: 'scan'
    });

    Repository.hasMany(Finding, {
        foreignKey: 'repositoryId',
        as: 'findings'
    });

    Finding.belongsTo(Repository, {
        foreignKey: 'repositoryId',
        as: 'repository'
    });

    PricingPlan.hasMany(PricingPlanFeature, {
        foreignKey: 'pricingPlanId',
        as: 'features'
    });

    PricingPlanFeature.belongsTo(PricingPlan, {
        foreignKey: 'pricingPlanId',
        as: 'pricingPlan'
    });

    Tenant.hasOne(TenantSubscription, {
        foreignKey: 'tenantId',
        as: 'subscription'
    });

    TenantSubscription.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    PricingPlan.hasMany(TenantSubscription, {
        foreignKey: 'pricingPlanId',
        as: 'subscriptions'
    });

    TenantSubscription.belongsTo(PricingPlan, {
        foreignKey: 'pricingPlanId',
        as: 'pricingPlan'
    });

    Tenant.hasMany(NotificationEvent, {
        foreignKey: 'tenantId',
        as: 'notificationEvents'
    });

    NotificationEvent.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Tenant.hasMany(AuditLog, {
        foreignKey: 'tenantId',
        as: 'auditLogs'
    });

    AuditLog.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    User.hasMany(AuditLog, {
        foreignKey: 'userId',
        as: 'auditLogs'
    });

    AuditLog.belongsTo(User, {
        foreignKey: 'userId',
        as: 'user'
    });

    Tenant.hasMany(IgnoreRule, {
        foreignKey: 'tenantId',
        as: 'ignoreRules'
    });

    IgnoreRule.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Tenant.hasOne(NotificationSetting, {
        foreignKey: 'tenantId',
        as: 'notificationSetting'
    });

    NotificationSetting.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Tenant.hasMany(InAppNotification, {
        foreignKey: 'tenantId',
        as: 'inAppNotifications'
    });

    InAppNotification.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Tenant.hasMany(SecurityScoreSnapshot, {
        foreignKey: 'tenantId',
        as: 'securityScoreSnapshots'
    });

    SecurityScoreSnapshot.belongsTo(Tenant, {
        foreignKey: 'tenantId',
        as: 'tenant'
    });

    Repository.hasMany(SecurityScoreSnapshot, {
        foreignKey: 'repositoryId',
        as: 'securityScoreSnapshots'
    });

    SecurityScoreSnapshot.belongsTo(Repository, {
        foreignKey: 'repositoryId',
        as: 'repository'
    });
}

export 
{
    User,
    UserSession,
    Tenant,
    GithubInstallation,
    CodeHostConnection,
    Repository,
    Scan,
    Finding,
    GithubWebhookEvent,
    PricingPlan,
    PricingPlanFeature,
    TenantSubscription,
    NotificationEvent,
    AuditLog,
    IgnoreRule,
    NotificationSetting,
    InAppNotification,
    SecurityScoreSnapshot,
    LoginOtp,
    Admin,
    AdminSession,
    ProviderSetting,
    ProviderOauthState,
    FindingOccurrence,
    PasswordResetToken,
    initModels
};
