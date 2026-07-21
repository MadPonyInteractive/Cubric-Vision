/**
 * routes/workflowStatic.js — case-insensitive resolver for /comfy_workflows/*.
 *
 * Workflow files are fetched by name (comfyController + commandExecutor build
 * `/comfy_workflows/<file>` from the registry). express.static is CASE-SENSITIVE on
 * Linux/macOS, so a registry name whose case differs from the on-disk filename 404s
 * off Windows. This middleware mounts BEFORE express.static: an exact-case hit falls
 * straight through (`next()`), and only a miss triggers a one-shot case-insensitive
 * directory match. Covers every fetch site with no per-call-site change.
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', 'comfy_workflows');

// ponytail: cache the dir listing lazily; workflow files are static at runtime, and a
// missed exact-case hit is rare. Rebuild only when a lookup misses (a file was added).
let _cache = null;

function _index() {
    if (_cache) return _cache;
    _cache = new Map();
    try {
        for (const name of fs.readdirSync(WORKFLOWS_DIR)) {
            _cache.set(name.toLowerCase(), name);
        }
    } catch { /* dir missing → empty map, falls through to 404 */ }
    return _cache;
}

/**
 * Express middleware. Resolves a /comfy_workflows/<name> request to the real on-disk
 * file case-insensitively; passes everything else (and exact-case hits) to next().
 */
function workflowStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const prefix = '/comfy_workflows/';
    if (!req.path.startsWith(prefix)) return next();

    // Only the flat filename layer — no nested paths (there are none today).
    const rel = decodeURIComponent(req.path.slice(prefix.length));
    if (!rel || rel.includes('/') || rel.includes('\\')) return next();

    // Exact-case file exists → let express.static serve it (fast path).
    const exact = path.join(WORKFLOWS_DIR, rel);
    if (fs.existsSync(exact)) return next();

    // Case-insensitive match. Rebuild the index once on a miss (file may be new).
    let real = _index().get(rel.toLowerCase());
    if (!real) { _cache = null; real = _index().get(rel.toLowerCase()); }
    if (!real) return next();   // genuine 404 → static will 404 it

    return res.sendFile(path.join(WORKFLOWS_DIR, real));
}

module.exports = { workflowStatic };
