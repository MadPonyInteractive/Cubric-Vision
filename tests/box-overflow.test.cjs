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

/**
 * The box may also be BIGGER than the picture (MPI-325 follow-up). A square tight
 * on a head near the top of a PORTRAIT has to pass the image's WIDTH to take in the
 * hair, and the first cut capped size at exactly one frame span, so it stopped at
 * 768x768 on a 768-wide image with the hair still cut off.
 *
 * The cap is now the padded canvas, read back off the DOM — which also fixes the
 * silent half: fitting the media into the whole padded canvas scaled every
 * normalized coord up by the padding, so the drawn box was ~18% larger than the
 * pixels the readout promised.
 */
test('an overflow box may exceed the frame, bounded by the padded canvas', async () => {
    const { createCropTool } = await esm('js/utils/cropTool.js');

    // 400x400 canvas, media rendered 200x200 inside it -> 100px of padding all
    // round, so the canvas is exactly 2 frame-widths: the cap must be 2.0.
    const make = (allowOverflow) => {
        const ctx = new Proxy({}, { get: () => () => {} });
        const canvas = {
            width: 400, height: 400,
            style: {}, getContext: () => ctx,
            addEventListener() {}, removeEventListener() {},
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
        };
        const target = {
            tagName: 'IMG', naturalWidth: 768, naturalHeight: 768,
            getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 200 }),
        };
        return createCropTool({ overlayCanvas: canvas, targetElement: target, allowOverflow });
    };

    const over = make(true);
    over.setRect({ x: 0, y: 0, w: 1.8, h: 1.8 });
    assert.strictEqual(over.getRect().w, 1.8, 'a box wider than the frame must survive');

    over.setRect({ x: 0, y: 0, w: 5, h: 5 });
    assert.strictEqual(over.getRect().w, 2, 'and stop at the canvas, so the handles stay reachable');

    // The default path is untouched: MpiVideoViewer must still cap at the frame.
    const bounded = make(false);
    bounded.setRect({ x: 0, y: 0, w: 1.8, h: 1.8 });
    assert.strictEqual(bounded.getRect().w, 1, 'without overflow the frame is still the cap');

    // Coordinate mapping: normalized space is the MEDIA, not the padded canvas.
    // Fitting 768x768 into the whole 400px canvas would report w: 400 (the ~18%
    // class of error); the media is 200px, so 200 is the only right answer.
    const b = over.getContentBounds();
    assert.strictEqual(b.w, 200, 'norm 1.0 must be the rendered media, not the padded canvas');
    assert.strictEqual(b.x, 100, 'and it must sit where the media actually renders');
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
