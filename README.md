# Secure Repos

Secure Repos is a focused security dashboard for independent GitHub developers. It connects through a GitHub App, scans selected repositories, and helps users review exposed secrets, risky CI/CD settings, weak configurations, dependency concerns, and repository security workflow gaps with clearer remediation context.

Built for founders, agencies, and small teams that want practical repository security without enterprise complexity.

## Requirements

- Node.js
- MySQL
- GitHub App credentials
- Resend credentials if email delivery is enabled

## Setup

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and set the database, app URL, GitHub App, token encryption, and email values.

Run migrations with the existing Sequelize setup, then build:

```bash
npm run build
```

Start the web app:

```bash
npm start
```

## Admin Setup

Admins are not created from public or authenticated APIs. Admin accounts must be created from the seed command only.

Create the first admin:

```bash
npm run build

npm run seed:admin -- \
  --name "Saif Ali" \
  --email "admin@example.com" \
  --password "StrongPassword123!"
```

Update an existing admin with the same email:

```bash
npm run seed:admin -- \
  --name "Saif Ali" \
  --email "admin@example.com" \
  --password "NewStrongPassword123!" \
  --status "active" \
  --update
```

Seeder options:

```txt
--name       Admin display name. Required.
--email      Admin email address. Required.
--password   Admin password. Required.
--status     Admin status. Default: active.
--update     Update an existing admin with the same email.
--help       Show usage.
```

Removed admin creation APIs:

```txt
POST /api/admin/auth/bootstrap
POST /api/admin/admins
```

Admin login remains API-based:

```txt
POST /api/admin/auth/login
```

Admin UI routes:

```txt
/admin/sign-in
/admin/overview
/admin/pricing
/admin/provider
/admin/settings
```

The admin panel can manage pricing plans, tenant plan assignments from overview, and provider settings. Admin creation and password changes remain seed-only.

Tenant, repository, scan, and critical finding admin APIs return cursor pagination metadata:

```json
{
  "data": [],
  "pagination": {
    "limit": 25,
    "nextCursor": null
  },
  "total": 0
}
```

## Local GitHub App Testing

For local browser callback testing with Apache reverse proxy:

```txt
Homepage URL: https://secure-repos.test
Callback URL: https://secure-repos.test/github/install/callback
Setup URL: https://secure-repos.test/github/install/return
```

The Setup URL is the important post-install redirect for GitHub App installation. Without it, GitHub can leave the user on the GitHub App page after install.

The local host-file domain is not reachable by GitHub servers, so GitHub webhook delivery will not work directly with `secure-repos.test`. For local webhook testing, send the payload manually:

```txt
POST https://secure-repos.test/webhooks/github
```

For real GitHub webhook delivery, use a public HTTPS domain:

```txt
https://your-live-domain.com/webhooks/github
```

## Authenticated Pages

These pages require a user session:

```txt
/dashboard
/onboarding
/repositories
/findings
/settings
/notifications
/billing
```

The `/demo` route stays public and uses demo data.

## Verification

```bash
npm run build
npm test
```

## CI/CD Deployment

GitHub Actions deploys `main` only after the package passes build, tests, production dependency audit, and OSV dependency scanning.

Add these repository secrets before enabling production deployment:

```txt
VPS_HOST              # VPS IP or hostname
VPS_PORT              # SSH port, optional; defaults to 22
VPS_USER              # SSH username
VPS_PASSWORD          # SSH password
VPS_APP_DIR           # Absolute path to this app on the VPS
VPS_RESTART_COMMAND   # Optional; defaults to npm run pm2:reload
```

The VPS deploy step runs:

```bash
git fetch origin main
git pull --ff-only origin main
npm ci
npm run build
npx sequelize-cli db:migrate
npm run pm2:reload
```

Set `VPS_RESTART_COMMAND` if the server uses a different process manager.
