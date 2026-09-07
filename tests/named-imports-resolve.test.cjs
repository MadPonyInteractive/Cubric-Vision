'use strict';

// MPI-706 — every named import in js/ must resolve to a real export.
//
// Live 2026-09-07: the app would not boot. The renderer died on
//   SyntaxError: The requested module '../data/commandRegistry.js'
//   does not provide an export named 'getFilePrefix'
// and nothing downstream of that import ever ran — a blank landing page with a
// spinner that never resolves.
//
// It had been broken since f8a3096e, the sweep that ported twelve master fixes onto
// this line. MPI-660 moved output-file naming into `getFilePrefix`; the CONSUMER
// (js/services/generationService.js) came across and the PRODUCER did not. Nothing
// caught it:
//   - `npm test` passes, because no suite loads the renderer's module graph.
//   - eslint passes, because it does not resolve cross-module named exports.
//   - The app kept working for hours, because a RUNNING renderer already holds its
//     modules. Only the next restart pays. That delay is what let it reach a release
//     candidate — a shipped build would have failed on first launch, for every user.
//
// So this is a boot gate, not a style check: a broken named import in js/ is an app
// that does not start. Cheap enough to run on every commit (~1300 imports, well under
// a second) and it is the only layer that sees this class of break.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS_ROOT = path.join(__dirname, '..', 'js');

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gs;
const EXPORT_DECL = /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/gm;
const EXPORT_STAR = /^\s*export\s+\*\s+from\s*['"]([^'"]+)['"]/gm;

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

/** Named exports of `file`, following `export * from` one level at a time. */
function exportsOf(file, seen = new Set()) {
    if (seen.has(file) || !fs.existsSync(file)) return new Set();
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    const names = new Set();
    for (const [, name] of src.matchAll(EXPORT_DECL)) names.add(name);
    for (const [, block] of src.matchAll(EXPORT_LIST)) {
        for (const part of block.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            names.add(trimmed.includes(' as ') ? trimmed.split(' as ').pop().trim() : trimmed);
        }
    }
    for (const [, rel] of src.matchAll(EXPORT_STAR)) {
        for (const n of exportsOf(path.resolve(path.dirname(file), rel), seen)) names.add(n);
    }
    return names;
}

test('every named import in js/ resolves to a real export (MPI-706)', () => {
    const broken = [];
    let checked = 0;

    for (const file of walk(JS_ROOT)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const [, block, spec] of src.matchAll(IMPORT_RE)) {
            // Relative specifiers only: a bare specifier is a node_modules package, and
            // resolving those is npm's job, not this gate's.
            if (!spec.startsWith('.')) continue;
            const target = path.resolve(path.dirname(file), spec);
            // A relative path can still land in node_modules (js/utils/markdown.js reaches
            // marked's ESM bundle that way). Same rule, same reason — and the regexes below
            // cannot read a MINIFIED bundle anyway: they anchor `export {` to line start,
            // while marked ships its whole export list at the tail of one long line.
            if (target.split(path.sep).includes('node_modules')) continue;
            if (!fs.existsSync(target)) continue;   // missing FILE is a separate concern
            const available = exportsOf(target);
            for (const part of block.split(',')) {
                const want = part.trim().split(' as ')[0].trim();
                if (!want) continue;
                checked++;
                if (!available.has(want)) {
                    broken.push(`${path.relative(JS_ROOT, file)} imports '${want}' from ${spec}`);
                }
            }
        }
    }

    assert.ok(checked > 500, `expected to check hundreds of imports, only saw ${checked}`);
    assert.deepEqual(broken, [], `named imports with no matching export:\n  ${broken.join('\n  ')}`);
});
