'use strict';

/**
 * connectorResponder.js — Vision's live connector responder (MPI-5).
 *
 * Vision registers with the Cubric hub broker and answers
 * `system.memory.release` by freeing GPU VRAM (its existing `/comfy/unload`
 * route). This is how Cubric Prompt asks Vision to release VRAM before running
 * local inference.
 *
 * Runs in the forked `server.js` process (it owns `/comfy/unload` on port 3000).
 * `@cubric/connector` is ESM-only, so it is loaded via dynamic `import()` — the
 * same pattern server.js already uses for axios. Everything is BEST-EFFORT: if
 * the broker is absent, the responder simply does not start; Vision keeps
 * working as a standalone app.
 */

const VISION_PORT = 3000;

/**
 * Pure handler: map a `system.memory.release` request to a POST /comfy/unload
 * and build the response envelope. Exported for direct unit testing (no broker).
 *
 * @param {object} request  the CubricCapabilityRequest
 * @param {object} [opts]
 * @param {string} [opts.unloadUrl]  override the /comfy/unload URL (tests)
 * @param {Function} [opts.fetchImpl]  override fetch (tests)
 */
async function handleMemoryRelease(request, opts = {}) {
  const unloadUrl = opts.unloadUrl || `http://127.0.0.1:${VISION_PORT}/comfy/unload`;
  const fetchImpl = opts.fetchImpl || fetch;
  const deep = !!(request && request.input && request.input.deep);
  const from = { appId: 'cubric.vision', displayName: 'Cubric Vision' };

  try {
    const res = await fetchImpl(unloadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deep }),
    });
    const body = await res.json().catch(() => ({}));
    const success = res.ok && body.success !== false;
    return {
      schemaVersion: 1,
      requestId: request.requestId,
      ok: success,
      from,
      capability: 'system.memory.release',
      output: { success, deep, message: body.message },
    };
  } catch (err) {
    return {
      schemaVersion: 1,
      requestId: request.requestId,
      ok: false,
      from,
      capability: 'system.memory.release',
      error: {
        code: 'RUNTIME_ERROR',
        message: err && err.message ? err.message : 'Memory release failed.',
      },
    };
  }
}

/**
 * Start the responder: connect to the broker, register Vision's manifest, and
 * register the `system.memory.release` handler. Best-effort — resolves to
 * `null` (does not throw) when the broker is unreachable.
 *
 * @param {object} opts
 * @param {string} opts.manifestPath  absolute path to the connector manifest
 * @returns {Promise<{ close: () => Promise<void> } | null>}
 */
async function startConnectorResponder(opts) {
  const manifestPath = opts && opts.manifestPath;
  if (!manifestPath) return null;
  let connector;
  try {
    connector = await import('@cubric/connector');
  } catch {
    return null; // SDK not installed in this build — stay standalone.
  }
  try {
    const client = connector.createBrokerConnectorClient({
      appId: 'cubric.vision',
      displayName: 'Cubric Vision',
      appVersion: '0.0.1',
      manifestPath,
    });
    client.onCapabilityRequest('system.memory.release', (req) =>
      handleMemoryRelease(req),
    );
    // Force connect + handshake so the broker registers this session and can
    // forward requests to it. A missing broker rejects here — swallow it.
    await client.discoverApps();
    return { client, close: () => client.close() };
  } catch {
    return null; // No broker running — Vision stays standalone.
  }
}

/**
 * Caller: is `cubric.prompt` registered and does it advertise `prompt.enhance`?
 * Used to gate the PromptBox Enhance control. Returns false on any error.
 *
 * @param {object} client  a connected BrokerConnectorClient
 */
async function isPromptEnhanceAvailable(client) {
  if (!client) return false;
  try {
    const caps = await client.listCapabilities('cubric.prompt');
    return caps.some((c) => c.id === 'prompt.enhance');
  } catch {
    return false;
  }
}

/**
 * Caller: ask Cubric Prompt to enhance a prompt over the broker. Builds the
 * `prompt.enhance` request from PromptBox-shaped input and returns the response.
 *
 * @param {object} client  a connected BrokerConnectorClient
 * @param {object} input   { prompt, negativePrompt?, targetModelId?, operation?, injectionParams? }
 */
async function requestEnhance(client, input) {
  const { randomUUID } = require('node:crypto');
  return client.requestCapability({
    schemaVersion: 1,
    requestId: randomUUID(),
    from: { appId: 'cubric.vision', displayName: 'Cubric Vision' },
    to: { appId: 'cubric.prompt' },
    capability: 'prompt.enhance',
    input,
    timeoutMs: 30000,
  });
}

module.exports = {
  handleMemoryRelease,
  startConnectorResponder,
  isPromptEnhanceAvailable,
  requestEnhance,
};
