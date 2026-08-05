// MPI-435 — the alpha brush pack.
//
// `brushDab.js` never touches `document`: it draws into a context it is handed, so
// a recording stand-in for that context makes the whole dab testable in node, with
// no canvas. That matters more here than usual, because the two things this card
// can break are invisible in a screenshot:
//
//   1. the mask brush stamps THE SAME DAB into `manual` and `subtract`, and a
//      non-deterministic scatter would silently break `manual AND NOT subtract`,
//   2. `_growStrokeBox()` is grown by `dabExtent()`, and a scattered dab that
//      paints outside it leaves pixels behind on undo — with no error, ever.

const assert = require('node:assert');
const test = require('node:test');

const dab = () => import('../js/components/Primitives/MpiCanvas/managers/brushDab.js');

/**
 * A CanvasRenderingContext2D stand-in that records the dabs it is asked to draw.
 * Every sub-dab is `translate(cx, cy)` then `arc(0, 0, sub)`, so the accumulated
 * translation IS the dab centre.
 */
function recorder() {
    const ops = [];
    const stack = [];
    let tx = 0, ty = 0, sy = 1, rot = 0;
    const ctx = {
        fillStyle: null,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        save() {
            stack.push([tx, ty, sy, rot, ctx.fillStyle, ctx.globalAlpha, ctx.globalCompositeOperation]);
        },
        restore() {
            const s = stack.pop();
            tx = s[0]; ty = s[1]; sy = s[2]; rot = s[3];
            ctx.fillStyle = s[4];
            ctx.globalAlpha = s[5];
            ctx.globalCompositeOperation = s[6];
        },
        translate(x, y) { tx += x; ty += y; },
        rotate(a)       { rot += a; },
        scale(_x, y)    { sy *= y; },
        beginPath()     {},
        fill()          {},
        arc(_x, _y, r) {
            ops.push({
                x: tx, y: ty, r, aspect: sy, rot,
                alpha: ctx.globalAlpha,
                op: ctx.globalCompositeOperation,
                fill: ctx.fillStyle,
            });
        },
        createRadialGradient(_x0, _y0, r0, _x1, _y1, r1) {
            const stops = [];
            return { gradient: true, r0, r1, stops, addColorStop: (o, c) => stops.push([o, c]) };
        },
    };
    return { ctx, ops };
}

test('ten presets, unique ids, every knob resolved', async () => {
    const { BRUSH_PRESETS, DEFAULT_BRUSH_PRESET, getPreset } = await dab();
    assert.strictEqual(BRUSH_PRESETS.length, 10, 'the card asked for ten');
    assert.strictEqual(new Set(BRUSH_PRESETS.map(p => p.id)).size, 10, 'ids collide');
    const KNOBS = ['hardness', 'aspect', 'angle', 'angleJitter', 'density', 'scatter', 'flow', 'spacing'];
    for (const p of BRUSH_PRESETS) {
        assert.ok(p.label, `${p.id} has no label`);
        const r = getPreset(p.id);
        for (const k of KNOBS) assert.strictEqual(typeof r[k], 'number', `${p.id}.${k}`);
    }
    // Every knob has to be MOVED by something, or it is a knob nobody asked for.
    const base = getPreset(DEFAULT_BRUSH_PRESET);
    for (const k of KNOBS) {
        assert.ok(BRUSH_PRESETS.some(p => getPreset(p.id)[k] !== base[k]), `no preset moves ${k}`);
    }
});

test('an absent or unknown preset is the pre-MPI-435 hard round', async () => {
    const { getPreset, DEFAULT_BRUSH_PRESET, dabExtent } = await dab();
    const hard = getPreset(DEFAULT_BRUSH_PRESET);
    assert.deepStrictEqual(getPreset(undefined), hard);
    assert.deepStrictEqual(getPreset('no-such-brush'), hard);
    assert.deepStrictEqual(hard, { id: 'hard', label: 'Hard Round', hardness: 1, aspect: 1, angle: 0, angleJitter: 0, density: 1, scatter: 0, flow: 1, spacing: 0.25 });

    // The undo box must not change for anyone who never opens the picker.
    assert.strictEqual(dabExtent(20, undefined), 20);
    assert.strictEqual(dabExtent(20, 'hard'), 20);

    const { ctx, ops } = recorder();
    const { stampDab } = await dab();
    stampDab(ctx, 10, 20, 5, 'source-over', 'rgba(1, 2, 3, 1)');
    assert.strictEqual(ops.length, 1, 'the default dab is one arc, as it always was');
    assert.deepStrictEqual(
        { x: ops[0].x, y: ops[0].y, r: ops[0].r, aspect: ops[0].aspect, alpha: ops[0].alpha, fill: ops[0].fill },
        { x: 10, y: 20, r: 5, aspect: 1, alpha: 1, fill: 'rgba(1, 2, 3, 1)' },
    );
});

test('every sub-dab lands inside dabExtent — the undo box covers the ink', async () => {
    const { BRUSH_PRESETS, stampDab, dabExtent } = await dab();
    const R = 24;
    for (const p of BRUSH_PRESETS) {
        const reach = dabExtent(R, p.id);
        const { ctx, ops } = recorder();
        // Several centres: the jitter is a hash of (x, y), so one sample proves nothing.
        for (const [x, y] of [[100, 100], [37.5, 12.25], [0, 0], [999, 3]]) {
            ops.length = 0;
            stampDab(ctx, x, y, R, 'source-over', 'rgba(255, 255, 255, 1)', p.id);
            for (const o of ops) {
                const far = Math.hypot(o.x - x, o.y - y) + o.r;
                assert.ok(far <= reach + 1e-6, `${p.id}: dab reaches ${far.toFixed(2)} > extent ${reach.toFixed(2)}`);
            }
        }
    }
});

