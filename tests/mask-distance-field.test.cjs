// MPI-441 — the geometry the Adjust primitive has to get right.
//
// The other Adjust test (mask-adjust.test.cjs) is source-text only, because
// MaskManager builds canvases through `document` and cannot be instantiated in
// node. That is exactly why the blur-and-threshold bug survived: nothing in CI
// could see a SHAPE. `distanceField.js` is pure — typed array in, typed array out —
// so the geometry is testable here with no canvas at all.
//
// The cases are the ones the user reported from screenshots: a thin limb and a
// concave gap. `boxBlur3` below reimplements the old primitive well enough to prove
// these cases FAIL on it — the point is not to match Chromium's blur exactly, it is
// that ANY averaging pass followed by a fixed alpha cut loses a thin structure.

const assert = require('node:assert');
const test = require('node:test');

/** RGBA buffer from a `(x, y) => boolean` shape predicate. White where true. */
const shape = (w, h, inside) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!inside(x, y)) continue;
            const i = (y * w + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
        }
    }
    return d;
};

/** Read a written range back as a `(x, y) => boolean`. */
const reader = (out32, w) => (x, y) => out32[y * w + x] !== 0;

/** Run field + range + write in one go. */
const morph = async (rgba, w, h, opts) => {
    const { signedSquaredDistanceField, rangeFor, writeRange } =
        await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    const field = signedSquaredDistanceField(rgba, w, h);
    const range = rangeFor(opts);
    assert.ok(range, 'rangeFor returned null for a non-no-op request');
    const out32 = new Uint32Array(w * h);
    writeRange(field, out32, range.lo, range.hi);
    return reader(out32, w);
};

test('the field is the exact Euclidean distance, not an approximation', async () => {
    const { signedSquaredDistanceField } =
        await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    // A single lit pixel at (4,4) in a 9x9. Every other pixel's SQUARED distance to
    // it is (dx² + dy²) — a chamfer or a box filter cannot produce these numbers.
    const w = 9, h = 9;
    const field = signedSquaredDistanceField(shape(w, h, (x, y) => x === 4 && y === 4), w, h);
    assert.strictEqual(field[4 * w + 4], -1, 'the lit pixel should read -1: its nearest background is 1 away');
    assert.strictEqual(field[4 * w + 6], 4, 'two px to the side is 2² = 4');
    assert.strictEqual(field[2 * w + 2], 8, 'the diagonal is 2²+2² = 8, not the chamfered 4 or 16');
    assert.strictEqual(field[0 * w + 0], 32, 'the corner is 4²+4² = 32');
});

test('grow moves the outline outward by EXACTLY r, in every direction', async () => {
    // A half-plane: mask from x >= 20. Grow r must put the new edge at 20 - r.
    const w = 64, h = 16;
    for (const r of [1, 2, 3, 5, 8, 12, 19]) {
        const hit = await morph(shape(w, h, (x) => x >= 20), w, h, { grow: r });
        assert.ok(hit(20 - r, 8), `grow ${r}: the edge did not reach x = ${20 - r}`);
        assert.ok(!hit(20 - r - 1, 8), `grow ${r}: the edge overshot past x = ${20 - r}`);
    }
});

test('shrink moves the outline inward by EXACTLY e', async () => {
    // Tall enough that the CANVAS BORDER is not the nearest background: outside the
    // frame counts as background (see signedSquaredDistanceField), so a short strip
    // would erode from top and bottom and mask the result being measured here.
    const w = 64, h = 64;
    for (const e of [1, 2, 3, 5, 8, 12]) {
        const hit = await morph(shape(w, h, (x) => x >= 20), w, h, { grow: -e });
        assert.ok(hit(20 + e, 32), `shrink ${e}: the edge undershot, x = ${20 + e} was eaten`);
        assert.ok(!hit(20 + e - 1, 32), `shrink ${e}: the edge did not reach x = ${20 + e}`);
    }
});

test('a thin limb SURVIVES a grow wider than itself and keeps growing', async () => {
    // The reported bug: a ~6px arm grown by 20. A dilation gives a 6 + 2*20 = 46px
    // bar. A blur at sigma 20 drives a 6px bar's peak alpha to a few percent, far
    // under the 0.1587 cut, so the arm VANISHES while the torso grows.
    const w = 120, h = 32;
    const bar = shape(w, h, (x) => x >= 57 && x < 63);   // 6px wide, full height
    const hit = await morph(bar, w, h, { grow: 20 });

    assert.ok(hit(60, 16), 'the limb disappeared under its own grow');
    assert.ok(hit(37, 16) && hit(82, 16), 'the limb did not grow to the full 46px width');
    assert.ok(!hit(36, 16) && !hit(83, 16), 'the limb grew past 46px');
});

