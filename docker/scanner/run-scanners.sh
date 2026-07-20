#!/usr/bin/env bash
set -u

repo_dir="${REPO_DIR:-/workspace/repo}"
out_dir="${OUT_DIR:-/workspace/out}"
timeout_seconds="${SCANNER_TIMEOUT_SECONDS:-600}"

mkdir -p "$out_dir"

run_json()
{
    local name="$1"
    shift

    local output="$out_dir/${name}.json"
    local log="$out_dir/${name}.log"

    if timeout "$timeout_seconds" "$@" >"$output" 2>"$log"; then
        printf '{"scanner":"%s","status":"completed"}\n' "$name" >"$out_dir/${name}.status.json"
    else
        local exit_code="$?"
        printf '{"scanner":"%s","status":"failed","exitCode":%s}\n' "$name" "$exit_code" >"$out_dir/${name}.status.json"
        if [ ! -s "$output" ]; then
            printf '{}\n' >"$output"
        fi
    fi
}

cd "$repo_dir" || exit 2

run_json semgrep semgrep scan --config auto --json --metrics off --oss-only "$repo_dir"
run_json gitleaks gitleaks detect --source "$repo_dir" --no-git --redact --report-format json --report-path /dev/stdout
run_json trufflehog trufflehog filesystem "$repo_dir" --json --no-update
run_json osv osv-scanner scan --format json "$repo_dir"
run_json trivy trivy fs --format json --scanners vuln,secret,misconfig --skip-db-update=false "$repo_dir"
run_json checkov checkov --directory "$repo_dir" --output json --quiet
run_json syft syft "$repo_dir" -o syft-json
run_json grype grype "dir:$repo_dir" -o json

printf '{"status":"completed"}\n' >"$out_dir/scan.status.json"
