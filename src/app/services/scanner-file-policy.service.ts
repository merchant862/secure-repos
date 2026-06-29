const maxSourceFileSizeBytes = 300 * 1024;
const maxDependencyFileSizeBytes = 2 * 1024 * 1024;
const dependencyFileNames = new Set(
    [
        'package.json',
        'package-lock.json',
        'npm-shrinkwrap.json',
        'pnpm-lock.yaml',
        'pnpm-lock.yml',
        'yarn.lock',
        'composer.json',
        'composer.lock',
        'pipfile.lock',
        'poetry.lock',
        'uv.lock',
        'cargo.lock',
        'manifest.toml',
        'gemfile.lock',
        'go.sum',
        'packages.lock.json',
        'project.assets.json',
        'pubspec.lock',
        'pom.xml',
        'gradle.lockfile',
        'package.resolved',
        'mix.lock',
        'renv.lock',
        'cabal.project.freeze'
    ]
);
const textFileExtensions = new Set(
    [
        '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.astro',
        '.html', '.htm', '.css', '.scss', '.sass', '.less', '.json', '.json5',
        '.env', '.yml', '.yaml', '.toml', '.ini', '.conf', '.config', '.properties',
        '.gradle', '.tf', '.tfvars', '.hcl', '.xml', '.md', '.mdx', '.txt',
        '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.py', '.pyw',
        '.php', '.rb', '.go', '.java', '.kt', '.kts', '.cs', '.rs', '.c', '.h',
        '.cc', '.cpp', '.cxx', '.hpp', '.m', '.mm', '.swift', '.scala', '.sc',
        '.dart', '.lua', '.pl', '.pm', '.ex', '.exs', '.erl', '.hrl', '.clj',
        '.cljs', '.hs', '.r', '.jl', '.groovy', '.sql', '.graphql', '.gql',
        '.proto', '.pem', '.key', '.p12', '.crt', '.cer', '.dockerfile'
    ]
);
const ignoredPathSegments = new Set(
    [
        '.git',
        '.svn',
        '.hg',
        'node_modules',
        'vendor',
        'dist',
        'build',
        'coverage',
        '.next',
        '.nuxt',
        '.cache'
    ]
);

function normalizeScannerPath(filePath: string)
{
    return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function getScannerExtension(filePath: string): string
{
    const lowerPath = normalizeScannerPath(filePath).toLowerCase();

    if (lowerPath.endsWith('dockerfile') || lowerPath.includes('/dockerfile'))
    {
        return '.dockerfile';
    }

    const index = lowerPath.lastIndexOf('.');
    return index >= 0 ? lowerPath.slice(index) : '';
}

function isDependencyFilePath(filePath: string)
{
    const lowerPath = normalizeScannerPath(filePath).toLowerCase();
    const baseName = lowerPath.split('/').pop() ?? lowerPath;

    return dependencyFileNames.has(baseName)
        || /^(requirements(?:[._-].*)?\.txt|constraints(?:[._-].*)?\.txt)$/.test(baseName)
        || lowerPath.includes('/dependency-locks/');
}

function isIgnoredScannerPath(filePath: string)
{
    return normalizeScannerPath(filePath)
        .toLowerCase()
        .split('/')
        .some((segment) => ignoredPathSegments.has(segment));
}

function scannerFileSizeLimit(filePath: string)
{
    return isDependencyFilePath(filePath) ? maxDependencyFileSizeBytes : maxSourceFileSizeBytes;
}

function isScannableFilePath(filePath: string, size?: number)
{
    if (isIgnoredScannerPath(filePath))
    {
        return false;
    }

    if (size !== undefined && size > scannerFileSizeLimit(filePath))
    {
        return false;
    }

    return isDependencyFilePath(filePath) || textFileExtensions.has(getScannerExtension(filePath));
}

export {
    isDependencyFilePath,
    isIgnoredScannerPath,
    isScannableFilePath,
    maxDependencyFileSizeBytes,
    maxSourceFileSizeBytes,
    normalizeScannerPath,
    scannerFileSizeLimit
};
