'use strict';

// MPI-677 step 4 — the retrieval path (`docs/agent-corpus.md`, decision 4).
// Run: node tests/agent-corpus.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.
//
// Three things are worth asserting and nothing else is:
//
//  1. **Every declared mode is reachable.** The corpus is generated from
//     RECIPE_REGISTRY, so a recipe that gains a mode gains an entry with nobody
//     editing this file. A mode that silently stops appearing is invisible — the
//     agent just never cites that model and no error is raised.
//  2. **`text()` is not called during listing.** The laziness is the whole design:
//     listing must stay a readdir. Asserted by COUNTING reads, not by reading the
//     source — `fs.readFileSync` is patched on the core module object, which the
//     ESM module resolves at call time, so a regression to eager reads fails here.
//  3. **An `app` entry resolves to real file content**, which is the half that can
//     break from outside the code (a moved directory, an excluded build path).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { RECIPE_REGISTRY } = require('../js/data/recipes/registry.js');

// Patch BEFORE the corpus module is loaded so nothing eager escapes the count.
let reads = 0;
const realReadFileSync = fs.readFileSync;
fs.readFileSync = function (...args) { reads++; return realReadFileSync.apply(this, args); };

const { listCorpus, AGENT_DOCS_DIR } = require('../services/agentCorpus.mjs');

function testEveryDeclaredModeIsInTheCorpus() {
    const entries = listCorpus();
    const ids = new Set(entries.filter((e) => e.kind === 'model').map((e) => e.id));

    let modeCount = 0;
    for (const recipe of RECIPE_REGISTRY) {
        for (const mode of Object.keys(recipe.modes ?? {})) {
            modeCount++;
            assert.ok(ids.has(`${recipe.modelId}:${mode}`),
                `${recipe.modelId}:${mode} is declared but missing from the corpus`);
        }
    }
    assert.strictEqual(ids.size, modeCount, 'one entry per declared mode, no duplicates');
    assert.ok(RECIPE_REGISTRY.length >= 12, `expected the full v1 set, found ${RECIPE_REGISTRY.length}`);
}

function testAModelEntryRendersItsBrief() {
    const entry = listCorpus().find((e) => e.id === 'minimax-h3:r2v');
    assert.ok(entry, 'minimax-h3:r2v must be in the corpus');
    assert.strictEqual(typeof entry.text, 'function', 'text is called, never read');
    const text = entry.text();
    assert.ok(text.startsWith('# MiniMax H3 — r2v'), 'the brief must be the rendered recipe, not a restatement');
    assert.ok(entry.tags.includes('minimax-h3') && entry.tags.includes('r2v'),
        `tags must carry the id and the mode, got ${entry.tags.join(', ')}`);
}

function testListingReadsNoFiles() {
    // The one assertion that defends the design rather than the output. Reset the
    // counter, list, and require it to stay put: every `text()` is a closure, so a
    // listing touches the disk exactly once (the readdir) and never for content.
    reads = 0;
    const entries = listCorpus();
    assert.strictEqual(reads, 0, `listCorpus() read ${reads} file(s) — text() must stay lazy`);
    assert.ok(entries.every((e) => typeof e.text === 'function'), 'every entry defers its text');

    // ...and calling one DOES read, which is what makes the count above meaningful.
    const app = entries.find((e) => e.kind === 'app');
    assert.ok(app, 'at least one docs/agent/*.md must ship');
    app.text();
    assert.strictEqual(reads, 1, 'calling text() on an app entry reads exactly its own file');
}

function testAnAppEntryResolvesToRealContent() {
    const entry = listCorpus().find((e) => e.id === 'app:prompt-enhancement');
    assert.ok(entry, 'the seed doc must be in the corpus');
    assert.strictEqual(entry.kind, 'app');
    assert.strictEqual(entry.title, 'Prompt enhancement', 'the title comes from the filename');
    assert.ok(entry.tags.includes('app'), 'an app entry is tagged as one');

    const text = entry.text();
    assert.ok(text.includes('# Prompt enhancement'), 'text() must return the file, not a summary');
    assert.strictEqual(text, realReadFileSync(path.join(AGENT_DOCS_DIR, 'prompt-enhancement.md'), 'utf8'));
}

const tests = [
    testEveryDeclaredModeIsInTheCorpus,
    testAModelEntryRendersItsBrief,
    testListingReadsNoFiles,
    testAnAppEntryResolvesToRealContent,
];

let failed = 0;
for (const t of tests) {
    try {
        t();
        console.log(`  ok  ${t.name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${t.name}\n    ${err.message}`);
    }
}
fs.readFileSync = realReadFileSync;
console.log(failed ? `\n${failed} of ${tests.length} agent corpus tests FAILED.` : `\nAll ${tests.length} agent corpus tests passed.`);
if (failed) process.exitCode = 1;
