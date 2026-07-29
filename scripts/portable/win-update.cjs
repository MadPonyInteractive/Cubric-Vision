#!/usr/bin/env node

'use strict';

// Cubric Studio Vision - online updater (Windows).
//
// WHY THIS EXISTS: Smart App Control on a clean Windows 11 install hard-blocks
// .bat / .cmd / .vbs with no per-file allowlist and no override in the dialog
// (MPI-387). The Linux/macOS updaters are shell scripts that orchestrate
// fetch-release.cjs + apply-update.cjs; on Windows that orchestration cannot live
// in a script, so it lives here and runs through CubricVision.exe as node
// (ELECTRON_RUN_AS_NODE=1) — the same trick the shell updaters use for their two
// steps, just moved one level up. The in-app update button spawns this directly,
// so the SAC-blocked chain is gone from the update path entirely. update.bat is
// kept as a double-clickable convenience for non-SAC machines and calls the same
// file, so there is exactly one implementation.
//
// Usage (already running under electron-as-node):
//   CubricVision.exe update\win-update.cjs [--root <portable-root>]

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = 'MadPonyInteractive/Cubric-Vision';
const ASSET_PATTERN = '^CubricVision-windows-x64-update-v.*\\.zip$';

function parseArgs(argv) {
  const opts = { root: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--root') opts.root = argv[++i];
    else if (arg.startsWith('--root=')) opts.root = arg.slice('--root='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function getCliArgs() {
  const argv = process.argv.slice(1);
  return argv[0] && argv[0].endsWith('win-update.cjs') ? argv.slice(1) : argv;
}

// Run a bundled .cjs helper through the app's own Electron binary as Node. A
// portable install is guaranteed to have exactly one runtime — itself.
function runHelper(script, args, capture) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited with code ${result.status}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function main() {
  const opts = parseArgs(getCliArgs());
  // This file is staged at <portable-root>/update/win-update.cjs.
  const root = path.resolve(opts.root || path.join(__dirname, '..'));
  const fetchScript = path.join(root, 'update', 'fetch-release.cjs');
  const applyScript = path.join(root, 'update', 'apply-update.cjs');
  for (const script of [fetchScript, applyScript]) {
    if (!fs.existsSync(script)) {
      throw new Error(`updater helper missing at ${script}. Is this a complete portable install?`);
    }
  }

  const repo = process.env.CUBRIC_GITHUB_REPO || DEFAULT_REPO;
  const downloadDir = path.join(root, 'update', 'downloads');
  fs.mkdirSync(downloadDir, { recursive: true });

  console.error(`Checking for updates (${repo})...`);
  // fetch-release.cjs prints the downloaded zip path on stdout; diagnostics go to
  // stderr, so only stdout is captured.
  const bundle = runHelper(
    fetchScript,
    ['--repo', repo, '--pattern', ASSET_PATTERN, '--out-dir', downloadDir],
    true,
  ).split(/\r?\n/).filter(Boolean).pop();
  if (!bundle || !fs.existsSync(bundle)) {
    throw new Error('the downloaded update file was not found.');
  }

  console.error('Applying update...');
  runHelper(applyScript, ['--root', root, '--bundle', bundle], false);
  console.error('Update applied successfully.');
}

try {
  main();
} catch (err) {
  console.error(`Update failed: ${err.message}`);
  process.exitCode = 1;
}
