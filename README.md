# Secure Repos

Secure Repos is a focused security dashboard for GitHub teams. It connects through a GitHub App, scans selected repositories, and helps teams review exposed secrets, risky CI/CD settings, weak configurations, dependency concerns, and repository security workflow gaps.

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

Create a non-super admin:

```bash
npm run seed:admin -- \
  --name "Admin User" \
  --email "admin2@example.com" \
  --password "StrongPassword123!" \
  --role "admin"
```

Update an existing admin with the same email:

```bash
npm run seed:admin -- \
  --name "Saif Ali" \
  --email "admin@example.com" \
  --password "NewStrongPassword123!" \
  --role "super_admin" \
  --status "active" \
  --update
```

Seeder options:

```txt
--name       Admin display name. Required.
--email      Admin email address. Required.
--password   Admin password. Required.
--role       Admin role. Default: super_admin.
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
/admin/tenants
/admin/repositories
/admin/scans
/admin/provider
/admin/admins
```

The admin panel can manage pricing plans, tenants, repositories, scans, provider settings, and existing admin name/role/status values. Admin creation and password changes remain seed-only.

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
/reports
/team
/settings
/notifications
/billing
/profile
/pricing
```

The `/demo` route stays public and uses demo data.

## Verification

```bash
npm run build
npm test
```
