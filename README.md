# SecureRepos CLI

Run SecureRepos security checks against the tracked files in an approved GitHub repository. Source code stays on the local machine; only redacted findings, dependency coordinates, branch metadata, and scan statistics are sent to SecureRepos.

## Requirements

- Node.js 20 or newer
- Git
- An active SecureRepos subscription
- A connected and approved GitHub repository
- A CLI token generated from SecureRepos Settings

## Install

```bash
npm install --global @securerepos/cli
```

## Authenticate

Generate a short-lived token in SecureRepos Settings, then run:

```bash
securerepos login
```

Paste the token into the hidden prompt. For CI, use `SECUREREPOS_TOKEN` directly instead of saving a local config file.

## Scan

```bash
cd /path/to/approved-repository
securerepos scan
```

Useful options:

```bash
securerepos scan --low-resource
securerepos scan --fail-on critical
securerepos scan --json
```

The default CI exit threshold is `high`. Use `--fail-on none` when findings should not fail the command.

## Security

- Tokens expire after no more than 30 days.
- Only one active CLI token is allowed per account.
- Tokens cannot access account, billing, password, or settings APIs.
- Only Git-tracked text and dependency files are scanned.
- Raw source files and detected secret values are never uploaded.
