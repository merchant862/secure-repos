import * as TOML from '@iarna/toml';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseYaml } from 'yaml';

import { RepositoryFile } from './scan-rules.service.js';

type DependencyPackage =
{
    ecosystem: string;
    name: string;
    version: string;
    filePath: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord
{
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanVersion(value: unknown): string | null
{
    if (typeof value !== 'string')
    {
        return null;
    }

    const version = value.trim()
        .replace(/^npm:/, '')
        .replace(/^v(?=\d)/, '')
        .replace(/^(?:==|===)\s*/, '')
        .split(/[+ ]/)[0];

    if (!version || /[<>=*^~|]/.test(version) || version.includes('${'))
    {
        return null;
    }

    return version;
}

function addDependency(
    dependencies: DependencyPackage[],
    filePath: string,
    ecosystem: string,
    nameValue: unknown,
    versionValue: unknown
)
{
    const name = typeof nameValue === 'string' ? nameValue.trim() : '';
    const version = cleanVersion(versionValue);

    if (!name || !version)
    {
        return;
    }

    dependencies.push({ ecosystem, name, version, filePath });
}

function parseJson(content: string): unknown
{
    return JSON.parse(content) as unknown;
}

function parseNpmLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    const packages = document.packages;
    if (isRecord(packages))
    {
        for (const [packagePath, value] of Object.entries(packages))
        {
            if (!packagePath || !isRecord(value)) continue;

            const marker = 'node_modules/';
            const markerIndex = packagePath.lastIndexOf(marker);
            const inferredName = markerIndex >= 0 ? packagePath.slice(markerIndex + marker.length) : '';
            addDependency(dependencies, file.path, 'npm', value.name ?? inferredName, value.version);
        }
    }

    const walkLegacyDependencies = function (value: unknown)
    {
        if (!isRecord(value)) return;

        for (const [name, packageValue] of Object.entries(value))
        {
            if (!isRecord(packageValue)) continue;
            addDependency(dependencies, file.path, 'npm', name, packageValue.version);
            walkLegacyDependencies(packageValue.dependencies);
        }
    };

    walkLegacyDependencies(document.dependencies);
}

function parsePackageJson(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
    {
        const values = document[section];
        if (!isRecord(values)) continue;

        for (const [name, version] of Object.entries(values))
        {
            addDependency(dependencies, file.path, 'npm', name, version);
        }
    }
}

function parseComposerLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    for (const section of ['packages', 'packages-dev'])
    {
        const packages = document[section];
        if (!Array.isArray(packages)) continue;

        for (const packageValue of packages)
        {
            if (!isRecord(packageValue)) continue;
            addDependency(dependencies, file.path, 'Packagist', packageValue.name, packageValue.version);
        }
    }
}

function parseComposerJson(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    for (const section of ['require', 'require-dev'])
    {
        const values = document[section];
        if (!isRecord(values)) continue;

        for (const [name, version] of Object.entries(values))
        {
            if (name === 'php' || name.startsWith('ext-')) continue;
            addDependency(dependencies, file.path, 'Packagist', name, version);
        }
    }
}

function parsePythonRequirements(file: RepositoryFile, dependencies: DependencyPackage[])
{
    for (const rawLine of file.content.split(/\r?\n/))
    {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('-')) continue;

        const match = /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*={2,3}\s*([^;\s#]+)/.exec(line);
        if (match) addDependency(dependencies, file.path, 'PyPI', match[1], match[2]);
    }
}

function parsePipfileLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    for (const section of ['default', 'develop'])
    {
        const values = document[section];
        if (!isRecord(values)) continue;

        for (const [name, packageValue] of Object.entries(values))
        {
            if (isRecord(packageValue))
            {
                addDependency(dependencies, file.path, 'PyPI', name, packageValue.version);
            }
            else
            {
                addDependency(dependencies, file.path, 'PyPI', name, packageValue);
            }
        }
    }
}

