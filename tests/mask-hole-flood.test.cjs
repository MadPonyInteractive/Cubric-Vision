// MPI-566 — the enclosed-region flood, now shared by the mask and the paint layer.
//
// The flood lived inside MaskManager.fillHoles() until the paint layer needed a Fill
// button, and MaskManager cannot be instantiated in node (it builds canvases through
// `document`) — so the geometry has never been tested, only its undo discipline
// (mask-adjust.test.cjs, source-text). Extracting it to `holeFlood.js` makes it pure,
// the way `distanceField.js` is, and this is the test that buys.
//
// What each case guards is a way the flood can be wrong while still LOOKING like a
// working button: a hole that does not close, a notch that closes when it should not,
// a rim seam left at the hole's edge, an outer rim hardened that should not be, and —
// the one the boxing introduces — a box whose seeds are not equivalent to the canvas
// border, which floods the entire layer.

const assert = require('node:assert');
const test = require('node:test');

const load = () => import('../js/components/Primitives/MpiCanvas/managers/holeFlood.js');

/** RGBA buffer from a `(x, y) => number|boolean` alpha predicate. White where set. */
const shape = (w, h, alphaAt) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const a = alphaAt(x, y);
            const v = a === true ? 255 : a === false ? 0 : a;
            if (!v) continue;
            const i = (y * w + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = v;
        }
    }
    return d;
};

/** Read the region back in FULL-CANVAS coords as `(x, y) => boolean`. */
const reader = (region, w, h) => (x, y) => {
    if (!region) return false;
    const { box, data } = region;
    if (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) return false;
    return data[(((y - box.y) * box.w) + (x - box.x)) * 4 + 3] !== 0;
};

const DISC = { w: 256, h: 256, c: 128, r: 90, hole: 30 };
/** A ring: disc of radius r with a concentric hole, both hard-edged. */
const ring = () => shape(DISC.w, DISC.h, (x, y) => {
    const d2 = (x - DISC.c) ** 2 + (y - DISC.c) ** 2;
    return d2 <= DISC.r ** 2 && d2 > DISC.hole ** 2;
});

test('an enclosed hole is found, and nothing outside the shape is', async () => {
    const { holeFlood } = await load();
    const region = holeFlood(ring(), DISC.w, DISC.h);
    assert.ok(region, 'the ring\'s hole was not found at all');
    const at = reader(region, DISC.w, DISC.h);

    assert.ok(at(DISC.c, DISC.c), 'the hole centre is not in the region');
    assert.ok(at(DISC.c + DISC.hole - 2, DISC.c), 'the hole interior stops short of its own edge');
    assert.ok(!at(DISC.c + DISC.r + 5, DISC.c), 'the region escaped the shape — background was filled');
    assert.ok(!at(1, 1), 'the region reached the canvas corner');
});

test('the outline is left exactly where it was — this is not a morphological close', async () => {
    // A dilate-by-r then erode-by-r would shut the hole for free and round the outline
    // with it. The region must not contain one pixel of the ring itself.
    const { holeFlood } = await load();
    const rgba = ring();
    const region = holeFlood(rgba, DISC.w, DISC.h);
    const at = reader(region, DISC.w, DISC.h);

    for (let y = 0; y < DISC.h; y++) {
        for (let x = 0; x < DISC.w; x++) {
            if (rgba[((y * DISC.w) + x) * 4 + 3] < 128) continue;
            assert.ok(!at(x, y), `the region covers shape pixel ${x},${y} — the outline moves`);
        }
    }
});

test('a notch cut through to the border is NOT a hole', async () => {
    // The definition is reachability from the border, not "a concavity". A C-shape must
    // come back untouched or Fill silently swallows deliberate cut-outs.
    const { holeFlood } = await load();
    const rgba = shape(DISC.w, DISC.h, (x, y) => {
        const d2 = (x - DISC.c) ** 2 + (y - DISC.c) ** 2;
        if (d2 > DISC.r ** 2 || d2 <= DISC.hole ** 2) return false;
        return !(y === DISC.c && x >= DISC.c);        // slit from the hole out to the right
    });
    assert.strictEqual(holeFlood(rgba, DISC.w, DISC.h), null, 'a notch open to the border read as enclosed');
});

test('a solid shape and an empty layer both return null — no empty undo entry', async () => {
    const { holeFlood } = await load();
    const disc = shape(DISC.w, DISC.h, (x, y) => (x - DISC.c) ** 2 + (y - DISC.c) ** 2 <= DISC.r ** 2);
    assert.strictEqual(holeFlood(disc, DISC.w, DISC.h), null, 'a solid disc reported a hole');
    assert.strictEqual(
        holeFlood(new Uint8ClampedArray(DISC.w * DISC.h * 4), DISC.w, DISC.h), null,
        'an empty layer reported a hole',
    );
});

