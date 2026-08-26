/**
 * seed-uint32-range.test.cjs — MPI-622.
 *
 * `generateRandomSeed()` returned up to 1e14, because core KSampler takes a 64-bit seed and
 * nothing in the fleet had ever objected. `FL_ChatterboxVC` objects: it raises
 * `ValueError: Seed must be between 0 and 2**32 - 1`. The odds of 1e14 landing under the
 * 4.29e9 ceiling by chance are ~1 in 23,000, so Voice Changer could not complete a single
 * generation from the app — and the failure surfaced as a ComfyUI node error, which reads as
 * a broken engine or a stale install rather than as an out-of-range app-side value.
 *
 * Source-text assertions, in the style of comfy-port-lockstep.test.cjs: `comfyController.js`
 * is renderer ESM and imports `state.js`, so it cannot be imported headlessly. Reading the
 * file is what keeps this honest — a mock of the function would pass while the real one
 * regressed, which is the bug this exists to catch.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const UINT32_CEILING = 2 ** 32;

test('generateRandomSeed cannot exceed 2**32 - 1', () => {
    const src = read('js/services/comfyController.js');
    const m = src.match(/generateRandomSeed\(\)\s*\{\s*return Math\.floor\(Math\.random\(\)\s*\*\s*([^)]+)\)/);
    assert.ok(m, 'comfyController.js must define generateRandomSeed() as Math.floor(Math.random() * <max>)');

    // The multiplier is written as an expression (`2 ** 32`), so it is evaluated rather
    // than parsed. The input is a capture group out of our own committed source.
    const max = Function(`"use strict"; return (${m[1].trim()});`)();
    assert.ok(Number.isFinite(max), `the multiplier must be a plain number, got "${m[1]}"`);
    assert.ok(max <= UINT32_CEILING,
        `seeds must fit uint32: ${max} > ${UINT32_CEILING}. FL_ChatterboxVC rejects anything `
        + 'larger and every Voice Changer run dies with "Seed must be between 0 and 2**32 - 1".');

    // Guard the other end too — a cap so low it collapses the seed space is its own bug.
    assert.ok(max > 2 ** 24, `the seed space must stay large; ${max} is too small to be useful`);
});

test('the Voice Changer graph really does take its seed from Input_Seed', () => {
    // The cap above only protects this flow if the node it feeds is wired to the app's seed.
    // If FL_ChatterboxVC ever stops reading Input_Seed, the cap stops being the thing that
    // keeps it in range and this suite would go on passing for the wrong reason.
    const graph = JSON.parse(read('comfy_workflows/flow_voice_changer.json'));

    const vc = Object.values(graph).find(n => n.class_type === 'FL_ChatterboxVC');
    assert.ok(vc, 'flow_voice_changer.json must hold an FL_ChatterboxVC node');

    const seedLink = vc.inputs?.seed;
    assert.ok(Array.isArray(seedLink), 'FL_ChatterboxVC.seed must be a link, not a literal');

    const seedNode = graph[seedLink[0]];
    assert.strictEqual(seedNode?.class_type, 'MpiInt');
    assert.strictEqual(seedNode?._meta?.title, 'Input_Seed',
        'the seed node must keep the Input_Seed title — that title is how _buildParams finds it');
});
