# MICRO-SAAS-APP — Codex Project Brief

## Project purpose

This project is a **security-focused micro-SaaS** for small engineering teams.

The product is **GitHub-centric in Phase 1** and is intended to help teams improve their delivery and security posture by focusing on:

- GitHub App installation and repository access
- installation-level repository sync
- webhook ingestion
- security scanning foundations
- future findings / posture / policy engine

The long-term product direction is a **technical B2B security platform** for small SaaS teams, focused on CI/CD and repository security signals.

## Important scope boundary

**Do not work on payment gateway or billing right now.**  
That will be handled later.

Current focus is only:

- backend foundation
- GitHub App integration
- installation persistence
- repository sync
- webhook handling
- future scan pipeline foundation

---

## Current product idea in plain terms

The app will eventually:

1. connect to a user's GitHub account/org via a GitHub App
2. store GitHub installation metadata
3. sync accessible repositories
4. receive GitHub webhooks
5. run security-oriented checks later
6. persist findings
7. show posture/risk information in a dashboard

For now, we are only building the backend foundation needed to make the above possible.

---

## Current stack

### Backend
- Node.js
- TypeScript
- Express.js

### Rendering
- EJS

### Database
- MySQL
- Sequelize ORM
- Sequelize CLI for migrations

### Cache / infra
- Redis

### Architecture style
- modular monolith
- functional-first
- light OOP only where useful for infra/integration adapters

### Deployment style
- single VPS
- no Kubernetes
- no microservices right now
- future microservice-ready structure

---

## Frontend / admin theme reference

Frontend is **not the focus right now**, but when UI work happens, use:

**CoreUI Free Bootstrap Admin Template**

Reason:
- free
- suitable for admin dashboards
- acceptable for a SaaS backend/admin interface
- Bootstrap-based, so easy to integrate into EJS

For now:
- no serious frontend work
- no design iteration
- only backend-oriented endpoints and services
- UI/theme can be integrated later

---

## Coding style rules

Use these rules consistently:

- TypeScript
- Express.js
- EJS
- Sequelize
- MySQL
- Redis

### Brace style
Use **Allman style**:

```ts
function example()
{
}
```

Do **not** use:

```ts
function example(){
}
```

### General code style
- keep controllers thin
- put business logic in services/modules
- prefer functions over heavy class hierarchies
- use explicit names
- avoid giant files
- keep code readable and maintainable
- do not introduce unnecessary abstraction

### Architecture rules
- controllers handle request/response only
- services contain business logic
- DB writes should happen through service layer, not controllers directly
- GitHub integration logic belongs in `src/modules/github`
- models stay in `src/db/models`
- migrations are required for schema changes
- do not use sync-based schema management as the main workflow

---

## Folder structure

Current structure is conceptually like this:

```text
src/
  app/
    app.ts
    routes.ts
    controllers/
      web/
      webhook/
    middlewares/
    services/
  bootstrap/
    env.ts
    database.ts
    redis.ts
  db/
    sequelize.ts
    models/
      user.model.ts
      tenant.model.ts
      github-installation.model.ts
      repository.model.ts
      index.ts
    migrations/
    seeders/
    config/
  modules/
    github/
      github.config.ts
      github.types.ts
      github.service.ts
      github-installation.service.ts
      github-repository-sync.service.ts
  main/
    start-web.ts
    start-worker.ts
    start-scheduler.ts
  public/
  views/
tests/
```

---

## Current completed work

The following is already conceptually in place or has been scaffolded:

### Project foundation
- Node.js project scaffolded
- TypeScript configured
- Express app structure created
- EJS structure created
- Git repo initialized
- `main` and `dev` branches created

### Database and infra
- MySQL connection scaffolded
- Sequelize configured
- Sequelize CLI configured
- Redis configured
- migrations flow introduced

### Database tables / models
Current tables/models include:
- `tenants`
- `users`
- `github_installations`
- `repositories`

### Health and base routes
- `/health`
- `/github/install/callback`
- `/webhooks/github`

