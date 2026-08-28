#!/usr/bin/env node
/**
 * launch-instance.mjs — start an app instance that CANNOT disturb an open one.
 *
 * An agent that needs a live app must never take the user's: `npm start` beside a
 * running instance loses the `userData`-keyed single-instance lock and dies in ~2.3s
 * with exit 0, no window and nothing in app.log, and driving :3000 instead mutates
 * the user's real session. Both halves are needed to avoid that — an own profile AND
 * an own port — which is exactly the pair that kept getting half-remembered (MPI-458).
 * So it is one command, not a recipe to reassemble.
 *
 *   node scripts/launch-instance.mjs      # or: npm run app:isolated
 *
 * Prints `READY <url>` once the server answers; drive that URL, never 3000.
 * Run it with the Bash tool's run_in_background — a shell `&` drops the Electron
 * runtime. Do NOT pipe it into `tail`: that buffers until the stream ends, so the
 * READY line never appears and a working launch reads as a hang.
 *
 * STOPPING IT NEEDS THE PROCESS TREE. TaskStop (or killing the shell) reaps the
 * wrapper and LEAVES THE ELECTRON RUNNING — measured 2026-08-08, an instance kept
 * serving its port long after its task was "stopped". Find the listener and kill its
 * tree, and check the parent chain first so you cannot walk into the user's app:
 *   (Get-NetTCPConnection -LocalPort <port> -State Listen).OwningProcess
 *   taskkill /PID <root-of-that-tree> /T /F
 */
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// The profile is a STABLE path, not a random one, so an engine install or a settings
// change survives into this agent's next launch instead of replaying first-run every
// time. Delete the directory to start clean.
const PROFILE = process.env.CUBRIC_AGENT_PROFILE
  || path.join(os.tmpdir(), 'cubric-agent-profile');

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  // 127.0.0.1 specifically — server.js binds loopback, and a wildcard probe would
  // miss a loopback-only listener (same reasoning as tests/desktop/globalSetup.js).
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const listening = (port) => new Promise((resolve) => {
  const sock = net.connect({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.destroy(); resolve(true); });
  sock.once('error', () => resolve(false));
  sock.setTimeout(700, () => { sock.destroy(); resolve(false); });
});

const port = await freePort();
fs.mkdirSync(PROFILE, { recursive: true });

if (await listening(3000)) {
  console.log('[isolated] an app already owns :3000 — leaving it alone.');
}
console.log(`[isolated] profile ${PROFILE}`);
console.log(`[isolated] port    ${port}`);

// CUBRIC_BACKGROUND: park the window off-screen, no splash, no focus steal (MPI-640)
// — an agent instance must not climb over whatever the user is doing on their screen.
// Set it to 0 in the caller's env for the run where you want to watch the window.
const env = {
  CUBRIC_BACKGROUND: '1',
  ...process.env,
  CUBRIC_USER_DATA_ROOT: PROFILE,
  CUBRIC_PORT: String(port),
};
// The agent sandbox sets this to 1, which runs main.js as plain Node — `app` is then
// undefined and it dies on app.getPath. Must be gone from the CHILD's env.
delete env.ELECTRON_RUN_AS_NODE;

// require('electron') resolves the real binary per-platform. Never the .bin/electron.cmd
// shim: Node 24's spawn() rejects a .cmd with EINVAL.
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, ['.'], { env, stdio: 'inherit' });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
child.on('exit', (code) => process.exit(code ?? 0));

// Readiness is proved by the server answering, not by the process still being up —
// a lock-quit stays "up" for two seconds and answers nothing.
const url = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
  if (child.exitCode !== null) break;
  const res = await fetch(`${url}/comfy/get-path`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
  if (res?.ok) { console.log(`READY ${url}`); break; }
}
