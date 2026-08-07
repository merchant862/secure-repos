#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { createHash } = require('crypto');
const { existsSync, readdirSync, readFileSync, statSync } = require('fs');
const { join, relative } = require('path');

const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
const apiUrl = (process.env.SECUREREPOS_API_URL || 'https://securerepos.com').replace(/\/+$/, '');
const token = process.env.SECUREREPOS_RUNTIME_TOKEN || '';
const mode = String(process.env.SECUREREPOS_GUARD_MODE || 'monitor').toLowerCase();
const failSeverity = String(process.env.SECUREREPOS_FAIL_SEVERITY || 'high').toLowerCase();
const allowedHosts = listEnv('SECUREREPOS_ALLOWED_HOSTS');
const blockedHosts = listEnv('SECUREREPOS_BLOCKED_HOSTS');

const commandIndex = process.argv.indexOf('--');
const command = commandIndex >= 0 ? process.argv.slice(commandIndex + 1) : [];

if (command.length === 0) {
    console.error('Usage: node tools/ci-runtime-guard/guard.js -- <command>');
    process.exit(2);
}

if (!process.env.GITHUB_REPOSITORY) {
    console.error('SECUREREPOS runtime guard needs GITHUB_REPOSITORY in the environment.');
    process.exit(2);
}

const baseline = snapshotSensitiveFiles(process.cwd());
const events = [];

detectCommandPatterns(command.join(' '));

const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
});

child.stdout.on('data', function (chunk) {
    const text = String(chunk);
    process.stdout.write(text);
    inspectOutput(text);
});

child.stderr.on('data', function (chunk) {
    const text = String(chunk);
    process.stderr.write(text);
    inspectOutput(text);
});

child.on('close', async function (code) {
    detectSensitiveFileChanges(baseline, snapshotSensitiveFiles(process.cwd()));
    await sendEvents();

    const shouldFail = mode === 'fail'
        && events.some((event) => severityRank[event.severity] >= severityRank[failSeverity]);

    process.exit(shouldFail ? 1 : (code ?? 1));
});

function listEnv(name) {
    return String(process.env[name] || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

function addEvent(eventType, severity, summary, metadata) {
    const fingerprint = createHash('sha256')
        .update([eventType, summary, JSON.stringify(metadata || {})].join(':'))
        .digest('hex')
        .slice(0, 16);

    if (events.some((event) => event.metadata && event.metadata.guardFingerprint === fingerprint)) {
        return;
    }

    events.push({
        repositoryFullName: process.env.GITHUB_REPOSITORY,
        workflowName: process.env.GITHUB_WORKFLOW || null,
        jobName: process.env.GITHUB_JOB || null,
        runId: process.env.GITHUB_RUN_ID || null,
        eventType,
        severity,
        summary,
        metadata: {
            ...metadata,
            guardFingerprint: fingerprint,
            eventName: process.env.GITHUB_EVENT_NAME || null,
            ref: process.env.GITHUB_REF || null,
            sha: process.env.GITHUB_SHA || null
        },
        observedAt: new Date().toISOString()
    });
}

function detectCommandPatterns(commandText) {
    if (/\b(curl|wget)\b[\s\S]{0,160}\|\s*(bash|sh|zsh|python|node|ruby|perl)\b/i.test(commandText)) {
        addEvent(
            'ci.remote-script-execution',
            'high',
            'CI command pipes remote content into an executable runtime.',
            { command: commandText.slice(0, 500) }
        );
    }

    if (/\bchmod\s+\+x\b[\s\S]{0,140}\b(run|install|setup|build)\b/i.test(commandText)) {
        addEvent(
            'ci.dynamic-executable',
            'medium',
            'CI command creates an executable during the job.',
            { command: commandText.slice(0, 500) }
        );
    }
}

function inspectOutput(text) {
    if (/(ghp_|github_pat_|npm_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_)/.test(text)) {
        addEvent(
            'ci.secret-output',
            'critical',
            'CI output appears to contain a credential or private key.',
            { sample: redact(text).slice(0, 500) }
        );
    }

    const urls = text.match(/\bhttps?:\/\/[^\s"'<>]+/gi) || [];
    for (const url of urls.slice(0, 50)) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            if (blockedHosts.includes(host) || blockedHosts.some((item) => host.endsWith(`.${item}`))) {
                addEvent('ci.blocked-network-host', 'high', `CI contacted blocked host ${host}.`, { host });
            }
            else if (allowedHosts.length > 0 && !allowedHosts.includes(host) && !allowedHosts.some((item) => host.endsWith(`.${item}`))) {
                addEvent('ci.unapproved-network-host', 'medium', `CI contacted unapproved host ${host}.`, { host });
            }
        }
        catch {
            // Ignore malformed URLs in logs.
        }
    }
}

function snapshotSensitiveFiles(root) {
    const paths = [
        '.npmrc',
        '.pypirc',
        '.docker/config.json',
        '.git/config',
        '.git/hooks',
        '.github/workflows',
        '.ssh'
    ];
    const snapshot = new Map();

    for (const target of paths) {
        collectFileHashes(root, join(root, target), snapshot);
    }

    return snapshot;
}

function collectFileHashes(root, target, snapshot) {
    if (!existsSync(target)) return;
    const info = statSync(target);
    if (info.isDirectory()) {
        for (const entry of readdirSync(target)) {
            collectFileHashes(root, join(target, entry), snapshot);
        }
        return;
    }

    if (info.isFile() && info.size <= 1024 * 1024) {
        snapshot.set(relative(root, target), createHash('sha256').update(readFileSync(target)).digest('hex'));
    }
}

function detectSensitiveFileChanges(before, after) {
    for (const [path, hash] of after.entries()) {
        if (!before.has(path)) {
            addEvent('ci.sensitive-file-created', 'high', `CI job created sensitive file ${path}.`, { path });
        }
        else if (before.get(path) !== hash) {
            addEvent('ci.sensitive-file-modified', path.includes('.github/workflows') ? 'high' : 'medium', `CI job modified sensitive file ${path}.`, { path });
        }
    }
}

function redact(text) {
    return text
        .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_[redacted]')
        .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_[redacted]')
        .replace(/npm_[A-Za-z0-9]+/g, 'npm_[redacted]')
        .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA[redacted]')
        .replace(/sk_live_[A-Za-z0-9]+/g, 'sk_live_[redacted]');
}

async function sendEvents() {
    if (events.length === 0 || !token) {
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/ci/runtime/events`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ events })
        });

        if (!response.ok) {
            console.error(`SecureRepos runtime guard could not submit events: ${response.status}`);
        }
    }
    catch (error) {
        console.error(`SecureRepos runtime guard could not submit events: ${error.message}`);
    }
}
