// The auto-mask path does NOT go through `commandRegistry.injectParams`, so
// `inject-params-titles.test.cjs` never sees it: `runAutoMask` builds its params
// object inline in commandExecutor.js. The injector still matches nodes BY TITLE and
// still SILENTLY SKIPS a param with no matching node — so a renamed node or a typo'd
// key produces a dead control with no error, no log and no toast.
//
// MPI-380 renamed three of these keys at once (the SAM 1 points branch became SAM3),
// which is exactly when that silent skip bites. This guard closes the gap.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const EXECUTOR = path.join(ROOT, 'js/services/commandExecutor.js');
const WORKFLOW = path.join(ROOT, 'comfy_workflows/img_auto_mask.json');

/** The `const params = { ... }` object inside the autoMaskImg dispatch block. */
function autoMaskParamKeys(src) {
    const at = src.indexOf("getUniversalWorkflow('autoMaskImg')");
    assert.ok(at > 0, 'autoMaskImg dispatch block not found — this test needs re-anchoring');
    const open = src.indexOf('const params = {', at);
    assert.ok(open > 0, 'params object not found after the autoMaskImg dispatch');
    const body = src.slice(open, src.indexOf('\n        };', open));
    // Keys only: strip line comments first so prose cannot masquerade as a key.
    const keys = body
        .split('\n')
        .filter(l => !l.trim().startsWith('//'))
        .flatMap(l => [...l.matchAll(/^\s{12}'?([A-Za-z_][\w.]*)'?:/g)].map(m => m[1]));
    assert.ok(keys.length >= 5, `expected the full params object, parsed only: ${keys}`);
    return keys;
}

const titles = new Set(
    Object.values(JSON.parse(fs.readFileSync(WORKFLOW, 'utf8')))
        .map(n => n?._meta?.title)
        .filter(Boolean),
);

test('every auto-mask injected title exists in img_auto_mask.json', () => {
    for (const key of autoMaskParamKeys(fs.readFileSync(EXECUTOR, 'utf8'))) {
        // A dotted key targets a FIELD on a titled node — match the node half.
        const node = key.split('.')[0];
        assert.ok(titles.has(node), `injected param "${key}" has no node titled "${node}"`);
    }
});

test('the SAM3 points branch is wired, not just titled', () => {
    const wf = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
    const byTitle = (t) => Object.entries(wf).find(([, n]) => n?._meta?.title === t);

    const [sam3Id, sam3] = Object.entries(wf).find(([, n]) => n.class_type === 'SAM3_Detect') || [];
    assert.ok(sam3Id, 'SAM3_Detect is gone from the points branch');

    // forceInput STRING: these MUST arrive as links from a string node, never as
    // widget values, or ComfyUI rejects the prompt.
    for (const [slot, title] of [
        ['positive_coords', 'Input_Points_Positive'],
        ['negative_coords', 'Input_Points_Negative'],
    ]) {
        const link = sam3.inputs[slot];
        assert.ok(Array.isArray(link), `SAM3_Detect.${slot} must be a link, got ${JSON.stringify(link)}`);
        const [srcId] = byTitle(title);
        assert.strictEqual(link[0], srcId, `SAM3_Detect.${slot} is not fed by ${title}`);

        // MpiText, NOT MpiString. `MpiString` is in comfyController's
        // PATH_MEDIA_CLASSES, so a param aimed at one is treated as MEDIA: it gets
        // run through _resolveMediaPath and, on a remote engine, _uploadRemoteMedia.
        // These params carry JSON coordinates, not a path — as MpiString the remote
        // leg would try to upload a file named `[{"x":..,"y":..}]` and die.
        assert.strictEqual(
            wf[srcId].class_type, 'MpiText',
            `${title} must be MpiText — MpiString would send these coords through media staging`,
        );
    }

    // SAM3's mask has to reach the picker chain, or a run returns nothing.
    const consumer = Object.values(wf).find(n => n.inputs?.mask?.[0] === sam3Id);
    assert.ok(consumer, 'nothing consumes SAM3_Detect.masks');
});

test('the retired SAM 1 points plumbing is gone', () => {
    const src = fs.readFileSync(EXECUTOR, 'utf8');
    for (const dead of ['Input_Points_Mask', 'Input_Points.threshold', 'pointsThreshold']) {
        assert.ok(!src.includes(dead), `${dead} still referenced in commandExecutor.js`);
    }
    assert.ok(!titles.has('Input_Points_Mask'), 'Input_Points_Mask node still in the workflow');

    // SAM 1 is deliberately KEPT for the segment-branch refine — assert it, so a
    // future cleanup pass cannot quietly delete the loader the detector depends on.
    const wf = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
    const sam1 = Object.entries(wf).find(([, n]) => n.class_type === 'SAMLoader');
    assert.ok(sam1, 'SAMLoader (SAM 1) was removed — the segment branch still needs it');
    const refiner = Object.values(wf).find(n => n.inputs?.sam_model_opt?.[0] === sam1[0]);
    assert.ok(refiner, 'SAM 1 is loaded but no longer refines anything');
});
