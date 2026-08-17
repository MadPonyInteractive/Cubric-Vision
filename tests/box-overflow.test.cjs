/**
 * box-overflow.test.cjs — MPI-325.
 *
 * A box step declaring `overflow: 'allow'` may be dragged PAST the frame edge,
 * so a square can sit tight on an edge-adjacent head instead of growing until it
 * swallows the neighbour (the MPI-324 validation run swapped the wrong face).
 *
 * The fragile half is that the two boxes reach DIFFERENT consumers and only one
 * of them can lose anything:
 *   - box1 -> `Mpi Box Mask` -> `InpaintCropImproved`. The mask is full-frame and
 *     clips at the edge; node 21 re-squares the region itself before sampling. No
 *     pad, and padding the SOURCE would grow the delivered picture.
 *   - box2 -> `Mpi Box Crop` -> straight into `image2` on the text encoder. The
 *     intersection is a squashed reference head unless the node pads it back out.
 * Turn one on without the other and Head Swap breaks quietly, so both halves are
 * pinned here together.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const read = p => fs.readFileSync(repo(p), 'utf8');
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

test('the injector passes a NEGATIVE origin through unchanged', async () => {
    const { injectHeadSwap } = await esm('js/services/workflowInjectors/headSwapInjector.js');
    const wf = {
        90: { _meta: { title: 'Input_Box' }, inputs: { x: 0, y: 0, width: 512, height: 512 } },
        88: { _meta: { title: 'Input_Box_2' }, inputs: { x: 0, y: 0, width: 512, height: 512 } },
    };

    injectHeadSwap(wf, {
        box1: { x: -200, y: -50, width: 716, height: 716 },
        box2: { x: 1332, y: 301, width: 716, height: 716 },
    });

    // Clamping the origin to 0 here would MOVE the box off the head — the exact
    // silent rewrite this injector used to do.
    assert.deepStrictEqual(wf[90].inputs, { x: -200, y: -50, width: 716, height: 716 });
    assert.deepStrictEqual(wf[88].inputs, { x: 1332, y: 301, width: 716, height: 716 });
});

test('a zero or absent extent is still guarded', async () => {
    const { injectHeadSwap } = await esm('js/services/workflowInjectors/headSwapInjector.js');
    const wf = { 90: { _meta: { title: 'Input_Box' }, inputs: {} } };

    injectHeadSwap(wf, { box1: { x: -10, y: -10, width: 0 } });

    assert.strictEqual(wf[90].inputs.width, 1, 'zero extent is not a region');
    assert.strictEqual(wf[90].inputs.height, 1, 'absent extent is not a region');
    assert.strictEqual(wf[90].inputs.x, -10, 'but the origin keeps its sign');
});

test('cropTool only lifts the bound when asked, and never lets the centre leave', () => {
    const src = read('js/utils/cropTool.js');

    assert.match(src, /allowOverflow = false/, 'default OFF — MpiVideoViewer must not change');
    assert.match(
        src,
        /\?\s*Math\.max\(-size \/ 2, Math\.min\(v, 1 - size \/ 2\)\)/,
        'overflow is bounded to half the box, so its centre stays over the content',
    );
    assert.match(
        src,
        /:\s*Math\.max\(0, Math\.min\(v, 1 - size\)\)/,
        'the default branch is the original whole-rect-inside clamp',
    );
    // Every position bound must route through the helper, or one drag path keeps
    // an inline clamp and the box snaps back on that gesture only.
    assert.doesNotMatch(src, /Math\.max\(0, Math\.min\(x, 1 - sr\.w\)\)/, 'body drag still inline');
    assert.doesNotMatch(src, /Math\.max\(0, Math\.min\(r\.x, 1 - w\)\)/, 'clamp01 still inline');
});

test('the only other cropTool consumer stays bounded', () => {
    const src = read('js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js');
    assert.doesNotMatch(src, /allowOverflow/, 'a video crop leaving the frame is meaningless');
});

test('MpiStepBox opts in per STEP, never per flow', () => {
    const src = read('js/components/Organisms/MpiStepBox/MpiStepBox.js');

    assert.match(src, /step\.overflow === 'allow'/, 'declared by the step — manifest-safe');
    assert.match(src, /allowOverflow: _allowOverflow/, 'and handed to the gizmo');
    // The pixel conversion must skip its own clamp too, or the negative origin the
    // gizmo now produces is rounded back to 0 one layer later.
    assert.match(src, /if \(allowOverflow\) return \{ x, y, w, h \};/);
});

test('head-swap declares overflow on both steps, and the GRAPH pads only the crop', async () => {
    const { getFlowById } = await esm('js/data/flowsRegistry.js');

    assert.deepStrictEqual(
        getFlowById('head-swap').steps.map(s => [s.param, s.overflow]),
        [['box1', 'allow'], ['box2', 'allow']],
        'both boxes are droppable off-frame',
    );

    const wf = JSON.parse(read('comfy_workflows/flow_head_swap.json'));
    const crop = Object.values(wf).find(n => n.class_type === 'MpiBoxCrop');
    const mask = Object.values(wf).find(n => n.class_type === 'MpiBoxMask');

    assert.strictEqual(crop.inputs.pad, true, 'the reference crop MUST pad or it arrives squashed');
    assert.ok(!('pad' in mask.inputs), 'the mask must NOT pad — node 21 re-squares it');
});
