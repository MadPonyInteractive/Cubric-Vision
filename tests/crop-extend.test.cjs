// MPI-383. The crop rect may now leave the image, and two bits of pure maths
// decide whether that works:
//   1. planExtendedCrop — how much to pad and where the extract lands inside
//      the padded image. Get it wrong and Sharp either throws (out of bounds)
//      or silently returns the wrong pixels.
//   2. cropSnap — an edge inside the snap radius must land EXACTLY on the image
//      bound (the whole point: no accidental 1–2px border), and in ratio mode
//      the snap must move the scale, never break the ratio.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { planExtendedCrop, parseFill } = require('../services/imageCrop.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Two wiring invariants that fail SILENTLY and off-site (found live, 2026-07-29).
test('every crop method the viewer calls is in MpiCanvas _methods allowlist', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const allowlist = canvas.match(/const _methods = \[([\s\S]*?)\]/);
    assert.ok(allowlist, '_methods array literal not found');

    // Everything the viewer calls as canvas.setCropX() / getCropX()
    const called = [...viewer.matchAll(/canvas\.((?:set|get)Crop[A-Za-z]+)\(/g)].map(m => m[1]);
    assert.ok(called.length, 'expected the viewer to drive the canvas crop API');
    for (const name of new Set(called)) {
        // A missing entry makes el.<name> undefined; the caller dies with
        // "not a function" and the tool panel half-mounts (no Apply button).
        assert.ok(allowlist[1].includes(`'${name}'`), `${name} missing from MpiCanvas _methods`);
    }
});

test('every crop panel section toggled with .hidden has a [hidden] CSS rule', () => {
    const js  = read('js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js');
    const css = read('js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css');
    // The component sets `display` on these classes, which BEATS the UA's
    // [hidden] rule — so el.hidden = true does nothing without an explicit one.
    assert.ok(/\.hidden\s*=/.test(js), 'expected the panel to hide sections via .hidden');
    assert.match(css, /__section\[hidden\]/, 'section[hidden] rule missing');
    assert.match(css, /__divisible\[hidden\]/, 'divisible[hidden] rule missing');
});

const SRC = { srcW: 784, srcH: 980 };

test('a rect inside the image needs no pad', () => {
    const p = planExtendedCrop({ ...SRC, x: 10, y: 20, w: 100, h: 200 });
    assert.strictEqual(p.extends, false);
    assert.deepStrictEqual(p.extend, { top: 0, bottom: 0, left: 0, right: 0 });
    assert.deepStrictEqual(p.extract, { left: 10, top: 20, width: 100, height: 200 });
});

test('overhang left/top pads by the overhang and shifts the extract onto it', () => {
    const p = planExtendedCrop({ ...SRC, x: -100, y: -50, w: 500, h: 400 });
    assert.deepStrictEqual(p.extend, { top: 50, bottom: 0, left: 100, right: 0 });
    // The source moved right/down by the pad, so the rect starts at the pad's origin.
    assert.deepStrictEqual(p.extract, { left: 0, top: 0, width: 500, height: 400 });
});

test('overhang right/bottom pads the far side only', () => {
    const p = planExtendedCrop({ ...SRC, x: 700, y: 900, w: 500, h: 300 });
    assert.deepStrictEqual(p.extend, { top: 0, bottom: 220, left: 0, right: 416 });
    assert.deepStrictEqual(p.extract, { left: 700, top: 900, width: 500, height: 300 });
});

test('the extract always lands inside the padded image', () => {
    const rects = [
        { x: -500, y: -500, w: 100, h: 100 },   // entirely off the top-left
        { x: 1200, y: 1400, w: 100, h: 100 },   // entirely off the bottom-right
        { x: -300, y: 100, w: 1920, h: 1080 },  // wider than the source both ways
    ];
    for (const r of rects) {
        const p = planExtendedCrop({ ...SRC, ...r });
        const paddedW = SRC.srcW + p.extend.left + p.extend.right;
        const paddedH = SRC.srcH + p.extend.top + p.extend.bottom;
        assert.ok(p.extract.left >= 0 && p.extract.top >= 0, `negative origin for ${JSON.stringify(r)}`);
        assert.ok(p.extract.left + p.extract.width <= paddedW, `overflows width for ${JSON.stringify(r)}`);
        assert.ok(p.extract.top + p.extract.height <= paddedH, `overflows height for ${JSON.stringify(r)}`);
    }
});