test('the jitter is deterministic — the mask twin layers stay exact mirrors', async () => {
    const { BRUSH_PRESETS, stampDab } = await dab();
    for (const p of BRUSH_PRESETS) {
        // The two calls MaskManager.paint() makes per dab, in their real shapes.
        const a = recorder();
        const b = recorder();
        stampDab(a.ctx, 61.5, 42.25, 18, 'source-over', 'rgba(255, 255, 255, 1)', p.id);
        stampDab(b.ctx, 61.5, 42.25, 18, 'destination-out', null, p.id);
        assert.strictEqual(a.ops.length, b.ops.length, `${p.id}: sub-dab count differs`);
        a.ops.forEach((o, i) => {
            assert.strictEqual(o.x, b.ops[i].x, `${p.id}: sub-dab ${i} x differs between the twins`);
            assert.strictEqual(o.y, b.ops[i].y, `${p.id}: sub-dab ${i} y differs between the twins`);
            assert.strictEqual(o.r, b.ops[i].r, `${p.id}: sub-dab ${i} r differs between the twins`);
            assert.strictEqual(o.rot, b.ops[i].rot, `${p.id}: sub-dab ${i} rotation differs between the twins`);
        });
    }
});

test('an eraser is soft too — destination-out gets an opaque-to-transparent ramp', async () => {
    const { stampDab, getPreset } = await dab();

    const hard = recorder();
    stampDab(hard.ctx, 5, 5, 10, 'destination-out', null, 'hard');
    assert.strictEqual(hard.ops[0].fill, 'rgba(0, 0, 0, 1)', 'a hard dab must not pay for a gradient');

    const soft = recorder();
    stampDab(soft.ctx, 5, 5, 10, 'destination-out', null, 'air');
    const g = soft.ops[0].fill;
    assert.ok(g && g.gradient, 'a soft eraser needs a falloff, or it erases as a hard disc');
    assert.deepStrictEqual(g.stops, [[0, 'rgba(0, 0, 0, 1)'], [1, 'rgba(0, 0, 0, 0)']]);
    // Built in the dab's LOCAL space so rotate/scale squash it with the ellipse.
    assert.strictEqual(g.r0, soft.ops[0].r * getPreset('air').hardness);
    assert.strictEqual(g.r1, soft.ops[0].r);
});

test('a soft dab fades to its OWN colour at alpha 0, never through black', async () => {
    // Measured in Chromium 2026-08-05: gradient stops interpolate NON-premultiplied,
    // so the CSS keyword `transparent` (rgba(0,0,0,0)) darkened a soft red rim to
    // [77,0,0,33]. The far stop has to carry the colour, or every soft paint stroke
    // gets a black halo. The recorder's fillStyle round-trip is the identity, which
    // is what the real 2D context does for an already-normalised rgb() string.
    const { stampDab } = await dab();
    const { ctx, ops } = recorder();
    stampDab(ctx, 0, 0, 30, 'source-over', 'rgba(224, 68, 107, 1)', 'feather');
    assert.deepStrictEqual(ops[0].fill.stops, [
        [0, 'rgba(224, 68, 107, 1)'],
        [1, 'rgba(224, 68, 107, 0)'],
    ]);
});

test('flow and aspect reach the context, not just the table', async () => {
    const { stampDab, getPreset } = await dab();
    const { ctx, ops } = recorder();
    stampDab(ctx, 0, 0, 12, 'source-over', 'rgba(9, 9, 9, 1)', 'chisel');
    const p = getPreset('chisel');
    assert.strictEqual(ops[0].aspect, p.aspect, 'a chisel that draws round is not a chisel');
    assert.strictEqual(ops[0].rot, p.angle);
    assert.strictEqual(ctx.globalAlpha, 1, 'the outer restore must put alpha back');

    const dry = recorder();
    stampDab(dry.ctx, 0, 0, 12, 'source-over', 'rgba(9, 9, 9, 1)', 'dry');
    assert.strictEqual(dry.ops[0].alpha, getPreset('dry').flow);
    assert.strictEqual(dry.ops.length, getPreset('dry').density);
});

test('spacing comes from the preset, and the endpoint is always stamped', async () => {
    const { strokeDabs, getPreset } = await dab();
    const count = (from, to, r, preset) => {
        const hits = [];
        strokeDabs(from, to, r, (x, y) => hits.push([x, y]), preset);
        return hits;
    };

    // mousedown: no previous sample, exactly one dab, exactly under the cursor.
    assert.deepStrictEqual(count(null, { x: 7, y: 8 }, 10), [[7, 8]]);

    // 100px of travel at r = 20. Default spacing 0.25 -> step 5 -> 19 interior + the end.
    const hard = count({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 'hard');
    assert.strictEqual(hard.length, Math.floor(100 / (20 * getPreset('hard').spacing)));
    assert.deepStrictEqual(hard[hard.length - 1], [100, 0], 'the stroke must end under the cursor');

    // A scattered preset spends MORE spacing, so it lays down FEWER dabs over the
    // same travel — that is what keeps the grain instead of filling it back in.
    const spray = count({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 'spray');
    assert.ok(getPreset('spray').spacing > getPreset('hard').spacing);
    assert.ok(spray.length < hard.length);

    // Fast drag: still continuous. Consecutive dabs must overlap, i.e. be no more
    // than one radius apart, or the stroke reads as a dotted line at speed.
    const fast = count({ x: 0, y: 0 }, { x: 4000, y: 0 }, 20, 'stipple');
    for (let i = 1; i < fast.length; i++) {
        assert.ok(fast[i][0] - fast[i - 1][0] <= 20, 'gap wider than the brush radius');
    }
});
