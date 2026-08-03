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
const { spawn, spawnSync } = require('child_process');

const DEFAULT_REPO = 'MadPonyInteractive/Cubric-Vision';
const ASSET_PATTERN = '^CubricVision-windows-x64-update-v.*\\.zip$';

// MPI-422 gap 1: the in-app button spawns us detached with stdio:'ignore', so there
// is no console at all and every console.error went to NUL. A failed update quit the
// app and left nothing to read. Everything we say is teed to <root>/update/update.log,
// truncated per run (one update's worth is all anyone needs).
let LOG_FILE = null;
// A helper failure throws "<script> exited with code 1", which tells the user nothing.
// The actual reason ("no published release found…", "disk full", …) is on the helper's
// stderr, so keep the last line of it to put in the failure marker.
let LAST_HELPER_ERROR = '';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  if (!LOG_FILE) return;
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch { /* a log we cannot write must never fail the update */ }
}

function openLog(root) {
  LOG_FILE = path.join(root, 'update', 'update.log');
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, '');
  } catch {
    LOG_FILE = null;
  }
}

// MPI-422 gap 2: the update prompt promises "the app will close, update, and reopen"
// and nothing ever reopened it. Relaunch on BOTH outcomes — on failure the user gets a
// window back and a reason instead of a machine that looks crashed. Target the exe in
// the root, NOT process.execPath: apply-update.cjs may have renamed the running image
// aside as <exe>.old and written the new one in its place, so execPath can be the
// retired binary. ELECTRON_RUN_AS_NODE must go or the app boots as plain node and exits.
function relaunch(root) {
  const exe = path.join(root, 'CubricVision.exe');
  if (!fs.existsSync(exe)) {
    log(`Relaunch skipped: ${exe} not found.`);
    return;
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(exe, [], { cwd: root, detached: true, stdio: 'ignore', env });
    child.unref();
    log('Relaunched Cubric Vision.');
  } catch (err) {
    log(`Relaunch failed: ${err.message}`);
  }
}

// A failure marker the app reads on its next boot, so the reason reaches the user as a
// dialog rather than only as a log line nobody knows to open. Written before relaunch;
// the app deletes it once shown.
function writeResult(root, error) {
  try {
    fs.writeFileSync(
      path.join(root, 'update', 'update-result.json'),
      JSON.stringify({ ok: false, error, at: new Date().toISOString() }, null, 2),
    );
  } catch { /* non-fatal */ }
}

function parseArgs(argv) {
  const opts = { root: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--root') opts.root = argv[++i];
    else if (arg.startsWith('--root=')) opts.root = arg.slice('--root='.length);
    // Noted, not fatal: this runs before the log is open, and a throw here would
    // skip both the log and the relaunch — the failure mode MPI-422 exists to kill.
    else log(`Ignoring unknown argument: ${arg}`);
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
    // Both streams are piped so the helpers' own diagnostics land in our log. They
    // used to be 'inherit'ed from a NUL parent, which threw them away (MPI-422).
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const name = path.basename(script);
  const relay = (text, isError) => {
    for (const line of String(text || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      log(`  [${name}] ${line}`);
      if (isError) LAST_HELPER_ERROR = line.trim();
    }
  };
  relay(result.stderr, true);
  if (!capture) relay(result.stdout);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited with code ${result.status}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function main(root) {
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

  log(`Checking for updates (${repo})...`);
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

  log('Applying update...');
  runHelper(applyScript, ['--root', root, '--bundle', bundle], false);
  log('Update applied successfully.');
}

// This file is staged at <portable-root>/update/win-update.cjs.
const ROOT = path.resolve(parseArgs(getCliArgs()).root || path.join(__dirname, '..'));
openLog(ROOT);
try {
  main(ROOT);
} catch (err) {
  log(`Update failed: ${err.message}`);
  writeResult(ROOT, LAST_HELPER_ERROR || err.message);
  process.exitCode = 1;
}
relaunch(ROOT);
