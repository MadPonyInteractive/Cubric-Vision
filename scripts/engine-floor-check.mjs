#!/usr/bin/env node
/**
 * engine-floor-check.mjs — gate 5 of docs/playbooks/bump-engine/.
 *
 * Assert that every `class_type` used by a shipped runtime workflow actually
 * REGISTERS on a live engine. This is the empirical floor: it replaces guessing
 * which custom nodes a core bump broke by asking the engine that just installed.
 *
 * On the 0.29.2 -> 0.30.0 bump this is what cleared all 14 pinned nodes at once —
 * 167 class_types, 0 missing — after release notes said nothing useful either way.
 *
 *   node scripts/engine-floor-check.mjs                 # the app engine on 48188
 *   node scripts/engine-floor-check.mjs --url http://127.0.0.1:8188
 *
 * Exit 0 = every class_type registers. Exit 1 = at least one does not (or the
 * engine is not reachable), and the missing ones are printed with the workflows
 * that use them. Feed a missing class_type to scripts/resolve-comfy-node.mjs to
 * find which node pack ships it.
 *
 * NOT a substitute for the smoke run: registering says a node LOADED, not that the
 * graph runs. MPI-465 threw at sampling start with every class_type registered.
 */

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = path.join(REPO, 'comfy_workflows');

const argv = process.argv.slice(2);
const urlArg = argv.indexOf('--url');
const ENGINE = urlArg >= 0 ? argv[urlArg + 1] : `http://127.0.0.1:${process.env.CUBRIC_COMFY_PORT || 48188}`;

// Top level only. Subfolders hold raw LiteGraph exports and display assets, not the
// API-format graphs the app actually dispatches.
const files = (await fs.readdir(WF_DIR)).filter((f) => f.endsWith('.json'));
if (!files.length) {
    console.error(`✗ no workflows found in ${WF_DIR}`);
    process.exit(1);
}

/** class_type -> workflow files that use it */
const used = new Map();
for (const file of files) {
    let graph;
    try {
        graph = JSON.parse(await fs.readFile(path.join(WF_DIR, file), 'utf8'));
    } catch (e) {
        console.error(`✗ ${file}: ${e.message}`);
        process.exit(1);
    }
    for (const node of Object.values(graph)) {
        const ct = node && node.class_type;
        if (!ct) continue;
        if (!used.has(ct)) used.set(ct, new Set());
        used.get(ct).add(file);
    }
}

// stdlib http.get, not fetch — same reasoning as workflow-to-api.mjs: undici's
// keep-alive socket teardown aborts the process on Windows (`UV_HANDLE_CLOSING`
// assertion), which turns this gate's exit 1 into a meaningless 127.
function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, { headers: { connection: 'close' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (body += c));
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

let objectInfo;
try {
    objectInfo = await getJson(`${ENGINE}/object_info`);
} catch (e) {
    console.error(`✗ ${ENGINE}/object_info unreachable (${e.message}).`);
    console.error('  Start the engine at the NEW pin first — a floor check against a dead or old engine proves nothing.');
    process.exit(1);
}

const registered = new Set(Object.keys(objectInfo));
const missing = [...used.keys()].filter((ct) => !registered.has(ct)).sort();

console.log(`engine ${ENGINE} · ${registered.size} class_types registered`);
console.log(`workflows ${files.length} · class_types used ${used.size} · missing ${missing.length}`);

if (missing.length) {
    console.error('\n✗ FLOOR CHECK FAILED — these do not register:\n');
    for (const ct of missing) console.error(`  ${ct}  <- ${[...used.get(ct)].sort().join(', ')}`);
    console.error('\n  node scripts/resolve-comfy-node.mjs <class_type>   # which node pack ships it');
    process.exit(1);
}

console.log('\n✓ every class_type used by a shipped workflow registers on this engine.');
console.log('  Registering is NOT running — the smoke matrix (01-smoke-run.md) is still required.');
