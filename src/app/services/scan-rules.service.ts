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
