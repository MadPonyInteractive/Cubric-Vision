#!/usr/bin/env node

// MPI-460 — pre-release reachability check for every download URL the app ships.
//
// The unit tests prove the download LOGIC offline; nothing proves the OBJECTS are still
// there. A moved R2 key, a deleted HF re-host or a mirror that quietly 404s is invisible
// until a user hits it — MPI-429 caught exactly that class by HEAD-ing all 96 mirrors BY
// HAND on 2026-08-03. This is that sweep, scripted.
//
// Network-bound, so it is a RELEASE step (`npm run release:deps`), not a CI test.
//
// Usage:
//   npm run release:deps            check primaries + mirrors
//   npm run release:deps -- --primary-only
//
// Exit 1 if any URL is unreachable. A dep whose primary is fine but whose mirror is dead
// still fails the run: a single-route dep is a regression, not a warning — that is the
// whole point of the second origin.

import process from 'node:process';
import { createRequire } from 'node:module';
import { DEPS } from '../js/data/modelConstants/dependencies.js';

const require = createRequire(import.meta.url);
// Reuse the REAL failover math rather than re-deriving the HF prefix rewrite here — a
// second copy would drift, and drift is the bug class this script exists to catch.
const { _mirrorUrlsFor } = require('../routes/downloadManager.js');

const PRIMARY_ONLY = process.argv.includes('--primary-only');
const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

// HEAD, following redirects — HF `resolve/main` answers 302 to its CDN, and GitHub
// archive zips redirect too. One retry, because a flaky check that cries wolf before a
// release gets ignored, which is worse than not having it.
async function reach(url) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (res.ok) return { ok: true, status: res.status };
            if (attempt) return { ok: false, status: res.status, note: `HTTP ${res.status}` };
        } catch (err) {
            if (attempt) return { ok: false, status: 0, note: err.message };
        }
    }
    return { ok: false, status: 0, note: 'unreachable' };
}

const targets = [];
const singleRoute = [];
for (const [id, dep] of Object.entries(DEPS)) {
    if (!dep || !dep.url) continue;
    targets.push({ id, url: dep.url, kind: 'primary' });
    const mirrors = _mirrorUrlsFor(dep.url, dep);
    // custom_nodes are github.com zips and single-route BY DESIGN — MPI-427 measured
    // github 45/45 against models.cubric.studio 0/44, so they neither need a mirror nor
    // have one. Listing them here would bury the weights that are single-route by accident.
    if (!mirrors.length && dep.type !== 'custom_nodes') {
        singleRoute.push({ id, reason: dep.noMirror ? 'noMirror' : 'no second origin' });
    }
    if (PRIMARY_ONLY) continue;
    for (const url of mirrors) targets.push({ id, url, kind: 'mirror' });
}

console.log(`Checking ${targets.length} URLs across ${Object.keys(DEPS).length} deps `
    + `(${CONCURRENCY} at a time)…\n`);

const failures = [];
let done = 0;
let cursor = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < targets.length) {
        const t = targets[cursor];
        cursor += 1;
        const res = await reach(t.url);
        done += 1;
        if (!res.ok) failures.push({ ...t, note: res.note });
        // Redrawn in place on a terminal; piped to a file or a CI log it would be 215 lines
        // of noise, so there it only speaks when something fails.
        if (process.stdout.isTTY) process.stdout.write(`\r  ${done}/${targets.length} checked, ${failures.length} failed`);
    }
}));
console.log('\n');

if (singleRoute.length) {
    console.log(`${singleRoute.length} weight(s) have NO second origin — a stall there has only `
        + 'the MPI-460 retry to save it (custom_nodes excluded, single-route by design):');
    for (const s of singleRoute) console.log(`  ${s.id}  (${s.reason})`);
    console.log('');
}

if (!failures.length) {
    console.log(`All ${targets.length} URLs reachable.`);
    process.exit(0);
}

console.log(`${failures.length} UNREACHABLE:`);
for (const f of failures) console.log(`  [${f.kind}] ${f.id}\n      ${f.url}\n      ${f.note}`);
console.log('\nA dead PRIMARY breaks the install outright. A dead MIRROR silently drops that dep '
    + 'to a single route — re-host it or set noMirror with a reason.');
process.exit(1);
