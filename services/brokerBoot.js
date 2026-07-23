'use strict';

/**
 * services/brokerBoot.js — MPI-10 broker boot helper (Vision side).
 *
 * Calls ensureBrokerBinary() + ensureBroker() from @cubric/connector so a real
 * family broker process is running before startConnectorResponder() attempts to
 * connect. Best-effort: returns null on any failure, Vision stays standalone.
 *
 * ── brokerCommand decision ──────────────────────────────────────────────────
 * The command is `['node', cliPath]`. Reasoning:
 *   - server.js is a forked Node child process. In dev, `node` is always in
 *     PATH (the same toolchain that runs Electron dev mode). This is the
 *     simplest, most predictable option.
 *   - Using `process.execPath` (Electron binary) would require
 *     ELECTRON_RUN_AS_NODE=1 to be present in the inherited env. While Electron
 *     sets it when forking via child_process.fork(), the explicit `env:` option
 *     passed to fork() (buildServerEnv) spreads process.env of the PARENT (Electron
 *     main), which does NOT carry ELECTRON_RUN_AS_NODE. So execPath is unreliable
 *     without explicit env injection, which ensureBroker's spawn doesn't support.
 *   - Production portable: Vision ships no standalone Node binary. If/when a
 *     portable build needs to boot the broker, the brokerCommand here would
 *     need updating (options: ship Node alongside, or use the Electron binary
 *     with ELECTRON_RUN_AS_NODE injected via a wrapper shim). Deferred.
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

    const result = await ensureBroker({
      brokerCommand: ['node', cliPath],
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