// Two wide bars with a 24px gap, grown by 10. A dilation closes a gap only once
// 2r reaches its width, so 24 > 20 must stay open. Blur-and-threshold closes it at
// 2.82r instead of 2r — the averaged mass from both sides clears the 0.1587 cut
// well before the discs touch — so it over-fills by ~41% and turns grow into a
// morphological CLOSE. Adjust explicitly is not a close (docs/masking-adjust.md;
// MPI-431's Fill Holes exists because closing is a separate, opt-in operation).
const GAP = { w: 120, h: 40, r: 10, centre: 60 };
const gapShape = () => shape(GAP.w, GAP.h, (x) => (x >= 8 && x < 48) || (x >= 72 && x < 112));

test('grow does NOT fill a concave gap — it is a dilation, never a close', async () => {
    const hit = await morph(gapShape(), GAP.w, GAP.h, { grow: GAP.r });

    assert.ok(!hit(GAP.centre, 20), 'the concave gap was filled — grow behaved as a close');
    assert.ok(hit(57, 20) && hit(62, 20), 'the bars did not grow the full 10 into the gap');
    assert.ok(!hit(58, 20) && !hit(61, 20), 'the bars grew more than 10 into the gap');
});

test('the same two cases FAIL on blur-and-threshold', () => {
    // The old design, close enough to prove the point: three box passes approximate
    // a Gaussian (variance 3(n²-1)/12, so n = 2r+1 gives sigma ≈ r), then the fixed
    // alpha cut at 0.1587*255. This is the test CI had no way to express before the
    // primitive became a pure function — a shape bug needs a shape.
    const T = 0.1587 * 255;

    const w = 120, h = 32;
    const bar = shape(w, h, (x) => x >= 57 && x < 63);
    const grownBar = blurThreshold(bar, w, h, 20, T);
    assert.ok(!grownBar(60, 16), 'blur-and-threshold kept the 6px limb at r=20 — the case no longer discriminates, retune it');

    const grownBars = blurThreshold(gapShape(), GAP.w, GAP.h, GAP.r, T);
    assert.ok(grownBars(GAP.centre, 20), 'blur-and-threshold left the 24px gap open at r=10 — the case no longer discriminates, retune it');
});

test('an edge band is one range: outward and inward together', async () => {
    const w = 64, h = 16;
    const hit = await morph(shape(w, h, (x) => x >= 20), w, h, { edge: true, outward: 4, inward: 3 });
    assert.ok(hit(16, 8) && hit(22, 8), 'the band does not span the edge');
    assert.ok(!hit(15, 8), 'the band reaches past outward = 4');
    assert.ok(!hit(23, 8), 'the band reaches past inward = 3');
});

test('rangeFor treats zero as a no-op and keeps erode strict', async () => {
    const { rangeFor } = await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    assert.strictEqual(rangeFor({ grow: 0 }), null, 'grow 0 should tear the preview down');
    assert.strictEqual(rangeFor({ edge: true, outward: 0, inward: 0 }), null, 'an empty band should tear the preview down');
    assert.deepStrictEqual(rangeFor({ grow: 5 }), { lo: -Infinity, hi: 25 });
    // d > e is d² >= e²+1 for integers — the +1 is what keeps erode strict without
    // an epsilon, and dropping it leaves the shrink edge one pixel short.
    assert.deepStrictEqual(rangeFor({ grow: -5 }), { lo: -Infinity, hi: -26 });
    assert.deepStrictEqual(rangeFor({ edge: true, outward: 4, inward: 3 }), { lo: -9, hi: 16 });
});

// ── MPI-445: the content-bounded build is the SAME region, not an approximation ──

/** Region of a full-canvas field, as a `(x,y) => boolean`. */
const fullRegion = async (rgba, w, h, opts) => morph(rgba, w, h, opts);

/** Region of a content-bounded field, mapped back to canvas coords. */
const boxedRegion = async (rgba, w, h, pad, opts) => {
    const { fieldOverContent, rangeFor, writeRange } =
        await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    const built = fieldOverContent(rgba, w, h, pad);
    assert.ok(built, 'fieldOverContent found no content');
    const { field, box } = built;
    const range = rangeFor(opts);
    const out32 = new Uint32Array(box.w * box.h);
    writeRange(field, out32, range.lo, range.hi);
    return { box, hit: (x, y) => {
        const bx = x - box.x, by = y - box.y;
        if (bx < 0 || by < 0 || bx >= box.w || by >= box.h) return false;
        return out32[by * box.w + bx] !== 0;
    } };
};

/** Assert two regions agree on every pixel of the canvas. */
const assertSameRegion = (a, b, w, h, msg) => {
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            assert.strictEqual(b(x, y), a(x, y), `${msg} — disagreement at ${x},${y}`);
        }
    }
};

