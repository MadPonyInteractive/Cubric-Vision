/**
 * globalSetup.js — refuse to run the desktop suite against somebody else's server.
 *
 * `server.js` hardcodes port 3000. When the app is already open, the Electron a
 * spec launches cannot bind it, so the test window loads the ALREADY-RUNNING
 * server instead. Nothing errors: the specs go green against a process the run
 * does not control, on whatever code that process started with. A green suite
 * that never touched your changes is worse than a red one.
 *
 * So the run aborts here instead, with the one instruction that fixes it.
 */
const net = require('net');

const PORT = 3000;   // must track `const port` in server.js

function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (err) => resolve(err.code !== 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // 127.0.0.1 specifically: that is the interface server.js binds, and a
    // wildcard probe would miss a loopback-only listener.
    probe.listen(port, '127.0.0.1');
  });
}

module.exports = async () => {
  if (await portIsFree(PORT)) return;
  throw new Error(
    `\n\n  Port ${PORT} is already in use — close Cubric Vision before running the desktop suite.\n\n` +
    `  The specs launch their own Electron, which forks its own server on ${PORT}. With the app\n` +
    `  open that fork cannot bind, and the test window silently loads the running app's server\n` +
    `  instead — the suite would pass without ever testing this working tree.\n\n` +
    `  Still stuck? Find the owner:  netstat -ano | findstr ":${PORT}"\n`
  );
};
