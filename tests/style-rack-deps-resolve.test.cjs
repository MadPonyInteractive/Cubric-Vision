/**
 * style-rack-deps-resolve.test.cjs — MPI-609.
 *
 * Every style-LoRA name baked into an `MpiStyleLoras` rack must name a real weight in
 * DEPS. Nothing in the app checks this: the picker sends an INDEX, the graph carries the
 * FILENAME, and the two are only ever joined at run time inside ComfyUI. A rack name that
 * no dep installs fails as `value_not_in_list` on the loader node — after the user waited
 * for a model download — and a dep whose file the rack never asks for is a silent 404 at
 * install time. Renaming the fifteen Klein style weights (MPI-609) is exactly the change
 * that breaks this, and it broke nothing loudly enough to notice.
 *
 * Baked rack values never pass through the MPI-229 dropdown heal, so the backslash
 * convention is asserted here too — a `/` in a baked name breaks any engine whose loader
 * enum is built with `\` (and vice versa on a remote Pod / Linux portable).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { DEPS } = require('../js/data/modelConstants/dependencies.js');

const WF_DIR = path.join(__dirname, '..', 'comfy_workflows');

/** Every non-empty `lora_*` value on every MpiStyleLoras node, per workflow file. */
function bakedRackNames(file) {
    const wf = JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
    const out = [];
    for (const [nodeId, node] of Object.entries(wf)) {
        if (!node || typeof node !== 'object') continue;
        if (node.class_type !== 'MpiStyleLoras') continue;
        for (const [key, value] of Object.entries(node.inputs || {})) {
            if (!key.startsWith('lora_')) continue;
            if (typeof value !== 'string' || !value || value === 'None') continue;
            out.push({ nodeId, key, value });
        }
    }
    return out;
}

const depFilenames = new Set(
    Object.values(DEPS).map(d => d.filename).filter(Boolean)
);

const workflows = fs.readdirSync(WF_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => bakedRackNames(f).length > 0);

test('some workflow actually bakes a style rack (guard against a vacuous sweep)', () => {
    assert.ok(workflows.length > 0, 'no workflow has an MpiStyleLoras node — this test would pass trivially');
    // Both Klein sizes carry a rack; if either stops, the sweep below silently shrinks.
    for (const f of ['klein_t2i.json', 'klein_9b_t2i.json']) {
        assert.ok(workflows.includes(f), `${f} has no baked style rack`);
    }
});

for (const file of workflows) {
    test(`${file}: every baked style-rack LoRA resolves to a DEPS filename`, () => {
        for (const { nodeId, key, value } of bakedRackNames(file)) {
            const filename = 'loras/' + value.replace(/\\/g, '/');
            assert.ok(
                depFilenames.has(filename),
                `${file} node ${nodeId} ${key} = "${value}" -> no DEPS entry has filename `
                + `"${filename}". A rack name nothing installs fails as value_not_in_list at run time.`
            );
        }
    });

    test(`${file}: baked style-rack LoRAs use the backslash convention (MPI-229)`, () => {
        for (const { nodeId, key, value } of bakedRackNames(file)) {
            assert.ok(
                !value.includes('/'),
                `${file} node ${nodeId} ${key} = "${value}" uses "/". Baked values never pass `
                + `through the dropdown heal, so the separator must be "\\".`
            );
        }
    });
}
