import { scanFiles } from '../src/app/services/scan-rules.service';

describe('Scanner sample path handling', function ()
{
    it('should suppress low-confidence key file findings in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/ca.pem',
                    content: '-----BEGIN CERTIFICATE-----\nMIIDexample\n-----END CERTIFICATE-----'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'repo.key-file-committed')).toBe(false);
    });

    it('should suppress generic secret assignments in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/constructor.php',
                    content: '$api_key = "example_api_key_value_123456";'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'secret.generic-assignment')).toBe(false);
    });

    it('should still report high-confidence secrets in example folders', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'examples/private.key',
                    content: '-----BEGIN PRIVATE KEY-----\nreal-looking-private-key\n-----END PRIVATE KEY-----'
                },
                {
                    path: 'examples/config.js',
                    content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456";'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'secret.private-key')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'secret.github-token')).toBe(true);
    });
});

describe('Scanner code-risk rules', function ()
{
    it('should flag risky JavaScript command execution helpers', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'src/server.js',
                    content: 'const cp = require("child_process");\ncp.exec(req.query.command);'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'code.node-command-execution')).toBe(true);
    });

    it('should flag PHP command execution near request input', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'public/run.php',
                    content: '<?php $cmd = $_GET["cmd"]; system($cmd);'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'code.php-user-input-command')).toBe(true);
    });

    it('should flag Python subprocess shell mode', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'tools/build.py',
                    content: 'import subprocess\nsubprocess.run("make " + target, shell=True)'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'code.python-subprocess-shell')).toBe(true);
    });

    it('should flag lightweight command execution patterns across additional languages', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'cmd/server/main.go',
                    content: 'package main\nimport "os/exec"\nfunc main(){ exec.Command("sh", "-c", input) }'
                },
                {
                    path: 'src/job.rs',
                    content: 'use std::process::Command;\nfn run(){ Command::new("sh").arg("-c").arg(value); }'
                },
                {
                    path: 'scripts/deploy.lua',
                    content: 'os.execute(user_command)'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'code.go-command-execution')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'code.rust-command-execution')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'code.lua-command-execution')).toBe(true);
    });
});

describe('Scanner expanded security rules', function ()
{
    it('should flag high-entropy secret-like assignments', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'src/config.ts',
                    content: 'const apiSecret = "nN8zQ4X3mP9vT2kL7rA6sD5fG1hJ0qW8yU4iO2pZ";'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'secret.high-entropy-assignment')).toBe(true);
    });

    it('should flag dependency versions with known risk guidance', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'package.json',
                    content: JSON.stringify({ dependencies: { lodash: '4.17.20', minimist: '^1.2.5' } })
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'dependency.outdated-vulnerable-version')).toBe(true);
    });

    it('should flag framework and auth configuration risks', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'src/app.ts',
                    content: 'import express from "express";\nconst app = express();\napp.use(cors({ origin: "*" }));\njwt.sign(user, "short");'
                },
                {
                    path: 'project/settings.py',
                    content: 'DEBUG = True\nALLOWED_HOSTS = ["*"]'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'framework.express-missing-helmet')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'auth.permissive-cors')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'auth.weak-jwt-secret')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'framework.django-debug-enabled')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'framework.django-wildcard-hosts')).toBe(true);
    });

    it('should flag infrastructure as code risk patterns', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'infra/main.tf',
                    content: 'resource "aws_security_group_rule" "ssh" { cidr_blocks = ["0.0.0.0/0"] }'
                },
                {
                    path: 'k8s/deployment.yaml',
                    content: 'kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - securityContext:\n          privileged: true'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'iac.terraform-open-cidr')).toBe(true);
        expect(findings.some((finding) => finding.ruleId === 'iac.kubernetes-privileged-container')).toBe(true);
    });

    it('should flag auth-sensitive business logic review notes', function ()
    {
        const findings = scanFiles(
            [
                {
                    path: 'src/auth/password-reset.ts',
                    content: '// TODO temporary bypass for reset token validation before launch'
                }
            ]
        );

        expect(findings.some((finding) => finding.ruleId === 'business.auth-sensitive-todo')).toBe(true);
    });
});