### GitHub module foundation
- GitHub config support exists
- GitHub service exists
- private key reader planned / implemented
- webhook signature verification foundation exists
- installation persistence service started
- repository sync service started

---

## Remaining work

This is the most important part for Codex.

### Immediate next backend tasks

1. **Fix and verify install callback persistence**
   - ensure `/github/install/callback` uses the current service-based controller
   - confirm row is inserted/updated in `github_installations`
   - confirm env loading for GitHub App values works correctly

2. **Verify GitHub App credentials end-to-end**
   - confirm `GITHUB_APP_ID`
   - confirm `GITHUB_APP_SLUG`
   - confirm `GITHUB_WEBHOOK_SECRET`
   - confirm private key file path
   - confirm JWT generation works
   - confirm installation access token request works

3. **Finish repository sync flow**
   - use installation access token
   - call GitHub installation repositories API
   - upsert rows into `repositories`
   - later handle inactive repositories

4. **Stabilize webhook ingestion**
   - raw body capture
   - signature verification
   - event parsing
   - future idempotency support

5. **Testing setup**
   - fix Vitest config and path issues
   - add route tests for:
     - `/health`
     - `/github/install/callback`
     - `/webhooks/github`

---

## Planned next milestones after that

### Milestone 1
GitHub installation flow fully working:
- app installed
- callback received
- installation saved in DB

### Milestone 2
Repository sync working:
- installation token generated
- repos fetched from GitHub
- repos stored in DB

### Milestone 3
Webhook processing baseline:
- installation / repository / push events received
- verified
- normalized

### Milestone 4
Security scanning foundation:
- first scan module(s)
- findings persistence
- normalized findings model

### Milestone 5
Policy / posture layer:
- severity
- scoring
- summary generation

### Milestone 6
Dashboard integration with CoreUI Free theme

---

## GitHub App configuration notes

The project uses a GitHub App.

Expected environment variables:

```env
PORT=3000
APP_NAME=MICRO-SAAS-APP

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=micro_saas
DB_USER=root
DB_PASS=

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

GITHUB_APP_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
GITHUB_PRIVATE_KEY_PATH=storage/keys/github-app.pem
GITHUB_APP_SLUG=micro-saas-app
```

### Notes
- `GITHUB_PRIVATE_KEY_PATH` points to a local `.pem` file
- private key file must **not** be committed
- `.env` must **not** be committed
- `storage/keys/` should be gitignored

---

## Important git / security rules

Do not commit:
- `.env`
- `storage/keys/`
- private key files
- secrets
- client secret
- webhook secret

Recommended `.gitignore` includes:
- `node_modules/`
- `dist/`
- `.env`
- `storage/keys/`

---

## Current known issue areas

Codex should be aware that these may need attention:

1. install callback may still be wired to an old placeholder controller
2. `GITHUB_APP_ID` / env loading may still need verification
3. test configuration may need cleanup because of TypeScript / Vitest path issues
4. app build output path may differ depending on `tsconfig` root settings
5. repository sync needs a real GitHub installation row before it can work

---

## Priority order for coding

When continuing this project, work in this order:

1. fix install callback persistence
2. verify GitHub env / credentials loading
3. test JWT generation
4. test installation access token flow
5. sync repositories into DB
6. stabilize webhooks
7. improve tests
8. then move toward findings/scanning

Do **not** jump into payment gateway or billing.

---

## What Codex should optimize for

Codex should optimize for:
- backend correctness
- clarity
- maintainability
- incremental progress
- minimal overengineering
- architecture consistency

Codex should avoid:
- heavy frontend work
- payment features
- unnecessary frameworks
- unnecessary class hierarchies
- unrequested UI redesigns
- changing code style away from Allman braces

---

## Summary

This project is a **GitHub-centric, security-focused micro-SaaS**.

The immediate goal is to complete:
- GitHub App installation persistence
- repository sync
- webhook ingestion foundation

The longer-term goal is:
- scan repositories and related GitHub signals
- generate findings
- compute posture/risk
- display results in a dashboard using CoreUI Free later

Backend first.  
Payment later.  
Frontend/theme later.
