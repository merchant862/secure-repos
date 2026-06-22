import crypto from 'crypto';

type RepositoryFile =
{
    path: string;
    content: string;
};

type ScannerFinding =
{
    ruleId: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    remediation: string;
    filePath: string;
    lineNumber: number | null;
    fingerprint: string;
    metadata?: object;
};

type SecretRule =
{
    ruleId: string;
    severity: ScannerFinding['severity'];
    title: string;
    remediation: string;
    pattern: RegExp;
};

const secretRules: SecretRule[] =
[
    {
        ruleId: 'secret.aws-access-key',
        severity: 'critical',
        title: 'Possible AWS access key exposed',
        remediation: 'Immediately rotate the AWS access key, remove it from git history, and move credentials into a secrets manager or environment variables.',
        pattern: /AKIA[0-9A-Z]{16}/g
    },
    {
        ruleId: 'secret.github-token',
        severity: 'critical',
        title: 'Possible GitHub token exposed',
        remediation: 'Revoke the GitHub token, generate a new token with minimum required scopes, and store it outside the repository.',
        pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g
    },
    {
        ruleId: 'secret.private-key',
        severity: 'critical',
        title: 'Private key material committed',
        remediation: 'Revoke or replace the private key, remove it from the repository history, and store key material in secure secret storage.',
        pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
    },
    {
        ruleId: 'secret.stripe-secret',
        severity: 'critical',
        title: 'Possible Stripe secret key exposed',
        remediation: 'Rotate the Stripe secret key from the Stripe dashboard and move it to server-side environment configuration.',
        pattern: /sk_(live|test)_[A-Za-z0-9]{16,}/g
    },
    {
        ruleId: 'secret.slack-token',
        severity: 'high',
        title: 'Possible Slack token exposed',
        remediation: 'Revoke the Slack token, review installed app scopes, and store the replacement token in a secure secret manager.',
        pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/g
    },
    {
        ruleId: 'secret.google-api-key',
        severity: 'high',
        title: 'Possible Google API key exposed',
        remediation: 'Restrict or rotate the Google API key and enforce application, domain, or IP restrictions in Google Cloud.',
        pattern: /AIza[0-9A-Za-z_-]{35}/g
    },
    {
        ruleId: 'secret.generic-assignment',
        severity: 'medium',
        title: 'Possible hardcoded secret assignment',
        remediation: 'Move hardcoded secret-like values to environment variables or a secret manager and rotate them if they were real credentials.',
        pattern: /\b(api[_-]?key|secret|password|token|client[_-]?secret)\b\s*[:=]\s*['"][^'"\n]{12,}['"]/gi
    },
    {
        ruleId: 'secret.database-url',
        severity: 'high',
        title: 'Possible database connection URL exposed',
        remediation: 'Rotate the database credentials and move connection strings to protected environment configuration.',
        pattern: /\b(mysql|postgres|postgresql|mongodb|redis):\/\/[^ \n'"]{12,}/gi
    },
    {
        ruleId: 'secret.npm-token',
        severity: 'critical',
        title: 'Possible npm token exposed',
        remediation: 'Revoke the npm token, audit package publishing permissions, and use CI secret storage for npm authentication.',
        pattern: /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*[A-Za-z0-9_\-]{20,}/g
    },
    {
        ruleId: 'secret.jwt-secret',
        severity: 'high',
        title: 'Possible JWT secret exposed',
        remediation: 'Rotate the JWT/session secret and store the replacement in environment configuration or a secret manager.',
        pattern: /\b(jwt[_-]?secret|session[_-]?secret)\b\s*[:=]\s*['"][^'"\n]{12,}['"]/gi
    }
];

const dangerousPackages = new Set(
    [
        'event-stream',
        'flatmap-stream',
        'coa',
        'rc',
        'node-ipc'
    ]
);

const samplePathSegments = new Set(
    [
        'example',
        'examples',
        'demo',
        'demos',
        'sample',
        'samples',
        'fixture',
        'fixtures',
        '__fixtures__',
        'test',
        'tests',
        'stub',
        'stubs',
        'mock',
        'mocks'
    ]
);

const sampleSuppressedRules = new Set(
    [
        'repo.key-file-committed',
        'secret.generic-assignment'
    ]
);

const highConfidenceSecretPatterns =
[
    /AKIA[0-9A-Z]{16}/,
    /gh[pousr]_[A-Za-z0-9_]{36,255}/,
    /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /sk_(live|test)_[A-Za-z0-9]{16,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /AIza[0-9A-Za-z_-]{35}/,
    /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*[A-Za-z0-9_\-]{20,}/
];

function fingerprint(ruleId: string, filePath: string, lineNumber: number | null, evidence: string): string
{
    return crypto
        .createHash('sha256')
        .update(`${ruleId}:${filePath}:${lineNumber ?? 0}:${evidence}`)
        .digest('hex');
}

function getLineNumber(content: string, index: number): number
{
    return content.slice(0, index).split('\n').length;
}

function isSamplePath(filePath: string): boolean
{
    const segments = filePath.replace(/\\/g, '/').toLowerCase().split('/');

    return segments.some((segment) => samplePathSegments.has(segment));
}

function hasHighConfidenceSecret(content: string): boolean
{
    return highConfidenceSecretPatterns.some((pattern) => pattern.test(content));
}

function shouldSuppressSampleFinding(filePath: string, content: string, ruleId: string): boolean
{
    if (!sampleSuppressedRules.has(ruleId) || !isSamplePath(filePath))
    {
        return false;
    }

    return !hasHighConfidenceSecret(content);
}

function pushFinding(
    findings: ScannerFinding[],
    ruleId: string,
    severity: ScannerFinding['severity'],
    title: string,
    description: string,
    remediation: string,
    filePath: string,
    lineNumber: number | null,
    evidence: string,
    fileContent: string,
    metadata?: object
)
{
    if (shouldSuppressSampleFinding(filePath, fileContent, ruleId))
    {
        return;
    }

    findings.push(
        {
            ruleId,
            severity,
            title,
            description,
            remediation,
            filePath,
            lineNumber,
            fingerprint: fingerprint(ruleId, filePath, lineNumber, evidence),
            metadata
        }
    );
}

function scanSecrets(file: RepositoryFile, findings: ScannerFinding[])
{
    for (const rule of secretRules)
    {
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match = pattern.exec(file.content);

        while (match)
        {
            pushFinding(
                findings,
                rule.ruleId,
                rule.severity,
                rule.title,
                'A value matching a sensitive credential pattern was found in the repository.',
                rule.remediation,
                file.path,
                getLineNumber(file.content, match.index),
                match[0].slice(0, 24),
                file.content
            );

            match = pattern.exec(file.content);
        }
    }
}

function scanRepositoryHygiene(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();

    if (lowerPath === '.env' || lowerPath.endsWith('/.env'))
    {
        pushFinding(
            findings,
            'repo.env-file-committed',
            'high',
            'Environment file committed',
            'A .env file is present in the repository. Environment files often contain credentials and should not be committed.',
            'Remove the .env file from the repository, rotate any exposed values, add .env to .gitignore, and use environment configuration in deployment.',
            file.path,
            null,
            file.path,
            file.content
        );
    }

    if (lowerPath.endsWith('.pem') || lowerPath.endsWith('.key') || lowerPath.endsWith('.p12'))
    {
        pushFinding(
            findings,
            'repo.key-file-committed',
            'critical',
            'Key file committed',
            'A private key or certificate-like file was found in the repository.',
            'Remove the key file, rotate/reissue the credential, and store sensitive key material outside source control.',
            file.path,
            null,
            file.path,
            file.content
        );
    }
}

function scanPackageJson(file: RepositoryFile, findings: ScannerFinding[])
{
    if (!file.path.endsWith('package.json'))
    {
        return;
    }

    try
    {
        const packageJson = JSON.parse(file.content) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const scripts = packageJson.scripts ?? {};

        for (const [scriptName, scriptValue] of Object.entries(scripts))
        {
            if (/\b(curl|wget)\b.+\b(sh|bash|node)\b/i.test(scriptValue))
            {
                pushFinding(
                    findings,
                    'dependency.suspicious-script',
                    'medium',
                    'Suspicious package script',
                    'A package script downloads or pipes remote content into an executable shell/runtime.',
                    'Avoid executing remote content directly in package scripts. Pin trusted scripts locally and review the source before execution.',
                    file.path,
                    null,
                    `${scriptName}:${scriptValue}`,
                    file.content,
                    { scriptName }
                );
            }
        }

        const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };

        for (const dependencyName of Object.keys(dependencies))
        {
            if (dangerousPackages.has(dependencyName))
            {
                pushFinding(
                    findings,
                    'dependency.known-risky-package',
                    'high',
                    'Known risky package name detected',
                    'A package with known historical supply-chain risk was found. Review whether it is still required and safe.',
                    'Confirm whether the dependency is still needed, update to a safe version or remove it, and review lockfile integrity.',
                    file.path,
                    null,
                    dependencyName,
                    file.content,
                    { dependencyName }
                );
            }
        }
    }
    catch (error)
    {
        pushFinding(
            findings,
            'dependency.invalid-package-json',
            'low',
            'Invalid package.json',
            'package.json could not be parsed as valid JSON.',
            'Fix invalid JSON so dependency and script checks can run reliably.',
            file.path,
            null,
            file.path,
            file.content
        );
    }
}

function scanDockerfile(file: RepositoryFile, findings: ScannerFinding[])
{
    if (!file.path.toLowerCase().endsWith('dockerfile') && !file.path.toLowerCase().includes('/dockerfile'))
    {
        return;
    }

    if (!/\n\s*USER\s+\S+/i.test(`\n${file.content}`))
    {
        pushFinding(
            findings,
            'container.no-user',
            'medium',
            'Dockerfile does not set a non-root user',
            'The Dockerfile does not set a USER instruction. Containers should avoid running as root where possible.',
            'Create a non-root user in the image and add a USER instruction before the final command.',
            file.path,
            null,
            file.path,
            file.content
        );
    }
}

function scanGithubActions(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();

    if (!lowerPath.startsWith('.github/workflows/') || (!lowerPath.endsWith('.yml') && !lowerPath.endsWith('.yaml')))
    {
        return;
    }

    if (/pull_request_target\s*:/i.test(file.content))
    {
        pushFinding(
            findings,
            'ci.pull-request-target',
            'high',
            'GitHub Actions uses pull_request_target',
            'pull_request_target can expose privileged tokens to untrusted pull request workflows if not handled carefully.',
            'Use pull_request where possible, or ensure untrusted code is never checked out/executed with privileged tokens.',
            file.path,
            null,
            file.path,
            file.content
        );
    }

    if (/permissions\s*:\s*write-all/i.test(file.content))
    {
        pushFinding(
            findings,
            'ci.write-all-permissions',
            'medium',
            'GitHub Actions grants write-all permissions',
            'Workflow permissions are broad. Restrict permissions to the minimum scopes required.',
            'Replace write-all with explicit least-privilege permissions for each workflow job.',
            file.path,
            null,
            file.path,
            file.content
        );
    }
}

function scanDockerCompose(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();

    if (!lowerPath.endsWith('docker-compose.yml') && !lowerPath.endsWith('docker-compose.yaml'))
    {
        return;
    }

    if (/0\.0\.0\.0:\d+:\d+/.test(file.content) || /["']\d+:\d+["']/.test(file.content))
    {
        pushFinding(
            findings,
            'container.exposed-service',
            'low',
            'Docker Compose exposes service ports',
            'Review exposed ports and ensure development services are not publicly reachable in production.',
            'Restrict exposed ports, bind development services to localhost, and keep production compose files separate.',
            file.path,
            null,
            file.path,
            file.content
        );
    }
}

function scanCodeRiskPatterns(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();
    const content = file.content;

    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(lowerPath))
    {
        const evalMatch = /\beval\s*\(/.exec(content);
        if (evalMatch)
        {
            pushFinding(
                findings,
                'code.javascript-eval',
                'medium',
                'JavaScript eval usage detected',
                'eval executes strings as code and can become dangerous when user-controlled values reach it.',
                'Replace eval with explicit parsing, a safe expression evaluator, or direct function calls. Never pass user-controlled data into eval.',
                file.path,
                getLineNumber(content, evalMatch.index),
                evalMatch[0],
                content
            );
        }

        const childProcessMatch = /require\s*\(\s*['"]child_process['"]\s*\)|from\s+['"]child_process['"]/.exec(content);
        const execMatch = /\.(exec|execSync)\s*\(/.exec(content);
        if (childProcessMatch && execMatch)
        {
            pushFinding(
                findings,
                'code.node-command-execution',
                'high',
                'Node command execution API used',
                'child_process exec-style APIs can introduce command injection if command strings include user-controlled input.',
                'Use spawn or execFile with argument arrays, validate all inputs, and avoid building shell commands with string concatenation.',
                file.path,
                getLineNumber(content, execMatch.index),
                execMatch[0],
                content
            );
        }
    }

    if (lowerPath.endsWith('.php'))
    {
        const phpEvalMatch = /\beval\s*\(/i.exec(content);
        if (phpEvalMatch)
        {
            pushFinding(
                findings,
                'code.php-eval',
                'high',
                'PHP eval usage detected',
                'PHP eval executes dynamic code and is frequently involved in remote code execution vulnerabilities.',
                'Remove eval usage. Replace dynamic execution with explicit routing, whitelisted callbacks, or safe template rendering.',
                file.path,
                getLineNumber(content, phpEvalMatch.index),
                phpEvalMatch[0],
                content
            );
        }

        const phpShellMatch = /\b(shell_exec|exec|passthru|system|proc_open|popen)\s*\(/i.exec(content);
        const phpInputMatch = /\$_(GET|POST|REQUEST|COOKIE|SERVER)\b/i.exec(content);
        if (phpShellMatch && phpInputMatch)
        {
            pushFinding(
                findings,
                'code.php-user-input-command',
                'high',
                'PHP command execution near request input',
                'A PHP command execution function appears in a file that also reads request-controlled input.',
                'Avoid shell execution for request paths. If unavoidable, whitelist commands, escape arguments with escapeshellarg, and validate input strictly.',
                file.path,
                getLineNumber(content, phpShellMatch.index),
                phpShellMatch[0],
                content
            );
        }
    }

    if (lowerPath.endsWith('.py'))
    {
        const shellTrueMatch = /subprocess\.(run|call|check_call|check_output|Popen)\s*\([\s\S]{0,220}shell\s*=\s*True/.exec(content);
        if (shellTrueMatch)
        {
            pushFinding(
                findings,
                'code.python-subprocess-shell',
                'medium',
                'Python subprocess shell mode detected',
                'subprocess with shell=True can become command injection if any part of the command is influenced by user input.',
                'Pass commands as argument arrays with shell=False and validate any external input before using it in command execution.',
                file.path,
                getLineNumber(content, shellTrueMatch.index),
                shellTrueMatch[0].slice(0, 80),
                content
            );
        }
    }

    if (lowerPath.endsWith('.cs'))
    {
        const processStartMatch = /\bProcess\.Start\s*\(/.exec(content);
        const requestInputMatch = /\bRequest\.(Query|Form|Body|Cookies|Headers)\b/.exec(content);
        if (processStartMatch && requestInputMatch)
        {
            pushFinding(
                findings,
                'code.csharp-user-input-process-start',
                'high',
                'C# process execution near request input',
                'Process.Start appears in a file that also reads request-controlled input, which can lead to command execution bugs.',
                'Avoid launching processes from request input. Use fixed commands, strict allowlists, and ProcessStartInfo.ArgumentList instead of command strings.',
                file.path,
                getLineNumber(content, processStartMatch.index),
                processStartMatch[0],
                content
            );
        }
    }

    if (/\.(java|kt)$/.test(lowerPath))
    {
        const runtimeExecMatch = /\bRuntime\.getRuntime\(\)\.exec\s*\(|\bProcessBuilder\s*\(/.exec(content);
        if (runtimeExecMatch)
        {
            pushFinding(
                findings,
                'code.jvm-command-execution',
                'medium',
                'JVM command execution API used',
                'Runtime.exec or ProcessBuilder can become risky when command arguments include untrusted input.',
                'Use fixed executable paths, pass arguments separately, validate inputs with allowlists, and avoid shell wrappers.',
                file.path,
                getLineNumber(content, runtimeExecMatch.index),
                runtimeExecMatch[0],
                content
            );
        }
    }

    if (lowerPath.endsWith('.go'))
    {
        const goExecMatch = /\bexec\.Command\s*\(/.exec(content);
        if (goExecMatch)
        {
            pushFinding(
                findings,
                'code.go-command-execution',
                'medium',
                'Go command execution API used',
                'exec.Command can become risky if executable names or arguments are influenced by untrusted input.',
                'Use fixed executable paths, pass arguments separately, and validate all external input with strict allowlists.',
                file.path,
                getLineNumber(content, goExecMatch.index),
                goExecMatch[0],
                content
            );
        }
    }

    if (lowerPath.endsWith('.rs'))
    {
        const rustCommandMatch = /\bCommand::new\s*\(/.exec(content);
        if (rustCommandMatch)
        {
            pushFinding(
                findings,
                'code.rust-command-execution',
                'medium',
                'Rust command execution API used',
                'std::process::Command can become risky if commands or arguments are built from untrusted input.',
                'Use fixed executable paths, pass arguments with arg/args, and validate any external input before command execution.',
                file.path,
                getLineNumber(content, rustCommandMatch.index),
                rustCommandMatch[0],
                content
            );
        }
    }

    if (/\.(c|h|cc|cpp|cxx|hpp|m|mm)$/.test(lowerPath))
    {
        const nativeShellMatch = /\b(system|popen)\s*\(/.exec(content);
        if (nativeShellMatch)
        {
            pushFinding(
                findings,
                'code.native-shell-execution',
                'medium',
                'Native shell execution API used',
                'system or popen can introduce command injection when command strings include untrusted input.',
                'Avoid shell execution where possible. Use safer process APIs, fixed commands, and strict input validation.',
                file.path,
                getLineNumber(content, nativeShellMatch.index),
                nativeShellMatch[0],
                content
            );
        }
    }

    if (lowerPath.endsWith('.swift'))
    {
        const swiftProcessMatch = /\bProcess\s*\(\s*\)|\bNSTask\s*\(\s*\)/.exec(content);
        if (swiftProcessMatch)
        {
            pushFinding(
                findings,
                'code.swift-process-execution',
                'medium',
                'Swift process execution API used',
                'Process/NSTask can become risky if executable paths or arguments are influenced by untrusted input.',
                'Use fixed executable paths, pass arguments separately, and validate user-controlled values with allowlists.',
                file.path,
                getLineNumber(content, swiftProcessMatch.index),
                swiftProcessMatch[0],
                content
            );
        }
    }

    if (/\.(scala|sc)$/.test(lowerPath))
    {
        const scalaShellMatch = /\bimport\s+scala\.sys\.process|\.!\s*(?:\n|$)|\.!!\s*(?:\n|$)/.exec(content);
        if (scalaShellMatch)
        {
            pushFinding(
                findings,
                'code.scala-process-execution',
                'medium',
                'Scala process execution helper used',
                'scala.sys.process helpers can execute shell commands and become risky with untrusted input.',
                'Prefer safe library APIs. If process execution is required, use fixed commands and validate arguments strictly.',
                file.path,
                getLineNumber(content, scalaShellMatch.index),
                scalaShellMatch[0].slice(0, 80),
                content
            );
        }
    }

    if (/\.(rb)$/.test(lowerPath))
    {
        const rubyShellMatch = /`[^`]+`|%x\s*[\({]|\bsystem\s*\(|\bexec\s*\(/.exec(content);
        if (rubyShellMatch)
        {
            pushFinding(
                findings,
                'code.ruby-command-execution',
                'medium',
                'Ruby command execution API used',
                'Ruby shell execution helpers can become command injection if command strings include untrusted input.',
                'Prefer safe library calls, pass arguments separately where possible, and validate any external input with strict allowlists.',
                file.path,
                getLineNumber(content, rubyShellMatch.index),
                rubyShellMatch[0].slice(0, 80),
                content
            );
        }
    }

    if (/\.(pl|pm)$/.test(lowerPath))
    {
        const perlShellMatch = /`[^`]+`|\bsystem\s*\(|\bexec\s*\(|\bopen\s*\([^,\n]+,\s*["'][|]/.exec(content);
        if (perlShellMatch)
        {
            pushFinding(
                findings,
                'code.perl-command-execution',
                'medium',
                'Perl command execution API used',
                'Perl shell helpers can execute commands and become risky when command strings include untrusted input.',
                'Avoid shell interpolation. Use list-form system/exec where possible and validate external input strictly.',
                file.path,
                getLineNumber(content, perlShellMatch.index),
                perlShellMatch[0].slice(0, 80),
                content
            );
        }
    }

    if (lowerPath.endsWith('.lua'))
    {
        const luaShellMatch = /\bos\.execute\s*\(|\bio\.popen\s*\(/.exec(content);
        if (luaShellMatch)
        {
            pushFinding(
                findings,
                'code.lua-command-execution',
                'medium',
                'Lua command execution API used',
                'Lua command execution helpers can introduce command injection if command strings include untrusted input.',
                'Avoid shell execution for user-controlled values. Use fixed commands and validate all arguments before execution.',
                file.path,
                getLineNumber(content, luaShellMatch.index),
                luaShellMatch[0],
                content
            );
        }
    }

    if (/\.(dart)$/.test(lowerPath))
    {
        const dartProcessMatch = /\bProcess\.(run|start)\s*\(/.exec(content);
        if (dartProcessMatch)
        {
            pushFinding(
                findings,
                'code.dart-process-execution',
                'medium',
                'Dart process execution API used',
                'Process.run or Process.start can become risky if executable paths or arguments come from untrusted input.',
                'Use fixed executable paths, pass arguments separately, and validate any external input with allowlists.',
                file.path,
                getLineNumber(content, dartProcessMatch.index),
                dartProcessMatch[0],
                content
            );
        }
    }
}

function scanFiles(files: RepositoryFile[]): ScannerFinding[]
{
    const findings: ScannerFinding[] = [];

    for (const file of files)
    {
        scanRepositoryHygiene(file, findings);
        scanSecrets(file, findings);
        scanPackageJson(file, findings);
        scanDockerfile(file, findings);
        scanGithubActions(file, findings);
        scanDockerCompose(file, findings);
        scanCodeRiskPatterns(file, findings);
    }

    return findings;
}

export type {
    RepositoryFile,
    ScannerFinding
};

export {
    scanFiles
};
