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
