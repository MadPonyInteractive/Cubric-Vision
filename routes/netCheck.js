// Shared connectivity helpers (MPI-120).
//
// Two jobs:
//  1. isNetworkDownError(err) — classify a thrown fetch/socket error as
//     "host has no internet / DNS/route is dead" vs anything else (HTTP
//     status, transient proxy 5xx, app bug). Node's global fetch wraps the
//     real socket error in err.cause.code, NOT err.code — verified live.
//  2. checkOnline() — a real internet probe (HEAD to a known-good endpoint
//     with a short timeout), because navigator.onLine reports LAN, not the
//     internet. Used as a pre-flight before downloads + RunPod connect.

const logger = require('./logger');

// OS-level "the network can't reach anything" codes. NOT HTTP statuses.
const NETWORK_DOWN_CODES = new Set([
    'ENOTFOUND',   // DNS lookup failed (offline, bad DNS)
    'EAI_AGAIN',   // DNS temporary failure (offline)
    'ENETUNREACH', // no route to network
    'EHOSTUNREACH',// no route to host
    'ECONNREFUSED',// nothing listening (rarely "offline" but treat as down)
    'ECONNRESET',  // dropped mid-flight
    'ETIMEDOUT',   // connect timed out
]);

// True when the error means the host has no usable internet, so retrying is
// pointless and the right UX is an "offline" toast — distinct from a transient
// RunPod proxy 5xx (which SHOULD be retried).
function isNetworkDownError(err) {
    if (!err) return false;
    const code = err.code || (err.cause && err.cause.code);
    return NETWORK_DOWN_CODES.has(code);
}

// Probe real internet. HEAD a tiny, highly-available endpoint with a short
// timeout. Returns true if reachable, false if offline. Never throws.
// ponytail: single hard-coded probe endpoint with a fallback; swap to a
// configurable list only if this endpoint ever proves unreliable.
const PROBE_URLS = [
    'https://huggingface.co/',  // model downloads target this host
    'https://api.runpod.io/',   // RunPod connect targets this host
];

async function checkOnline({ timeoutMs = 4000 } = {}) {
    for (const url of PROBE_URLS) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            // HEAD avoids pulling a body. A reachable host = online, regardless
            // of HTTP status (even a 405/403 proves the network is up).
            await fetch(url, { method: 'HEAD', signal: ctrl.signal });
            clearTimeout(t);
            return true;
        } catch (err) {
            clearTimeout(t);
            // Only a network-down error (or abort/timeout) counts as "offline";
            // any HTTP-level response already returned above. Try next probe.
            if (!isNetworkDownError(err) && err.name !== 'AbortError') {
                // Unexpected error talking to this probe — try the next one,
                // but if it's not clearly network-down, lean toward "online"
                // to avoid false offline blocks.
                logger.warn('net', `connectivity probe ${url} odd error: ${err.message}`);
            }
        }
    }
    return false;
}

module.exports = { isNetworkDownError, checkOnline };
