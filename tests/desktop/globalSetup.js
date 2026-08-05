/**
 * globalSetup.js — give the run its OWN port, so it can never test somebody else's server.
 *
 * The suite used to demand port 3000 be free and abort otherwise, because
 * `server.js` hardcoded it: with the app open, the Electron a spec launches could
 * not bind, the test window loaded the ALREADY-RUNNING server, and the specs went
 * green against a process the run does not control — `CUBRIC_E2E_USER_DATA`
 * isolation bypassed without one error. The abort was a warning about a footgun
 * that should not exist (MPI-448).
 *
 * Now the port is a value (`CUBRIC_PORT`, read by server.js and main.js), and this
 * hook picks a free one per run. Playwright forks its workers AFTER globalSetup, so
 * `process.env` set here reaches every spec — and each spec's launch block already
 * spreads `process.env` into the Electron env, so the app fork inherits it too.
 *
 * The silent attach is dead on the other side as well: server.js exits non-zero on
 * EADDRINUSE and main.js turns that into a fatal, so even a lost race fails loudly.
 */
const net = require('net');

/** Ask the OS for an unused loopback port (bind :0, read it back, release it). */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    // 127.0.0.1 specifically: that is the interface server.js binds, and a
    // wildcard probe would miss a loopback-only listener.
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

module.exports = async () => {
  process.env.CUBRIC_PORT = String(await freePort());
  console.log(`[desktop suite] port ${process.env.CUBRIC_PORT} — a dev app on 3000 is left alone.`);
};
