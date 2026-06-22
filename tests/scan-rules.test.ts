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
