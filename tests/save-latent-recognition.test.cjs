/**
 * tests/save-latent-recognition.test.cjs — MPI-452
 *
 * Every latent-saving node in every shipped workflow must be recognised by the
 * `saveLatentNodeIds` filter in js/services/commandExecutor.js. That set gates
 * `_collectComfyLatents`, so a node it misses is a latent the app never learns about:
 * `previewAssets.latent` arrives with no filename, materialization records
 * `status: 'missing'`, and EVERY preview silently falls back to the COLD path and re-runs
 * the whole workflow — producing a different sample than the one the user approved.
 *
 * That is not hypothetical. `MpiSaveLatent` (H3's NestedTensor-capable twin of core
 * SaveLatent) was missing from the filter, and because H3 is the only graph that uses it
 * while LTX and WAN all use core `SaveLatent`, the fleet looked healthy while H3's Continue
 * was dead on arrival. The failure is SILENT — a working-looking video comes back — which
 * is why this is pinned by a test rather than left to a manual pass.
 *
 * Adding a new save-latent class means updating BOTH the filter and this test.
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_DIR = path.join(__dirname, '..', 'comfy_workflows');
const EXECUTOR = path.join(__dirname, '..', 'js', 'services', 'commandExecutor.js');

/** Mirrors the saveLatentNodeIds predicate in commandExecutor.js. */
function isRecognisedSaveLatent(node) {
    return node.class_type === 'SaveLatent'
        || node.class_type === 'MpiSaveLatent'
        || String(node._meta?.title || '').toLowerCase() === 'savelatent';
}

test('the executor filter still lists every class this test mirrors', () => {
    // Guard against the mirror drifting from the real predicate: if someone adds a class
    // to commandExecutor.js but not here, the sweep below would pass while missing it.
    const src = fs.readFileSync(EXECUTOR, 'utf8');
    const block = src.slice(src.indexOf('const saveLatentNodeIds'));
    for (const cls of ['SaveLatent', 'MpiSaveLatent']) {
        assert.ok(
            block.includes(`class_type === '${cls}'`),
            `commandExecutor.js no longer matches ${cls} — update the filter or this mirror`,
        );
    }
});

test('every save-latent node in every shipped workflow is recognised', () => {
    const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.json'));
    assert.ok(files.length, 'no workflows found — wrong directory?');

    const unrecognised = [];
    let recognisedCount = 0;

    for (const file of files) {
        let graph;
        try {
            graph = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8'));
        } catch {
            continue;   // not an API-format graph
        }
        if (!graph || typeof graph !== 'object') continue;

        for (const [id, node] of Object.entries(graph)) {
            if (!node || typeof node.class_type !== 'string') continue;
            // Anything whose class NAME claims to save a latent must be recognised.
            if (!/savelatent/i.test(node.class_type)) continue;
            if (isRecognisedSaveLatent(node)) recognisedCount++;
            else unrecognised.push(`${file} node ${id} (${node.class_type}, title="${node._meta?.title || ''}")`);
        }
    }

    assert.deepStrictEqual(
        unrecognised, [],
        'save-latent nodes the app would never collect (Continue silently re-runs the whole '
        + 'workflow instead of resuming):\n  ' + unrecognised.join('\n  '),
    );
    // The suite must actually have looked at something, or a rename to the workflow
    // directory would turn this into a green no-op.
    assert.ok(recognisedCount > 0, 'no save-latent nodes scanned at all — check WORKFLOW_DIR');
});

test('H3 specifically — the graph that exposed the gap', () => {
    const h3 = path.join(WORKFLOW_DIR, 'minimax_h3_fl2va.json');
    if (!fs.existsSync(h3)) return;   // model removed; nothing to pin
    const graph = JSON.parse(fs.readFileSync(h3, 'utf8'));
    const savers = Object.values(graph).filter(n => /savelatent/i.test(n.class_type || ''));
    assert.ok(savers.length, 'H3 must still save a stage-1 latent, or two-stage Continue is gone');
    for (const n of savers) assert.ok(isRecognisedSaveLatent(n), `H3 ${n.class_type} unrecognised`);
    // The title trap: _latentRoleFromTitle tags ANY title containing "audio" as the audio
    // latent, and H3 has no second slot for one. generate_h3.py asserts this too; pinning
    // it here as well means a hand-edited runtime JSON cannot slip past the generator.
    for (const n of savers) {
        assert.ok(
            !String(n._meta?.title || '').toLowerCase().includes('audio'),
            `H3 latent title "${n._meta?.title}" contains "audio" — would be mis-tagged as the audio latent`,
        );
    }
});