test('the hole\'s ANTIALIASED RIM is covered, and the outer rim is not', async () => {
    // The seam MPI-431 fixed in pass 2. A threshold-and-write leaves the ramp's inner
    // half behind as a semi-transparent ring exactly where the hole was — plainly
    // visible at the mask overlay's 70% opacity. Meanwhile the OUTER rim must keep its
    // antialiasing: the `=== 255` wall is what stops the flood escaping to reach it.
    const { holeFlood } = await load();
    const soft = (d, edge) => {          // 2px linear ramp, 255 inside → 0 outside
        const t = (edge - d) / 2 + 0.5;
        return Math.max(0, Math.min(255, Math.round(t * 255)));
    };
    const rgba = shape(DISC.w, DISC.h, (x, y) => {
        const d = Math.hypot(x - DISC.c, y - DISC.c);
        return Math.min(soft(d, DISC.r), 255 - soft(d, DISC.hole));
    });
    const region = holeFlood(rgba, DISC.w, DISC.h);
    const at = reader(region, DISC.w, DISC.h);

    let innerPartialLeft = 0;
    let outerPartialKept = 0;
    for (let y = 0; y < DISC.h; y++) {
        for (let x = 0; x < DISC.w; x++) {
            const a = rgba[((y * DISC.w) + x) * 4 + 3];
            if (a === 0 || a === 255) continue;
            const d = Math.hypot(x - DISC.c, y - DISC.c);
            if (d < (DISC.hole + DISC.r) / 2) { if (!at(x, y)) innerPartialLeft++; }
            else if (!at(x, y)) outerPartialKept++;
        }
    }
    assert.strictEqual(innerPartialLeft, 0, 'partial-alpha pixels survive at the hole rim — that is the seam');
    assert.ok(outerPartialKept > 0, 'the outer rim was swallowed — Fill must not harden the outline');
});

// ── The boxing (MPI-566) ────────────────────────────────────────────────────────
//
// The flood is seeded from the ink's padded bounding box, not from the canvas border,
// because the paint layer runs at 4096². It is only sound if the two are equivalent.

/** The pre-boxing definition: flood `outside` in from the CANVAS border. */
const fullCanvasHoles = (rgba, w, h, alphaT = 128) => {
    const n = w * h;
    const outside = new Uint8Array(n);
    const stack = [];
    const push = (i) => { if (!outside[i] && rgba[i * 4 + 3] < alphaT) { outside[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        if (x > 0)     push(i - 1);
        if (x < w - 1) push(i + 1);
        if (i >= w)    push(i - w);
        if (i < n - w) push(i + w);
    }
    const fill = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!outside[i] && rgba[i * 4 + 3] < alphaT) { fill[i] = 1; stack.push(i); }
    const spread = (i) => {
        if (!fill[i] && !outside[i] && rgba[i * 4 + 3] !== 255) { fill[i] = 1; stack.push(i); }
    };
    while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        if (x > 0)     spread(i - 1);
        if (x < w - 1) spread(i + 1);
        if (i >= w)    spread(i - w);
        if (i < n - w) spread(i + w);
    }
    return fill;
};

const assertSameAsFullCanvas = (rgba, w, h, region, msg) => {
    const want = fullCanvasHoles(rgba, w, h);
    const at = reader(region, w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            assert.strictEqual(at(x, y), !!want[y * w + x], `${msg} — differs at ${x},${y}`);
        }
    }
};

test('the boxed flood is IDENTICAL to a full-canvas one', async () => {
    const { holeFlood } = await load();
    const rgba = ring();
    assertSameAsFullCanvas(rgba, DISC.w, DISC.h, holeFlood(rgba, DISC.w, DISC.h), 'boxed ring');
});

test('...including when the ink runs off the canvas edge on one side', async () => {
    // The box clamps there, so that side's box border IS ink and seeds nothing. The
    // flood has to reach round from the other three, exactly as it did full-canvas.
    const { holeFlood } = await load();
    const rgba = shape(DISC.w, DISC.h, (x, y) => {
        if (x > 140) return false;
        const d2 = (x - 60) ** 2 + (y - DISC.c) ** 2;
        return (x < 120 && y > 40 && y < 216) || (d2 <= 70 ** 2 && d2 > 25 ** 2);
    });
    assertSameAsFullCanvas(rgba, DISC.w, DISC.h, holeFlood(rgba, DISC.w, DISC.h), 'ink on the left edge');
});

test('the box is PADDED — an unpadded one whose edge is ink floods the whole layer', async () => {
    // The failure this pad prevents: with no transparent ring, pass 1 seeds nothing,
    // every background pixel reads as enclosed, and Fill paints the entire box.
    const { holeFlood } = await load();
    const rgba = ring();
    const region = holeFlood(rgba, DISC.w, DISC.h);
    const at = reader(region, DISC.w, DISC.h);

    // Just outside the disc, still well inside the box: background, and it must stay so.
    assert.ok(!at(DISC.c + DISC.r + 1, DISC.c), 'background inside the box was filled — the pad is gone');
    assert.ok(region.box.x < DISC.c - DISC.r, 'the box does not clear the ink');
    assert.ok(region.box.x + region.box.w > DISC.c + DISC.r, 'the box does not clear the ink');
});