test('a field bounded to the content box is IDENTICAL to the full-canvas one', async () => {
    // The MPI-445 fix. Building over the whole 4096 layer cost 1563 ms on the first
    // slider move; building over the padded content box costs a fraction of it — but
    // only if it is exact, because capping the field's RESOLUTION instead would give
    // back the precision MPI-441 was written to buy. Every op, on a shape with a
    // concave gap, well inside a canvas much larger than it.
    const w = 96, h = 64;
    const s = shape(w, h, (x, y) => (x >= 30 && x <= 44 && y >= 20 && y <= 44)
        || (x >= 52 && x <= 60 && y >= 20 && y <= 44));
    for (const opts of [{ grow: 6 }, { grow: -4 }, { edge: true, outward: 5, inward: 3 }]) {
        const label = JSON.stringify(opts);
        const { box, hit } = await boxedRegion(s, w, h, 8, opts);
        assert.ok(box.w < w && box.h < h, `${label} — the box did not shrink, the case proves nothing`);
        assertSameRegion(await fullRegion(s, w, h, opts), hit, w, h, label);
    }
});

test('the box is PADDED, not clamped — an unpadded box would erode from a false border', async () => {
    // distanceField treats outside-the-box as background, so a box hugging the content
    // makes the shape look like it ends at the canvas edge on every side. The failure
    // is silent: shrink eats a ring the user never asked for.
    const w = 64, h = 64;
    const s = shape(w, h, (x, y) => x >= 20 && x <= 43 && y >= 20 && y <= 43);
    const { hit } = await boxedRegion(s, w, h, 8, { grow: -3 });
    assertSameRegion(await fullRegion(s, w, h, { grow: -3 }), hit, w, h, 'shrink over a padded box');

    const { box } = await boxedRegion(s, w, h, 8, { grow: 3 });
    assert.deepStrictEqual(box, { x: 12, y: 12, w: 40, h: 40 }, 'the box is not the content bounds + pad');
});

test('content running off the frame still erodes from the canvas border', async () => {
    // The convention MPI-441 recorded: outside the CANVAS is background. Clamping the
    // padded box to the canvas is what keeps that true, and it is the one case where
    // the box edge is a real border rather than a virtual one.
    const w = 48, h = 48;
    const s = shape(w, h, (x, y) => x < 20 && y < 20); // corner block, touching two edges
    const { box, hit } = await boxedRegion(s, w, h, 6, { grow: -2 });
    assert.deepStrictEqual(box, { x: 0, y: 0, w: 26, h: 26 }, 'the box was not clamped to the canvas');
    assertSameRegion(await fullRegion(s, w, h, { grow: -2 }), hit, w, h, 'shrink at the canvas border');
    assert.ok(!hit(0, 0) && !hit(1, 1), 'the corner did not erode from the canvas border');
});

test('an empty layer has no field to build', async () => {
    const { fieldOverContent } =
        await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    const w = 16, h = 16;
    // Alpha 100 everywhere: painted-looking, but under the >=128 shape cut.
    const soft = new Uint8ClampedArray(w * h * 4).fill(100);
    assert.strictEqual(fieldOverContent(soft, w, h, 8), null, 'sub-threshold alpha counted as a shape');
});

test('the box holds every non-transparent pixel, not just the shape', async () => {
    // The caller composites ONLY inside this box, so a faint pixel outside it would be
    // silently erased from the preview. The shape cut stays at 128 — the box does not.
    const { fieldOverContent } =
        await import('../js/components/Primitives/MpiCanvas/managers/distanceField.js');
    const w = 64, h = 64;
    const d = new Uint8ClampedArray(w * h * 4);
    const put = (x, y, a) => { d[(y * w + x) * 4 + 3] = a; };
    for (let y = 30; y <= 33; y++) for (let x = 30; x <= 33; x++) put(x, y, 255);
    put(10, 10, 40); // a faint stroke's rim, far from the solid content
    const { box } = fieldOverContent(d, w, h, 4);
    assert.ok(box.x <= 6 && box.y <= 6, 'the box excluded a sub-threshold pixel and would drop it from the preview');
});

// ── the old primitive, for the comparison above ──────────────────────────────

/** One box pass of radius `br` over an alpha plane, separable. */
const boxPass = (src, w, h, br) => {
    const tmp = new Float64Array(w * h);
    const out = new Float64Array(w * h);
    const n = 2 * br + 1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let k = -br; k <= br; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
            tmp[y * w + x] = s / n;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let k = -br; k <= br; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
            out[y * w + x] = s / n;
        }
    }
    return out;
};

/** `ctx.filter = blur(r)` then an alpha cut — Chromium's blur is three box passes. */
const blurThreshold = (rgba, w, h, r, t) => {
    let plane = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) plane[i] = rgba[i * 4 + 3];
    const br = Math.max(1, Math.round(r));
    for (let p = 0; p < 3; p++) plane = boxPass(plane, w, h, br);
    return (x, y) => plane[y * w + x] >= t;
};
