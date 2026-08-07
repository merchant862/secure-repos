import crypto from 'crypto';
import { parse as parseYaml } from 'yaml';

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

type FindingConfidence = 'high' | 'medium' | 'low';

const reviewNeededRules = new Set(
    [
        'framework.express-missing-helmet',
        'auth.permissive-cors',
        'business.auth-sensitive-todo',
        'container.exposed-service',
        'code.node-command-execution',
        'code.jvm-command-execution',
        'code.go-command-execution',
        'code.rust-command-execution',
        'code.native-shell-execution',
        'code.swift-process-execution',
        'code.scala-process-execution',
        'code.ruby-command-execution',
        'code.perl-command-execution',
        'code.lua-command-execution',
        'code.dart-process-execution'
    ]
);

function findingCategory(ruleId: string)
{
    if (ruleId.startsWith('secret.')) return 'Secrets';
    if (ruleId.startsWith('dependency.')) return 'Dependencies';
    if (ruleId.startsWith('repo.')) return 'Repository hygiene';
    if (ruleId.startsWith('framework.') || ruleId.startsWith('auth.')) return 'Application configuration';
    if (ruleId.startsWith('iac.')) return 'Infrastructure configuration';
    if (ruleId.startsWith('container.')) return 'Container configuration';
    if (ruleId.startsWith('ci.')) return 'CI/CD workflow risk';
    if (ruleId.startsWith('code.')) return 'Code risk pattern';

    return 'Security review';
}

function findingConfidence(ruleId: string, severity: ScannerFinding['severity']): FindingConfidence
{
    if (
        ruleId === 'secret.generic-assignment'
        || ruleId === 'secret.high-entropy-assignment'
        || ruleId === 'framework.express-missing-helmet'
        || reviewNeededRules.has(ruleId)
    )
    {
        return 'medium';
    }

    if (severity === 'critical' || ruleId.startsWith('secret.') || ruleId.startsWith('repo.'))
    {
        return 'high';
    }

    return severity === 'low' ? 'low' : 'medium';
}

function buildFindingContext(
    ruleId: string,
    severity: ScannerFinding['severity'],
    title: string,
    description: string,
    remediation: string,
    evidence: string,
    metadata?: object
)
{
    const confidence = findingConfidence(ruleId, severity);

    return {
        category: findingCategory(ruleId),
        confidence,
        falsePositiveRisk: confidence === 'high' ? 'low' : confidence === 'medium' ? 'medium' : 'high',
        detection: description,
        impact: severity === 'critical' || severity === 'high'
            ? 'This can expose credentials, weaken access control, or create a practical attack path if the repository is deployed as-is.'
            : 'This is a review-needed security signal that may become risky depending on how the repository is deployed.',
        recommendedAction: remediation,
        fixVerification: 'Apply the fix, run a new scan, and keep the finding open until the next scan no longer detects the same fingerprint.',
        evidencePreview: evidence.length > 80 ? `${evidence.slice(0, 77)}...` : evidence,
        source: 'securerepos_rules',
        ...(metadata ?? {})
    };
}

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

const vulnerableDependencyRules =
[
    {
        ecosystem: 'npm',
        packageName: 'lodash',
        maxVersionExclusive: '4.17.21',
        severity: 'high' as const,
        advisory: 'Prototype pollution vulnerabilities have affected older lodash releases.'
    },
    {
        ecosystem: 'npm',
        packageName: 'minimist',
        maxVersionExclusive: '1.2.6',
        severity: 'high' as const,
        advisory: 'Older minimist versions are associated with prototype pollution advisories.'
    },
    {
        ecosystem: 'npm',
        packageName: 'serialize-javascript',
        maxVersionExclusive: '6.0.0',
        severity: 'high' as const,
        advisory: 'Older serialize-javascript releases have had XSS/security advisories.'
    },
    {
        ecosystem: 'npm',
        packageName: 'axios',
        maxVersionExclusive: '1.6.0',
        severity: 'medium' as const,
        advisory: 'Older axios versions have had request/SSRF related advisories. Verify against current advisories.'
    },
    {
        ecosystem: 'npm',
        packageName: 'express',
        maxVersionExclusive: '4.18.2',
        severity: 'medium' as const,
        advisory: 'Older Express versions may miss recent security fixes. Keep framework dependencies current.'
    }
];

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

