# SecureRepos CI Runtime Guard

This is the single-runner CI guard for SecureRepos. It wraps a CI command, watches for high-risk runtime signals, and reports those events back to SecureRepos.

## GitHub Actions usage

```yaml
- name: Guarded test run
  run: node tools/ci-runtime-guard/guard.js -- npm test
  env:
    SECUREREPOS_RUNTIME_TOKEN: ${{ secrets.SECUREREPOS_RUNTIME_TOKEN }}
    SECUREREPOS_GUARD_MODE: monitor
```

Use `SECUREREPOS_GUARD_MODE=fail` when the job should fail on high or critical runtime events.

## Optional controls

- `SECUREREPOS_ALLOWED_HOSTS`: comma-separated host allowlist. Any other observed URL host is reported as medium severity.
- `SECUREREPOS_BLOCKED_HOSTS`: comma-separated host blocklist. Matching observed URL hosts are reported as high severity.
- `SECUREREPOS_FAIL_SEVERITY`: `critical`, `high`, `medium`, or `low`. Default is `high`.

The guard intentionally uses Node built-ins only so it stays lightweight on Linux, macOS, and Windows runners.