function parseTomlPackages(file: RepositoryFile, dependencies: DependencyPackage[], ecosystem: string)
{
    const document = TOML.parse(file.content) as unknown;
    if (!isRecord(document)) return;

    const packages = document.package;
    if (Array.isArray(packages))
    {
        for (const packageValue of packages)
        {
            if (!isRecord(packageValue)) continue;
            addDependency(dependencies, file.path, ecosystem, packageValue.name, packageValue.version);
        }
    }
}

function parseJuliaManifest(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = TOML.parse(file.content) as unknown;
    if (!isRecord(document) || !isRecord(document.deps)) return;

    for (const [name, values] of Object.entries(document.deps))
    {
        const packageValues = Array.isArray(values) ? values : [values];
        for (const packageValue of packageValues)
        {
            if (isRecord(packageValue))
            {
                addDependency(dependencies, file.path, 'Julia', name, packageValue.version);
            }
        }
    }
}

function parseGemfileLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    let inSpecs = false;

    for (const line of file.content.split(/\r?\n/))
    {
        if (/^[A-Z][A-Z ]+$/.test(line))
        {
            inSpecs = false;
        }
        if (/^\s{2}specs:\s*$/.test(line))
        {
            inSpecs = true;
            continue;
        }
        if (!inSpecs) continue;

        const match = /^\s{4}([A-Za-z0-9_.-]+)\s+\(([^),\s]+)/.exec(line);
        if (match) addDependency(dependencies, file.path, 'RubyGems', match[1], match[2]);
    }
}

function parseGoSum(file: RepositoryFile, dependencies: DependencyPackage[])
{
    for (const line of file.content.split(/\r?\n/))
    {
        const match = /^(\S+)\s+(v[^\s/]+)(?:\/go\.mod)?\s+h1:/.exec(line.trim());
        if (match) addDependency(dependencies, file.path, 'Go', match[1], match[2]);
    }
}

function parseNugetLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document) || !isRecord(document.dependencies)) return;

    for (const framework of Object.values(document.dependencies))
    {
        if (!isRecord(framework)) continue;

        for (const [name, packageValue] of Object.entries(framework))
        {
            if (isRecord(packageValue))
            {
                addDependency(dependencies, file.path, 'NuGet', name, packageValue.resolved);
            }
        }
    }
}

function parseNugetAssets(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document) || !isRecord(document.libraries)) return;

    for (const key of Object.keys(document.libraries))
    {
        const separator = key.lastIndexOf('/');
        if (separator > 0)
        {
            addDependency(dependencies, file.path, 'NuGet', key.slice(0, separator), key.slice(separator + 1));
        }
    }
}

function parsePubspecLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseYaml(file.content) as unknown;
    if (!isRecord(document) || !isRecord(document.packages)) return;

    for (const [name, packageValue] of Object.entries(document.packages))
    {
        if (isRecord(packageValue))
        {
            addDependency(dependencies, file.path, 'Pub', name, packageValue.version);
        }
    }
}

function parsePnpmLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseYaml(file.content) as unknown;
    if (!isRecord(document)) return;

    const packages = isRecord(document.packages) ? document.packages : document.snapshots;
    if (!isRecord(packages)) return;

    for (const [rawKey, packageValue] of Object.entries(packages))
    {
        const key = rawKey.replace(/^\//, '').replace(/\(.+\)$/, '');
        let name = '';
        let version = '';

        if (key.startsWith('@'))
        {
            const separator = key.indexOf('@', key.indexOf('/') + 1);
            if (separator > 0)
            {
                name = key.slice(0, separator);
                version = key.slice(separator + 1);
            }
            else
            {
                const parts = key.split('/');
                name = `${parts[0]}/${parts[1] ?? ''}`;
                version = parts[2] ?? '';
            }
        }
        else if (key.includes('@'))
        {
            const separator = key.lastIndexOf('@');
            name = key.slice(0, separator);
            version = key.slice(separator + 1);
        }
        else
        {
            const parts = key.split('/');
            name = parts[0];
            version = parts[1] ?? '';
        }

        if (isRecord(packageValue))
        {
            addDependency(dependencies, file.path, 'npm', packageValue.name ?? name, packageValue.version ?? version);
        }
        else
        {
            addDependency(dependencies, file.path, 'npm', name, version);
        }
    }
}