function calculateShannonEntropy(value: string): number
{
    const frequency = new Map<string, number>();

    for (const character of value)
    {
        frequency.set(character, (frequency.get(character) ?? 0) + 1);
    }

    return Array.from(frequency.values()).reduce(function (entropy, count)
    {
        const probability = count / value.length;
        return entropy - probability * Math.log2(probability);
    }, 0);
}

function looksLikeEncodedSecret(value: string): boolean
{
    if (value.length < 24 || value.length > 220)
    {
        return false;
    }

    if (!/^[A-Za-z0-9+/_=-]+$/.test(value))
    {
        return false;
    }

    if (/^(true|false|null|undefined|localhost|example|changeme|password|secret)$/i.test(value))
    {
        return false;
    }

    return calculateShannonEntropy(value) >= 4.2;
}

function compareSemver(left: string, right: string): number
{
    const leftParts = left.split('.').map((part) => Number(part.replace(/\D.*$/, '')) || 0);
    const rightParts = right.split('.').map((part) => Number(part.replace(/\D.*$/, '')) || 0);

    for (let index = 0; index < Math.max(leftParts.length, rightParts.length, 3); index += 1)
    {
        const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

        if (difference !== 0)
        {
            return difference;
        }
    }

    return 0;
}

function normalizePinnedVersion(version: unknown): string | null
{
    if (typeof version !== 'string')
    {
        return null;
    }

    const match = version.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
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
            metadata: buildFindingContext(ruleId, severity, title, description, remediation, evidence, metadata)
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

    const entropyPattern = /\b[A-Za-z0-9_]*(api[_-]?key|secret|token|password|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*\b\s*[:=]\s*['"]([^'"\n]{24,220})['"]/gi;
    let entropyMatch = entropyPattern.exec(file.content);

    while (entropyMatch)
    {
        const candidate = entropyMatch[2] ?? '';

        if (looksLikeEncodedSecret(candidate))
        {
            pushFinding(
                findings,
                'secret.high-entropy-assignment',
                'high',
                'High-entropy secret-like value detected',
                'A secret-looking variable contains a high-entropy value. This is often a real token, key, or password.',
                'Move the value into protected environment configuration or a secret manager, rotate it if real, and remove it from git history.',
                file.path,
                getLineNumber(file.content, entropyMatch.index),
                candidate.slice(0, 16),
                file.content,
                { entropy: Number(calculateShannonEntropy(candidate).toFixed(2)) }
            );
        }

        entropyMatch = entropyPattern.exec(file.content);
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

            const pinnedVersion = normalizePinnedVersion(dependencies[dependencyName]);
            const vulnerableRule = vulnerableDependencyRules.find((rule) =>
                rule.ecosystem === 'npm'
                && rule.packageName === dependencyName
                && pinnedVersion
                && compareSemver(pinnedVersion, rule.maxVersionExclusive) < 0);

            if (vulnerableRule && pinnedVersion)
            {
                pushFinding(
                    findings,
                    'dependency.outdated-vulnerable-version',
                    vulnerableRule.severity,
                    `Potentially vulnerable dependency: ${dependencyName}`,
                    vulnerableRule.advisory,
                    `Upgrade ${dependencyName} to ${vulnerableRule.maxVersionExclusive} or later, then review current advisories and run tests.`,
                    file.path,
                    null,
                    `${dependencyName}@${pinnedVersion}`,
                    file.content,
                    {
                        ecosystem: vulnerableRule.ecosystem,
                        dependencyName,
                        detectedVersion: pinnedVersion,
                        fixedVersion: vulnerableRule.maxVersionExclusive
                    }
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

function scanFrameworkAndAuthPatterns(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();
    const content = file.content;

    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(lowerPath))
    {
        if (/express\s*\(/.test(content) && !/helmet\s*\(/.test(content) && !/from\s+['"]helmet['"]|require\s*\(\s*['"]helmet['"]\s*\)/.test(content))
        {
            pushFinding(
                findings,
                'framework.express-missing-helmet',
                'low',
                'Express app may be missing security headers',
                'An Express app was detected without an obvious Helmet middleware setup.',
                'Add Helmet or equivalent security headers, then verify CSP, HSTS, frame, and content-type protections.',
                file.path,
                null,
                'express',
                content
            );
        }

        if (/cookie\s*\([^)]*secure\s*:\s*false/i.test(content) || /sameSite\s*:\s*['"]none['"][^}]*secure\s*:\s*false/i.test(content))
        {
            pushFinding(
                findings,
                'auth.insecure-cookie-options',
                'high',
                'Insecure authentication cookie options',
                'Cookie configuration appears to disable Secure or combine SameSite=None without Secure.',
                'Use httpOnly, secure, and strict/lax SameSite where possible. Only use SameSite=None with secure HTTPS cookies.',
                file.path,
                null,
                'cookie',
                content
            );
        }

        if (/cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/is.test(content) || /Access-Control-Allow-Origin['"]?\s*,\s*['"]\*/i.test(content))
        {
            pushFinding(
                findings,
                'auth.permissive-cors',
                'medium',
                'Permissive CORS policy detected',
                'A wildcard CORS origin can expose authenticated APIs when combined with credentials or weak token handling.',
                'Restrict CORS origins to trusted application domains and avoid wildcard origins for private APIs.',
                file.path,
                null,
                'cors:*',
                content
            );
        }

        if (/jwt\.sign\s*\([^,\n]+,\s*['"][^'"]{1,12}['"]/i.test(content))
        {
            pushFinding(
                findings,
                'auth.weak-jwt-secret',
                'high',
                'Weak hardcoded JWT secret',
                'JWT signing appears to use a short hardcoded secret.',
                'Use a long random secret from protected environment configuration and rotate existing tokens after changing it.',
                file.path,
                null,
                'jwt.sign',
                content
            );
        }
    }

    if (lowerPath.includes('config/app.php') && /'debug'\s*=>\s*true/i.test(content))
    {
        pushFinding(
            findings,
            'framework.laravel-debug-enabled',
            'high',
            'Laravel debug mode enabled',
            'Laravel debug mode can expose sensitive stack traces and environment data in production.',
            'Set APP_DEBUG=false in production and avoid committing production-like debug configuration.',
            file.path,
            null,
            'APP_DEBUG',
            content
        );
    }

    if (lowerPath.includes('settings.py') && /\bDEBUG\s*=\s*True\b/.test(content))
    {
        pushFinding(
            findings,
            'framework.django-debug-enabled',
            'high',
            'Django debug mode enabled',
            'Django DEBUG=True can expose sensitive diagnostics and should not be used in production.',
            'Set DEBUG=False for production and use environment-based settings.',
            file.path,
            null,
            'DEBUG=True',
            content
        );
    }

    if (lowerPath.includes('settings.py') && /\bALLOWED_HOSTS\s*=\s*\[\s*['"]\*['"]\s*\]/.test(content))
    {
        pushFinding(
            findings,
            'framework.django-wildcard-hosts',
            'medium',
            'Django allows wildcard hosts',
            'ALLOWED_HOSTS includes a wildcard, which weakens host header protections.',
            'Set ALLOWED_HOSTS to the exact domains served by the application.',
            file.path,
            null,
            'ALLOWED_HOSTS=*',
            content
        );
    }

    if (lowerPath.endsWith('production.rb') && /config\.force_ssl\s*=\s*false/.test(content))
    {
        pushFinding(
            findings,
            'framework.rails-force-ssl-disabled',
            'medium',
            'Rails force_ssl disabled in production',
            'Rails production configuration appears to disable forced HTTPS.',
            'Enable config.force_ssl in production unless TLS termination and redirects are enforced elsewhere.',
            file.path,
            null,
            'force_ssl=false',
            content
        );
    }

    if (/login|auth|password|reset/i.test(lowerPath) && /TODO|FIXME|temporary|bypass|backdoor|default password/i.test(content))
    {
        pushFinding(
            findings,
            'business.auth-sensitive-todo',
            'medium',
            'Auth-sensitive TODO or bypass wording detected',
            'An authentication-sensitive file contains wording that may indicate temporary bypasses, default passwords, or unfinished security work.',
            'Review the code path manually before release and remove any temporary bypasses or default credentials.',
            file.path,
            null,
            lowerPath,
            content
        );
    }
}

function scanIacPatterns(file: RepositoryFile, findings: ScannerFinding[])
{
    const lowerPath = file.path.toLowerCase();
    const content = file.content;

    if (lowerPath.endsWith('.tf') || lowerPath.endsWith('.tfvars'))
    {
        if (/cidr_blocks\s*=\s*\[[^\]]*["']0\.0\.0\.0\/0["'][^\]]*\]/is.test(content))
        {
            pushFinding(
                findings,
                'iac.terraform-open-cidr',
                'high',
                'Terraform security rule allows 0.0.0.0/0',
                'Terraform configuration appears to allow inbound access from the public internet.',
                'Restrict CIDR ranges to trusted networks and expose only required ports through controlled ingress.',
                file.path,
                null,
                '0.0.0.0/0',
                content
            );
        }

        if (/acl\s*=\s*["']public-read["']|public_access_block\s*=\s*false/i.test(content))
        {
            pushFinding(
                findings,
                'iac.terraform-public-storage',
                'high',
                'Terraform may configure public storage',
                'Storage ACL/public access configuration appears permissive.',
                'Block public access by default and expose objects only through controlled, audited paths.',
                file.path,
                null,
                'public storage',
                content
            );
        }
    }

    if (lowerPath.endsWith('.yml') || lowerPath.endsWith('.yaml'))
    {
        if (/kind\s*:\s*(Pod|Deployment|StatefulSet|DaemonSet)[\s\S]{0,300}privileged\s*:\s*true/i.test(content))
        {
            pushFinding(
                findings,
                'iac.kubernetes-privileged-container',
                'high',
                'Kubernetes privileged container',
                'A Kubernetes workload appears to run a privileged container.',
                'Disable privileged mode and grant only the specific Linux capabilities required.',
                file.path,
                null,
                'privileged:true',
                content
            );
        }

        if (/kind\s*:\s*(Pod|Deployment|StatefulSet|DaemonSet)[\s\S]{0,400}runAsNonRoot\s*:\s*false/i.test(content))
        {
            pushFinding(
                findings,
                'iac.kubernetes-root-container',
                'medium',
                'Kubernetes workload allows root containers',
                'A Kubernetes workload explicitly allows containers to run as root.',
                'Set runAsNonRoot=true and use a non-root image user wherever possible.',
                file.path,
                null,
                'runAsNonRoot:false',
                content
            );
        }

        if (/Effect\s*:\s*Allow[\s\S]{0,240}Action\s*:\s*['"]?\*['"]?[\s\S]{0,240}Resource\s*:\s*['"]?\*['"]?/i.test(content))
        {
            pushFinding(
                findings,
                'iac.cloudformation-wildcard-iam',
                'high',
                'Wildcard IAM permissions in infrastructure template',
                'An infrastructure template appears to allow all actions on all resources.',
                'Replace wildcard IAM policies with least-privilege actions and scoped resources.',
                file.path,
                null,
                'Action:* Resource:*',
                content
            );
        }
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

    let workflow: Record<string, unknown> | null = null;

    try
    {
        const parsed = parseYaml(file.content) as unknown;
        workflow = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    }
    catch
    {
        workflow = null;
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

    if (!/^\s*permissions\s*:/im.test(file.content))
    {
        pushFinding(
            findings,
            'ci.missing-workflow-permissions',
            'medium',
            'GitHub Actions workflow does not declare token permissions',
            'Workflows without explicit permissions inherit the repository default token policy, which is often broader than required.',
            'Add least-privilege permissions at the workflow or job level, such as permissions: contents: read, then grant write scopes only to jobs that need them.',
            file.path,
            null,
            'missing permissions',
            file.content,
            { policy: 'least_privilege_github_token' }
        );
    }

    const broadPermissionMatch = /^\s*(contents|actions|checks|deployments|discussions|id-token|issues|packages|pages|pull-requests|repository-projects|security-events|statuses)\s*:\s*write\s*$/im.exec(file.content);
    if (broadPermissionMatch)
    {
        pushFinding(
            findings,
            'ci.broad-write-permission',
            broadPermissionMatch[1] === 'id-token' ? 'high' : 'medium',
            `GitHub Actions grants ${broadPermissionMatch[1]} write permission`,
            'A workflow grants a sensitive write permission. Write scopes should be limited to the exact job that needs them.',
            `Move ${broadPermissionMatch[1]}: write to the smallest possible job scope, or replace it with read/none if the workflow does not need write access.`,
            file.path,
            getLineNumber(file.content, broadPermissionMatch.index),
            broadPermissionMatch[0],
            file.content,
            { permission: broadPermissionMatch[1] }
        );
    }

    const actionPattern = /\buses\s*:\s*['"]?([^@\s'"]+)@([^'"\s#]+)['"]?/gi;
    let actionMatch = actionPattern.exec(file.content);
    while (actionMatch)
    {
        const action = actionMatch[1] ?? '';
        const version = actionMatch[2] ?? '';
        const isDockerAction = action.startsWith('docker://');
        const isLocalAction = action.startsWith('./') || action.startsWith('../');
        const isShaPinned = /^[a-f0-9]{40}$/i.test(version);

        if (!isDockerAction && !isLocalAction && !isShaPinned)
        {
            pushFinding(
                findings,
                'ci.unpinned-action',
                version.startsWith('v') || /^\d+$/.test(version) ? 'medium' : 'high',
                'GitHub Action is not pinned to a commit SHA',
                'Third-party actions referenced by tags or branches can change without review and alter CI behavior.',
                `Pin ${action} to a reviewed full commit SHA. Keep version updates explicit through dependency review or scheduled maintenance.`,
                file.path,
                getLineNumber(file.content, actionMatch.index),
                actionMatch[0],
                file.content,
                { action, version }
            );
        }

        actionMatch = actionPattern.exec(file.content);
    }

    const riskyShellRules: Array<{ ruleId: string; severity: ScannerFinding['severity']; title: string; pattern: RegExp; remediation: string }> =
    [
        {
            ruleId: 'ci.remote-script-pipe-shell',
            severity: 'high',
            title: 'Workflow pipes a remote script into a shell',
            pattern: /\b(curl|wget)\b[^\n|;]*(?:\||\>)\s*(?:sudo\s+)?(?:bash|sh)\b/i,
            remediation: 'Download scripts with checksum/signature verification or replace them with pinned actions and checked-in scripts.'
        },
        {
            ruleId: 'ci.secret-echo',
            severity: 'high',
            title: 'Workflow may print secrets to logs',
            pattern: /\b(echo|printf)\b[^\n]*(\$\{\{\s*secrets\.|secrets\.)/i,
            remediation: 'Do not print secrets. Pass them directly to the command that needs them and mask any derived values before logging.'
        },
        {
            ruleId: 'ci.untrusted-script-execution',
            severity: 'medium',
            title: 'Workflow downloads and executes code during CI',
            pattern: /\b(chmod\s+\+x|bash|sh)\b[^\n]*(\/tmp|https?:\/\/|\$\{\{\s*github\.event)/i,
            remediation: 'Use checked-in scripts, pinned actions, and explicit validation before executing files created from network or pull request inputs.'
        }
    ];

    for (const rule of riskyShellRules)
    {
        const match = rule.pattern.exec(file.content);
        if (!match) continue;

        pushFinding(
            findings,
            rule.ruleId,
            rule.severity,
            rule.title,
            'The workflow contains a shell pattern that can turn CI into an attack path when combined with untrusted input or network content.',
            rule.remediation,
            file.path,
            getLineNumber(file.content, match.index),
            match[0].slice(0, 120),
            file.content,
            { policy: 'ci_runtime_hardening' }
        );
    }

    if (/persist-credentials\s*:\s*true/i.test(file.content))
    {
        pushFinding(
            findings,
            'ci.checkout-persist-credentials',
            'medium',
            'actions/checkout persists GitHub credentials',
            'Persisted checkout credentials can be reused by later steps in the job if a script or dependency is compromised.',
            'Set persist-credentials: false for read-only workflows. Keep it enabled only in tightly scoped jobs that intentionally push back to the repository.',
            file.path,
            getLineNumber(file.content, file.content.search(/persist-credentials\s*:\s*true/i)),
            'persist-credentials: true',
            file.content
        );
    }

    if (workflow)
    {
        const jobs = workflow.jobs;
        if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs))
        {
            return;
        }

        for (const [jobName, rawJob] of Object.entries(jobs as Record<string, unknown>))
        {
            if (!rawJob || typeof rawJob !== 'object' || Array.isArray(rawJob)) continue;
            const job = rawJob as Record<string, unknown>;
            const runsOn = job['runs-on'];
            const labels = Array.isArray(runsOn) ? runsOn.map(String) : [String(runsOn ?? '')];

            if (labels.some((label) => label.toLowerCase().includes('self-hosted')))
            {
                pushFinding(
                    findings,
                    'ci.self-hosted-runner',
                    'medium',
                    'Workflow uses a self-hosted runner',
                    'Self-hosted runners need strict isolation, patching, token scoping, and cleanup because compromised jobs can affect the host.',
                    'Run untrusted jobs on ephemeral isolated runners, restrict outbound access, rotate runner tokens, and avoid sharing runners across trust boundaries.',
                    file.path,
                    null,
                    jobName,
                    file.content,
                    { jobName, runner: labels }
                );
            }
        }
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
        scanFrameworkAndAuthPatterns(file, findings);
        scanIacPatterns(file, findings);
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
