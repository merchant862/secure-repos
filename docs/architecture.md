# Architecture

SecureRepos is an Express and TypeScript application that keeps web pages, API controllers, domain services, and Sequelize models separate.

## Runtime Processes

- Web process: serves public pages, authenticated dashboard pages, REST APIs, GitHub webhooks, Paddle webhooks, and health checks.
- Scan worker: polls queued scans, pulls approved GitHub repository content, runs repository checks, persists findings, and schedules notifications.
- Scheduler: queues recurring scans according to plan limits.
- Email and notification workers: deliver login OTPs, billing events, scan summaries, security alerts, and operational notifications.

## Request Flow

1. Routes in `src/app/routes.ts` map public pages, authenticated pages, user APIs, CLI APIs, and webhooks.
2. Controllers validate request shape, authentication state, ownership, and plan constraints.
3. Services hold product behavior such as scanning, billing sync, CLI access tokens, remediation PRs, and security posture scoring.
4. Sequelize models persist tenants, users, repositories, scans, findings, subscriptions, notifications, and audit logs.

## Security Boundaries

- GitHub access is scoped through the GitHub App installation and selected repositories.
- CLI and MCP tokens are short lived and cannot access account settings, billing, or password APIs.
- Webhook handlers verify provider signatures before processing events.
- Repository scanner workspaces are temporary and are deleted after parsed results are persisted.
- Payment method collection happens through Paddle-hosted checkout, not SecureRepos forms.

## Deployment Shape

The app is designed to run on a single VPS with separate PM2 processes for the web server, scan worker, scheduler, email workers, notification worker, and scanner container lifecycle. The root `Dockerfile` and `docker-compose.yml` provide a self-contained local run path for fresh-clone verification.
