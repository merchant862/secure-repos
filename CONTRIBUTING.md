# Contributing

SecureRepos changes should be small, reviewable, and backed by tests.

## Local Checks

Run these before committing:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

For coverage:

```bash
npm run test:coverage
```

## Commit Shape

- Keep each feature or fix in its own commit.
- Include tests for new behavior and regressions.
- Avoid mixing formatting-only changes with feature work.
- Update `.env.example` and README when a change introduces a new setting or setup step.

## Security Notes

- Never commit real secrets, access tokens, private keys, or customer repository data.
- Use placeholders in docs and tests.
- Keep scanner output and temporary repository workspaces out of git.
