# SecureRepos MCP

SecureRepos MCP lets local AI coding agents inspect approved GitHub repositories through SecureRepos. It can list the account's approved repositories and run the same local-first repository scan used by SecureRepos CLI.

Source code stays on the user's machine. The server syncs scan metadata, redacted findings, dependency coordinates, branch metadata, and scan statistics to SecureRepos.

## Requirements

- Node.js 20 or newer
- Git
- An active SecureRepos Pro subscription
- A connected and approved GitHub repository
- A SecureRepos CLI token generated from Settings

## Install

```bash
npm install --global @securerepos/mcp
```

Or run it through `npx` from your MCP client config.

## MCP Client Config

```json
{
  "mcpServers": {
    "securerepos": {
      "command": "npx",
      "args": ["@securerepos/mcp"],
      "env": {
        "SECUREREPOS_TOKEN": "srp_cli_your_token_here"
      }
    }
  }
}
```

For global installs, use:

```json
{
  "mcpServers": {
    "securerepos": {
      "command": "securerepos-mcp",
      "env": {
        "SECUREREPOS_TOKEN": "srp_cli_your_token_here"
      }
    }
  }
}
```

`SECUREREPOS_API_KEY` is also accepted for MCP clients that prefer API-key naming, but the token is the same short-lived SecureRepos CLI token from Settings.

## Tools

- `get_identity` - shows the SecureRepos account, workspace, token expiry, and token scopes.
- `list_repositories` - lists GitHub repositories approved in SecureRepos.
- `scan_current_repository` - scans Git-tracked files in the current local repository and syncs the result to SecureRepos.

`scan_current_repository` accepts:

```json
{
  "path": "/path/to/repo",
  "repository": "owner/name",
  "lowResource": true,
  "maxFiles": 750
}
```

`path` and `repository` are optional. If `repository` is provided, it must match the repository's GitHub origin remote.

## Security

- Tokens expire after no more than 30 days.
- Only one active token is allowed per account.
- Tokens cannot access account, billing, password, or settings APIs.
- Tokens can only list approved repositories and submit scan results.
- Only approved GitHub repositories can be scanned.
- Only Git-tracked text and dependency files are scanned.
- Raw source files and detected secret values are never uploaded.
