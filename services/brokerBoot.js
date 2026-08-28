'use strict';

/**
 * services/brokerBoot.js — MPI-10 broker boot helper (Vision side).
 *
 * Calls ensureBrokerBinary() + ensureBroker() from @cubric/connector so a real
 * family broker process is running before startConnectorResponder() attempts to
 * connect. Best-effort: returns null on any failure, Vision stays standalone.
 *
 * ── brokerCommand decision ──────────────────────────────────────────────────
 * The command is `[process.execPath, cliPath]` — OUR OWN Electron binary run as
 * Node — with ELECTRON_RUN_AS_NODE injected through ensureBroker's `env` option.
 * Three reasons, in order of how much they cost when ignored:
 *   - `node` is a CONSOLE-subsystem binary, and ensureBroker spawns detached.
 *     On Windows DETACHED_PROCESS makes CreateProcess IGNORE the CREATE_NO_WINDOW
 *     that `windowsHide` sets, so `['node', cliPath]` popped a real terminal
 *     window on every single app boot — one of the ~10 that read as malware
 *     (MPI-637). electron.exe is GUI-subsystem: it never gets a console at all,
 *     detached or not. Do not go back to bare `node` to "simplify" this.
 *   - Production portable ships no standalone Node binary, so `node` only ever
 *     worked in dev, on a machine that happened to have it on PATH.
 *   - `env` was NOT always available on ensureBroker — the earlier version of
 *     this comment rejected execPath because of that, and it is now wrong:
 *     EnsureBrokerOptions.env exists and documents this exact Electron case.
 *
 * ── sourceDir decision ──────────────────────────────────────────────────────
 * Vision ships no broker binary in its own resources. The dev sibling path
 * (c:\AI\Mpi\Cubric-Studio\packages\broker) is used when present; otherwise
 * a future shipped copy at resources/broker would take precedence.
 *
 * ensureBrokerBinary() installs/updates the broker to the per-user shared
 * location (%LOCALAPPDATA%\Cubric\bin\broker on Windows), so subsequent app
 * launches connect to the already-installed binary.
 */

const path = require('node:path');
const fs   = require('node:fs');

const VISION_ROOT = path.join(__dirname, '..');

/** Resolve the broker source dir (dist + package.json). Null if not found. */
function resolveBrokerSourceDir() {
  const shippedDir = path.join(VISION_ROOT, 'resources', 'broker');
  if (fs.existsSync(path.join(shippedDir, 'package.json'))) return shippedDir;

  const devSiblingDir = path.join(VISION_ROOT, '..', 'Cubric-Studio', 'packages', 'broker');
  if (fs.existsSync(path.join(devSiblingDir, 'package.json'))) return devSiblingDir;

  return null;
}

/**
 * Ensure the shared family broker is running. Returns the EnsureBrokerResult
 * on success, null if the broker cannot be started (Vision stays standalone).
 *
 * @returns {Promise<{ metadata: object, metadataPath: string, spawned: boolean } | null>}
 */
async function ensureFamilyBroker() {
  let connector;
  try {
    connector = await import('@cubric/connector');
  } catch {
    return null; // SDK not installed in this build.
  }

  const { ensureBrokerBinary, ensureBroker } = connector;

  const sourceDir = resolveBrokerSourceDir();
  if (!sourceDir) {
    // No broker source available — cannot install or spawn.
    return null;
  }

  try {
    const { cliPath } = await ensureBrokerBinary({ sourceDir });

    // Outside Electron (unit tests, a bare-node harness) execPath IS node and the
    // extra env var is inert, so one command covers both.
    const result = await ensureBroker({
      brokerCommand: [process.execPath, cliPath],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      readyTimeoutMs: 8000,
    });

    return result;
  } catch (err) {
    // Any failure (spawn error, timeout, version mismatch) is non-fatal.
    // Vision stays standalone — the connector responder simply won't start.
    const msg = err && err.message ? err.message : String(err);
    console.error('[brokerBoot] ensureBroker failed (non-fatal):', msg);
    return null;
  }
}

module.exports = { ensureFamilyBroker };
