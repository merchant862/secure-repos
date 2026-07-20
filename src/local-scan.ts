import fs from 'fs/promises';
import path from 'path';

import { extractDependencies } from './core/dependency-inventory.service.js';
import { isScannableFilePath, normalizeScannerPath, scannerFileSizeLimit } from './core/scanner-file-policy.service.js';
import { RepositoryFile, ScannerFinding, scanFiles } from './core/scan-rules.service.js';

const maxFindings = 500;
const maxDependencies = 3000;

type LocalScanOptions =
{
    lowResource?: boolean;
    maxFiles?: number;
    onProgress?: (message: string) => void;
};

async function scanLocalTrackedFiles(root: string, trackedFiles: string[], options: LocalScanOptions = {})
{
    const startedAt = Date.now();
    const maxFiles = Math.min(2000, Math.max(1, options.maxFiles ?? (options.lowResource ? 750 : 2000)));
    const batchSize = options.lowResource ? 15 : 40;
    const selectedFiles = trackedFiles.slice(0, maxFiles);
    const findingMap = new Map<string, ScannerFinding>();
    const dependencyMap = new Map<string, ReturnType<typeof extractDependencies>[number]>();
    let filesScanned = 0;
    let filesSkipped = Math.max(0, trackedFiles.length - selectedFiles.length);
    let batch: RepositoryFile[] = [];

    const flush = function ()
    {
        if (batch.length === 0) return;

        for (const finding of scanFiles(batch))
        {
            findingMap.set(finding.fingerprint, finding);
        }

        for (const dependency of extractDependencies(batch))
        {
            dependencyMap.set(
                `${dependency.ecosystem}\0${dependency.name}\0${dependency.version}\0${dependency.filePath}`,
                dependency
            );
        }

        batch = [];

        if (findingMap.size > maxFindings)
        {
            throw new Error(`Scan produced more than ${maxFindings} findings. Narrow the repository before syncing.`);
        }

        if (dependencyMap.size > maxDependencies)
        {
            throw new Error(`Scan found more than ${maxDependencies} dependencies. Reduce generated lock data before syncing.`);
        }
    };

    for (const rawPath of selectedFiles)
    {
        const filePath = normalizeScannerPath(rawPath);

        try
        {
            const absolutePath = path.resolve(root, filePath);
            const relativePath = normalizeScannerPath(path.relative(root, absolutePath));

            if (relativePath.startsWith('../') || path.isAbsolute(relativePath))
            {
                filesSkipped += 1;
                continue;
            }

            const stats = await fs.stat(absolutePath);
            if (!stats.isFile() || !isScannableFilePath(filePath, stats.size))
            {
                filesSkipped += 1;
                continue;
            }

            if (stats.size > scannerFileSizeLimit(filePath))
            {
                filesSkipped += 1;
                continue;
            }

            const content = await fs.readFile(absolutePath);
            if (content.includes(0))
            {
                filesSkipped += 1;
                continue;
            }

            batch.push({ path: filePath, content: content.toString('utf8') });
            filesScanned += 1;

            if (batch.length >= batchSize)
            {
                flush();
                options.onProgress?.(`Scanned ${filesScanned} files`);
            }
        }
        catch (error)
        {
            filesSkipped += 1;
        }
    }

    flush();

    return {
        findings: Array.from(findingMap.values()),
        dependencies: Array.from(dependencyMap.values()),
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - startedAt
    };
}

export {
    scanLocalTrackedFiles
};
