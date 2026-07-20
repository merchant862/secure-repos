'use strict';

const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rootDir = path.resolve(__dirname, '..');
const image = process.env.DOCKER_SCANNER_IMAGE || 'securerepos/scanner:local';
const tmpDir = process.env.DOCKER_SCANNER_TMP_DIR || '/tmp/securerepos-scans';
const scannerLabel = 'com.securerepos.role=scanner';

function run(command, args, options = {})
{
    return new Promise(function (resolve, reject)
    {
        const child = spawn(command, args,
            {
                cwd: rootDir,
                stdio: options.quiet ? 'pipe' : 'inherit'
            }
        );
        let stdout = '';

        if (child.stdout)
        {
            child.stdout.on('data', function (chunk)
            {
                stdout += chunk.toString('utf8');
            });
        }

        child.on('error', reject);
        child.on('close', function (code)
        {
            if (code === 0 || options.allowFailure)
            {
                resolve(stdout.trim());
                return;
            }

            reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        });
    });
}

async function buildScannerImage()
{
    console.log(`Building SecureRepos scanner image: ${image}`);
    await run('docker', ['build', '-t', image, 'docker/scanner']);
    console.log(`SecureRepos scanner image is ready: ${image}`);
}

async function cleanupScannerArtifacts()
{
    console.log('Cleaning SecureRepos scanner containers and temporary files...');

    const containerIds = await run(
        'docker',
        ['ps', '-aq', '--filter', `label=${scannerLabel}`],
        { quiet: true, allowFailure: true }
    );

    if (containerIds)
    {
        await run('docker', ['rm', '-f', ...containerIds.split(/\s+/)], { allowFailure: true });
    }

    await run('docker', ['image', 'rm', '-f', image], { allowFailure: true });
    await fs.rm(tmpDir, { recursive: true, force: true });

    console.log('SecureRepos scanner cleanup complete.');
}

async function sleepForever()
{
    await new Promise(function ()
    {
        // PM2 keeps this process alive so Docker scanner setup has a lifecycle.
    });
}

async function main()
{
    if (process.argv.includes('--cleanup'))
    {
        await cleanupScannerArtifacts();
        return;
    }

    await buildScannerImage();

    let shuttingDown = false;
    async function shutdown()
    {
        if (shuttingDown) return;
        shuttingDown = true;

        try
        {
            await cleanupScannerArtifacts();
        }
        catch (error)
        {
            console.error('SecureRepos scanner cleanup failed:', error);
        }

        process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('SecureRepos scanner lifecycle process is running.');
    await sleepForever();
}

main().catch(function (error)
{
    console.error('SecureRepos scanner lifecycle failed:', error);
    process.exit(1);
});