function packageNameFromYarnResolution(resolution: string): string | null
{
    const normalized = resolution.replace(/^"|"$/g, '');
    const npmMarker = normalized.lastIndexOf('@npm:');
    if (npmMarker > 0) return normalized.slice(0, npmMarker);

    if (normalized.startsWith('@'))
    {
        const separator = normalized.indexOf('@', normalized.indexOf('/') + 1);
        return separator > 0 ? normalized.slice(0, separator) : null;
    }

    const separator = normalized.indexOf('@');
    return separator > 0 ? normalized.slice(0, separator) : null;
}

function parseYarnLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    try
    {
        const document = parseYaml(file.content) as unknown;
        if (isRecord(document))
        {
            for (const [selector, packageValue] of Object.entries(document))
            {
                if (selector === '__metadata' || !isRecord(packageValue)) continue;
                const resolution = typeof packageValue.resolution === 'string' ? packageValue.resolution : selector.split(',')[0];
                addDependency(dependencies, file.path, 'npm', packageNameFromYarnResolution(resolution), packageValue.version);
            }
            return;
        }
    }
    catch
    {
        // Yarn v1 syntax is close to YAML but needs a small state parser in some files.
    }

    let currentName: string | null = null;
    for (const line of file.content.split(/\r?\n/))
    {
        if (line && !/^\s/.test(line) && line.endsWith(':'))
        {
            currentName = packageNameFromYarnResolution(line.slice(0, -1).split(',')[0]);
            continue;
        }

        const versionMatch = /^\s{2}version\s+"([^"]+)"/.exec(line);
        if (currentName && versionMatch)
        {
            addDependency(dependencies, file.path, 'npm', currentName, versionMatch[1]);
        }
    }
}

function parseMavenPom(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, isArray: (name) => name === 'dependency' });
    const document = parser.parse(file.content) as unknown;
    if (!isRecord(document) || !isRecord(document.project)) return;

    const project = document.project;
    const properties = isRecord(project.properties) ? project.properties : {};
    const sections: unknown[] = [];

    if (isRecord(project.dependencies)) sections.push(project.dependencies.dependency);
    if (isRecord(project.dependencyManagement) && isRecord(project.dependencyManagement.dependencies))
    {
        sections.push(project.dependencyManagement.dependencies.dependency);
    }

    for (const section of sections)
    {
        const items = Array.isArray(section) ? section : [section];
        for (const value of items)
        {
            if (!isRecord(value)) continue;
            let version = value.version;
            if (typeof version === 'string')
            {
                const propertyMatch = /^\$\{([^}]+)\}$/.exec(version);
                if (propertyMatch) version = properties[propertyMatch[1]];
            }
            addDependency(dependencies, file.path, 'Maven', `${String(value.groupId ?? '')}:${String(value.artifactId ?? '')}`, version);
        }
    }
}

function parseGradleLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    for (const line of file.content.split(/\r?\n/))
    {
        const match = /^([^:#=\s]+):([^:#=\s]+):([^=\s]+)=/.exec(line.trim());
        if (match) addDependency(dependencies, file.path, 'Maven', `${match[1]}:${match[2]}`, match[3]);
    }
}

function parseSwiftResolved(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document)) return;

    const object = isRecord(document.object) ? document.object : document;
    const pins = object.pins;
    if (!Array.isArray(pins)) return;

    for (const pin of pins)
    {
        if (!isRecord(pin) || !isRecord(pin.state)) continue;
        addDependency(dependencies, file.path, 'SwiftURL', pin.location ?? pin.repositoryURL, pin.state.version);
    }
}

function parseMixLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const pattern = /"([^"]+)"\s*:\s*\{\s*:hex,\s*:[^,]+,\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.content)) !== null)
    {
        addDependency(dependencies, file.path, 'Hex', match[1], match[2]);
    }
}

function parseRenvLock(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const document = parseJson(file.content);
    if (!isRecord(document) || !isRecord(document.Packages)) return;

    for (const [name, packageValue] of Object.entries(document.Packages))
    {
        if (isRecord(packageValue))
        {
            addDependency(dependencies, file.path, 'CRAN', name, packageValue.Version);
        }
    }
}

function parseCabalFreeze(file: RepositoryFile, dependencies: DependencyPackage[])
{
    const pattern = /(?:constraints:\s*|,\s*)(?:any\.)?([A-Za-z0-9_.-]+)\s*==\s*([A-Za-z0-9_.+-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.content)) !== null)
    {
        addDependency(dependencies, file.path, 'Hackage', match[1], match[2]);
    }
}

function extractDependencies(files: RepositoryFile[]): DependencyPackage[]
{
    const dependencies: DependencyPackage[] = [];

    for (const file of files)
    {
        const lowerPath = file.path.toLowerCase();
        const baseName = lowerPath.split('/').pop() ?? lowerPath;

        try
        {
            if (baseName === 'package-lock.json' || baseName === 'npm-shrinkwrap.json') parseNpmLock(file, dependencies);
            else if (baseName === 'package.json') parsePackageJson(file, dependencies);
            else if (baseName === 'pnpm-lock.yaml' || baseName === 'pnpm-lock.yml') parsePnpmLock(file, dependencies);
            else if (baseName === 'yarn.lock') parseYarnLock(file, dependencies);
            else if (baseName === 'composer.lock') parseComposerLock(file, dependencies);
            else if (baseName === 'composer.json') parseComposerJson(file, dependencies);
            else if (/^(requirements(?:[._-].*)?\.txt|constraints(?:[._-].*)?\.txt)$/.test(baseName)) parsePythonRequirements(file, dependencies);
            else if (baseName === 'pipfile.lock') parsePipfileLock(file, dependencies);
            else if (baseName === 'poetry.lock' || baseName === 'uv.lock') parseTomlPackages(file, dependencies, 'PyPI');
            else if (baseName === 'cargo.lock') parseTomlPackages(file, dependencies, 'crates.io');
            else if (baseName === 'manifest.toml') parseJuliaManifest(file, dependencies);
            else if (baseName === 'gemfile.lock') parseGemfileLock(file, dependencies);
            else if (baseName === 'go.sum') parseGoSum(file, dependencies);
            else if (baseName === 'packages.lock.json') parseNugetLock(file, dependencies);
            else if (baseName === 'project.assets.json') parseNugetAssets(file, dependencies);
            else if (baseName === 'pubspec.lock') parsePubspecLock(file, dependencies);
            else if (baseName === 'pom.xml') parseMavenPom(file, dependencies);
            else if (baseName === 'gradle.lockfile' || lowerPath.includes('/dependency-locks/')) parseGradleLock(file, dependencies);
            else if (baseName === 'package.resolved') parseSwiftResolved(file, dependencies);
            else if (baseName === 'mix.lock') parseMixLock(file, dependencies);
            else if (baseName === 'renv.lock') parseRenvLock(file, dependencies);
            else if (baseName === 'cabal.project.freeze') parseCabalFreeze(file, dependencies);
        }
        catch (error)
        {
            console.warn(`Dependency file could not be parsed (${file.path}):`, error instanceof Error ? error.message : error);
        }
    }

    return Array.from(
        new Map(
            dependencies.map((dependency) =>
                [`${dependency.ecosystem}\0${dependency.name}\0${dependency.version}\0${dependency.filePath}`, dependency]
            )
        ).values()
    );
}

export type
{
    DependencyPackage
};

export
{
    extractDependencies
};
