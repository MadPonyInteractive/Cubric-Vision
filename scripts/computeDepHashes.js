/**
 * scripts/computeDepHashes.js — Bootstrap SHA256 hashes for HuggingFace dependencies.
 *
 * Usage:
 *   node scripts/computeDepHashes.js          # compute and write hashes
 *   node scripts/computeDepHashes.js --dry-run # preview only
 *
 * Stream-based: files never written to disk. Safe for large files on
 * space-constrained systems. Runs one file at a time to minimize memory/disk usage.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPS_PATH = path.join(__dirname, '..', 'js', 'data', 'modelConstants', 'dependencies.js');
const DRY_RUN = process.argv.includes('--dry-run');

async function _computeSha256(url) {
    return new Promise((resolve, reject) => {
        const curl = spawn('curl', ['-sL', '--silent', url]);
        const sha256sum = spawn('sha256sum');
        let hash = '';

        curl.stdout.on('data', (chunk) => sha256sum.stdin.write(chunk));
        curl.stderr.on('data', (d) => process.stderr.write(d));
        sha256sum.stderr.on('data', (d) => process.stderr.write(d));

        sha256sum.stdout.on('data', (d) => { hash += d.toString(); });
        sha256sum.on('close', () => resolve(hash.split(' ')[0].trim()));
        curl.on('error', reject);
        sha256sum.on('error', reject);
        curl.on('close', (code) => {
            if (code !== 0) reject(new Error(`curl exited ${code}`));
            else sha256sum.stdin.end();
        });
    });
}

async function main() {
    const content = fs.readFileSync(DEPS_PATH, 'utf8');
    const depsModule = require(DEPS_PATH);
    const deps = depsModule.DEPS || depsModule;

    const targets = Object.entries(deps).filter(
        ([, dep]) => dep.url && dep.url.includes('huggingface.co') && !dep.sha256
    );

    if (!targets.length) {
        console.log('All HuggingFace deps already have SHA256 hashes.');
        return;
    }

    console.log(`Found ${targets.length} deps missing SHA256.\n`);

    let updated = 0;
    for (const [id, dep] of targets) {
        process.stdout.write(`[${updated + 1}/${targets.length}] ${dep.url} (${dep.size || 'unknown'})\n`);
        try {
            const hash = await _computeSha256(dep.url);
            if (!DRY_RUN) {
                // Patch in-place: insert sha256: 'hash' after the url line
                const urlLine = `url: '${dep.url}'`;
                const insert = `sha256: '${hash}',`;
                // Find the url line in the source and add sha256 after it on a new logical slot
                // We rebuild the entry minimally
                const pattern = new RegExp(`(${id}:\\s*\\{[^}]*url:\\s*'${dep.url}'[^}]*?)(,\\s*\\})`);
                const replacement = `$1,\n        sha256: '${hash}'$2`;
                const newContent = content.replace(pattern, replacement);
                if (newContent === content) {
                    // Fallback: just warn
                    console.warn(`  ⚠ Could not patch ${id} automatically`);
                } else {
                    fs.writeFileSync(DEPS_PATH, newContent, 'utf8');
                }
            }
            console.log(`  ✓ ${hash.slice(0, 16)}...`);
            updated++;
        } catch (err) {
            console.warn(`  ✗ ${err.message}`);
        }
    }

    console.log(`\nDone. ${updated}/${targets.length} hashes ${DRY_RUN ? 'would be' : 'were'} computed.`);
}

main().catch(console.error);