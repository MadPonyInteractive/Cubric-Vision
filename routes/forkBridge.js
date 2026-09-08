/**
 * routes/forkBridge.js — the child→main request/response channel.
 *
 * The Express server runs as an Electron fork, so it cannot call `safeStorage`
 * itself. `main/secretsStore.js` answers over `process.send`/`process.on`
 * message pairs keyed by a random id; this is the child half.
 *
 * Extracted verbatim from `routes/remoteEngine.js` (MPI-677 step 1a) because the
 * enhance route needs the same channel for the DeepInfra key. There is ONE
 * `process.on('message')` listener for all callers — a second listener would see
 * every message and drop the ones it does not own, which works only until
 * someone reads the code and believes otherwise.
 *
 * A missing `process.send` (server run standalone via `npm run server`) resolves
 * `null` rather than throwing: no Electron main means no stored secret, which is
 * a real state, not an error.
 */

'use strict';

const crypto = require('crypto');

const _pending = new Map();
let _bridgeReady = false;

function _initBridge() {
  if (_bridgeReady) return;
  if (typeof process.on === 'function') {
    process.on('message', (msg) => {
      if (!msg || !msg.type || !msg.id) return;
      const entry = _pending.get(msg.id);
      if (!entry) return;
      _pending.delete(msg.id);
      entry.resolve(msg);
    });
    _bridgeReady = true;
  }
}

/**
 * Send `{ type, id, ...extra }` to the Electron main process and resolve with
 * the reply message, or `null` on timeout / no parent process.
 */
function ask(type, extra, timeoutMs = 5000) {
  _initBridge();
  return new Promise((resolve) => {
    if (typeof process.send !== 'function') return resolve(null);
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      _pending.delete(id);
      resolve(null);
    }, timeoutMs);
    _pending.set(id, {
      resolve: (m) => { clearTimeout(timer); resolve(m); },
    });
    process.send({ type, id, ...extra });
  });
}

module.exports = { ask };