test('fill parses hex, objects and garbage (garbage = black, never a throw)', () => {
    assert.deepStrictEqual(parseFill('#ff8000'), { r: 255, g: 128, b: 0, alpha: 1 });
    assert.deepStrictEqual(parseFill({ r: 300, g: -5, b: 12.4 }), { r: 255, g: 0, b: 12, alpha: 1 });
    assert.deepStrictEqual(parseFill('not a colour'), { r: 0, g: 0, b: 0, alpha: 1 });
    assert.deepStrictEqual(parseFill(undefined), { r: 0, g: 0, b: 0, alpha: 1 });
});

test('a free-mode edge inside the snap radius lands exactly on the image bound', async () => {
    const { snapFreeRect } = await import('../js/utils/cropSnap.js');
    // Right edge 3px short of the image edge, dragging 'r' → snaps flush.
    const snapped = snapFreeRect({ x: 0, y: 0, w: 781, h: 980 }, 'r', 784, 980, 8);
    assert.strictEqual(snapped.w, 784);
    assert.strictEqual(snapped.x, 0, 'the anchored edge must not move');

    // Same edge 40px short — well outside the radius, so nothing moves.
    const untouched = snapFreeRect({ x: 0, y: 0, w: 744, h: 980 }, 'r', 784, 980, 8);
    assert.strictEqual(untouched.w, 744);
});

test('free-mode snapping only moves the edges the handle owns', async () => {
    const { snapFreeRect } = await import('../js/utils/cropSnap.js');
    // 'l' moves the left edge; the right edge sits 2px inside the bound and
    // must stay there, because dragging the left handle never moves it.
    const snapped = snapFreeRect({ x: 3, y: 100, w: 779, h: 400 }, 'l', 784, 980, 8);
    assert.strictEqual(snapped.x, 0);
    assert.strictEqual(snapped.x + snapped.w, 782, 'right edge must be untouched');
    assert.strictEqual(snapped.y, 100);
});

test('body snapping offers flush-left, flush-right and centred', async () => {
    const { snapBodyRect } = await import('../js/utils/cropSnap.js');
    const box = { w: 400, h: 300 };
    assert.strictEqual(snapBodyRect({ ...box, x: 4, y: 500 }, 784, 980, 8).x, 0);
    assert.strictEqual(snapBodyRect({ ...box, x: 380, y: 500 }, 784, 980, 8).x, 384, 'flush right');
    assert.strictEqual(snapBodyRect({ ...box, x: 190, y: 500 }, 784, 980, 8).x, 192, 'centred');
    assert.strictEqual(snapBodyRect({ ...box, x: 100, y: 500 }, 784, 980, 8).x, 100, 'nothing in range');
});

test('ratio-locked snapping adjusts the scale and keeps the ratio exact', async () => {
    const { snapRatioWidth } = await import('../js/utils/cropSnap.js');
    const ratio = 16 / 9;
    // Anchored at the image top-left, growing right/down, 5px short of the right edge.
    const w = snapRatioWidth(779, {
        anchorX: 0, anchorY: 0, signX: 1, signY: 1,
        ratio, imgW: 784, imgH: 980, tol: 8,
    });
    assert.strictEqual(w, 784, 'width snapped to the image edge');
    assert.strictEqual(w / ratio, 784 / ratio, 'height still follows the ratio');

    // Nothing within reach → unchanged.
    assert.strictEqual(snapRatioWidth(600, {
        anchorX: 0, anchorY: 0, signX: 1, signY: 1,
        ratio, imgW: 784, imgH: 980, tol: 8,
    }), 600);
});

test('ratio snapping can be driven by the VERTICAL bound too', async () => {
    const { snapRatioWidth } = await import('../js/utils/cropSnap.js');
    const ratio = 1; // square, so height maths is readable
    // Anchored top-left growing down; height 976 is 4px short of the bottom.
    const w = snapRatioWidth(976, {
        anchorX: 0, anchorY: 0, signX: 1, signY: 1,
        ratio, imgW: 4000, imgH: 980, tol: 8,
    });
    assert.strictEqual(w, 980, 'scaled so the bottom edge lands on the image bottom');
});
