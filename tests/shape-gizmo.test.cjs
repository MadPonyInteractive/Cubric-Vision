// MPI-368. The shape gizmo's maths — everything that is silent when wrong.
//
// The card's own criterion is that ROTATION must not be applied to the
// axis-aligned bbox, and that is exactly the class of bug that looks fine until
// someone rasterises a rotated ellipse: the outline on screen and the pixels
// committed come from two different code paths unless the geometry is shared.
// These tests pin the shared half — hit-testing, dragging and the path builder.
//
// ShapeManager touches no DOM except Path2D inside buildPath(), so the module is
// imported directly and Path2D is stubbed to record what it was asked to draw.

const assert = require('node:assert');
const test = require('node:test');

/** Records the calls buildPath() makes, so the scaling can be asserted. */
class FakePath2D {
    constructor() { this.ops = []; }
    ellipse(...a) { this.ops.push(['ellipse', ...a]); }
    moveTo(...a) { this.ops.push(['moveTo', ...a]); }
    lineTo(...a) { this.ops.push(['lineTo', ...a]); }
    closePath() { this.ops.push(['closePath']); }
}
global.Path2D = FakePath2D;

async function makeShape({ kind = 'rect', cx = 100, cy = 100, halfW = 40, halfH = 20, rot = 0 } = {}) {
    const { ShapeManager } = await import('../js/components/Primitives/MpiCanvas/managers/ShapeManager.js');
    const s = new ShapeManager();
    s.init(400, 300);
    s.setMode('mask');
    Object.assign(s, { kind, cx, cy, halfW, halfH, rot });
    s.hasShape = true;
    return s;
}

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('arming seeds a centred shape; disarming stops it owning the pointer', async () => {
    const { ShapeManager } = await import('../js/components/Primitives/MpiCanvas/managers/ShapeManager.js');
    const s = new ShapeManager();
    s.init(400, 300);
    assert.strictEqual(s.hasShape, false, 'a fresh image has no shape');
    assert.strictEqual(s.isActive, false);

    s.setMode('paint');
    assert.strictEqual(s.isActive, true);
    assert.strictEqual(s.hasShape, true);
    assert.strictEqual(s.cx, 200);
    assert.strictEqual(s.cy, 150);
    assert.strictEqual(s.shapeMode, 'paint', 'the destination is what a commit reads');

    s.setMode(null);
    assert.strictEqual(s.isActive, false, 'disarmed: the pointer belongs to pan again');
    assert.strictEqual(s.hitTest(200, 150, 1), null, 'a disarmed gizmo hit-tests to nothing');
});

test('a 90° rotation moves the handles with the shape, and hit-testing follows', async () => {
    // 80×40 shape rotated a quarter turn: the RIGHT handle (+halfW on the local
    // x axis) must land BELOW the centre, at +halfW on the image y axis.
    const s = await makeShape({ rot: Math.PI / 2 });
    const r = s.handlePoint('r');
    assert.ok(near(r.x, 100), `expected x=100, got ${r.x}`);
    assert.ok(near(r.y, 140), `expected y=140, got ${r.y}`);

    assert.strictEqual(s.hitTest(100, 140, 1), 'r', 'the rotated handle is where the hit-test looks');
    assert.strictEqual(s.hitTest(140, 100, 1), null,
        'the UNROTATED handle position must NOT hit — that is the bbox bug the card names');
});

test('the hit radius is constant on SCREEN, so zooming out grows it in image px', async () => {
    // Tall enough that the corners cannot also claim the probe point — see the
    // tie-break test below.
    const s = await makeShape({ halfH: 60 });
    // 'r' sits at (140, 100). 20 image px away is outside the 10px radius at
    // scale 1 and inside it at scale 0.25 (radius becomes 40 image px).
    assert.strictEqual(s.hitTest(160, 100, 1), null);
    assert.strictEqual(s.hitTest(160, 100, 0.25), 'r');
});

test('corners win when a zoomed-out hit box covers a corner AND an edge handle', async () => {
    // At scale 0.25 the 10px box is 40 image px, so a point beside the right edge
    // handle also covers the corners of a short shape. Corners are checked first
    // (CropManager's own order) because a corner is the more useful grab — the
    // alternative is an edge handle stealing a corner drag when zoomed out.
    const s = await makeShape({ halfH: 20 });
    assert.strictEqual(s.hitTest(160, 100, 0.25), 'tr');
});

test('body is the local box — a rotated shape does not hit-test as its bbox', async () => {
    const s = await makeShape({ rot: Math.PI / 4 });
    assert.strictEqual(s.hitTest(100, 100, 1), 'body', 'the centre is always inside');
    // Corner of the AXIS-ALIGNED bbox of a 45°-rotated 80×40 shape: inside the
    // bbox, outside the shape.
    assert.strictEqual(s.hitTest(140, 60, 1), null);
});

test('a handle drag on a rotated shape moves along the SHAPE axis, not the screen', async () => {
    const s = await makeShape({ rot: Math.PI / 2 });
    // Rotated 90°, the local +x axis points down the screen. Dragging 'r' 20px
    // DOWN must widen the shape by 20; dragging it sideways must not.
    s.startDrag('r', 100, 140);
    s.drag(100, 160);
    assert.ok(near(s.halfW, 50), `expected halfW 50, got ${s.halfW}`);
    assert.ok(near(s.halfH, 20), 'the other axis is untouched');
    s.endDrag();

    const t = await makeShape({ rot: Math.PI / 2 });
    t.startDrag('r', 100, 140);
    t.drag(120, 140);
    assert.ok(near(t.halfW, 40), 'a drag ACROSS the handle axis changes nothing');
});

test('the opposite edge is anchored — a resize does not drag the whole shape', async () => {
    const s = await makeShape();
    // Left edge sits at x=60, right at x=140. Pull 'l' 20px left: the left edge
    // moves, the right edge must not.
    s.startDrag('l', 60, 100);
    s.drag(40, 100);
    assert.ok(near(s.cx - s.halfW, 40), 'the dragged edge follows the cursor');
    assert.ok(near(s.cx + s.halfW, 140), 'the anchored edge stays put');
});

test('the min-size floor pushes back the MOVED edge, never the anchor', async () => {
    const s = await makeShape();
    s.startDrag('l', 60, 100);
    s.drag(500, 100); // drag the left edge far past the right one
    assert.ok(s.halfW > 0, 'the shape never inverts');
    assert.ok(near(s.cx + s.halfW, 140), 'the anchored right edge is still at 140');
});

// Shift = resize without deforming (user, 2026-08-04). The ratio locked is the one
// the shape HAS, not 1:1 — stretch it first and Shift scales that stretched shape.
test('Shift on a corner keeps the CURRENT proportions, not 1:1', async () => {
    const s = await makeShape();           // 80 × 40, i.e. 2:1
    s.startDrag('br', 140, 120);
    s.drag(240, 120, true);                // pull right only
    assert.ok(near(s.halfW / s.halfH, 2), `ratio drifted to ${s.halfW / s.halfH}`);
    assert.ok(s.halfW > 40, 'and it actually grew');
    // The opposite corner is still the anchor.
    assert.ok(near(s.cx - s.halfW, 60) && near(s.cy - s.halfH, 80),
        'the anchored corner moved');
});

test('Shift on an EDGE handle scales the other axis too', async () => {
    const s = await makeShape();           // 80 × 40
    s.startDrag('r', 140, 100);
    s.drag(180, 100, true);
    assert.ok(near(s.halfW, 60), `expected halfW 60, got ${s.halfW}`);
    assert.ok(near(s.halfH, 30), `the locked axis did not follow: halfH ${s.halfH}`);
    // The untouched axis stays CENTRED, so a right-edge drag does not slide the
    // shape up or down.
    assert.ok(near(s.cy, 100), `the shape slid vertically to ${s.cy}`);
    assert.ok(near(s.cx - s.halfW, 60), 'the left edge is still the anchor');
});

// The VERTICAL edge handles take the other branch — height drives, width follows —
// and nothing else in this file exercises it.
test('Shift on a TOP/BOTTOM handle drives from height, and re-centres the width', async () => {
    const s = await makeShape();           // 80 × 40 about (100, 100), i.e. 2:1
    s.startDrag('b', 100, 120);
    s.drag(100, 140, true);                // pull the bottom edge down by 20
    assert.ok(near(s.halfH, 30), `expected halfH 30, got ${s.halfH}`);
    assert.ok(near(s.halfW, 60), `the width did not follow the lock: halfW ${s.halfW}`);
    assert.ok(near(s.cx, 100), `the shape slid sideways to ${s.cx} — the untouched axis must stay centred`);
    assert.ok(near(s.cy - s.halfH, 80), 'the top edge is still the anchor');
});

// One gesture is many drag() calls. Reading the ratio off the LIVE shape instead of
// the drag-start snapshot compounds rounding on every one of them.
test('the locked ratio does not drift across a long gesture', async () => {
    const s = await makeShape();           // 2:1
    s.startDrag('br', 140, 120);
    for (let i = 1; i <= 40; i++) s.drag(140 + i * 7, 120 + i, true);
    assert.ok(near(s.halfW / s.halfH, 2, 1e-9), `ratio drifted to ${s.halfW / s.halfH}`);
});

test('Shift floors BOTH axes together rather than breaking the lock', async () => {
    const s = await makeShape();
    s.startDrag('br', 140, 120);
    s.drag(-500, -500, true);              // collapse it well past the floor
    assert.ok(near(s.halfW / s.halfH, 2), `the floor broke the ratio: ${s.halfW / s.halfH}`);
    assert.ok(s.halfW > 0 && s.halfH > 0, 'the shape never inverts');
});

test('without Shift the axes are still independent', async () => {
    const s = await makeShape();
    s.startDrag('r', 140, 100);
    s.drag(180, 100, false);
    assert.ok(near(s.halfW, 60) && near(s.halfH, 20),
        'a plain drag must still deform — Shift is the opt-in');
});

test('Shift holds the ratio of a ROTATED shape in its own frame', async () => {
    const s = await makeShape({ rot: Math.PI / 2 });   // 2:1, turned a quarter turn
    const r = s.handlePoint('r');
    s.startDrag('r', r.x, r.y);
    s.drag(r.x, r.y + 40, true);           // along the shape's own +x, which points down
    assert.ok(near(s.halfW, 60), `expected halfW 60, got ${s.halfW}`);
    assert.ok(near(s.halfH, 30), `expected halfH 30, got ${s.halfH}`);
});

test('ALT-rotating about a handle leaves that handle exactly where it was', async () => {
    const s = await makeShape();
    const before = s.handlePoint('tl');
    s.startDrag('tl', before.x, before.y, true);
    // Sweep the cursor a quarter turn about the pivot.
    s.drag(before.x, before.y + 100);
    const after = s.handlePoint('tl');
    assert.ok(near(after.x, before.x, 1e-6) && near(after.y, before.y, 1e-6),
        `the pivot handle moved: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.ok(Math.abs(s.rot) > 0.01, 'and the shape actually rotated');
    assert.ok(Math.hypot(s.cx - 100, s.cy - 100) > 1,
        'the CENTRE orbits the pivot — that is what "the handle stays put" means');
});

// 7.5° grid (user, 2026-08-04). Rotation used to be free, which made squaring a
// shape back up by hand impossible.
test('rotation snaps to a 7.5° grid', async () => {
    const SNAP = Math.PI / 24;
    const s = await makeShape();
    s.startDrag('body', 140, 100, true);
    // Sweep past a stop and land between two of them; the result must be ON one.
    for (const [x, y] of [[139, 106], [135, 118], [128, 130], [120, 141]]) {
        s.drag(x, y, false);
        const steps = s.rot / SNAP;
        assert.ok(near(steps, Math.round(steps), 1e-9),
            `rot ${s.rot} is ${steps} steps — not on the 7.5° grid`);
    }
    assert.ok(Math.abs(s.rot) > SNAP / 2, 'and it still rotated at all');
});

test('the grid is 7.5°, not 15° — an odd stop is reachable', async () => {
    const s = await makeShape();
    s.startDrag('body', 140, 100, true);
    // atan2(y, x) = 7.5° for a point one step round from the start ray.
    const a = Math.PI / 24;
    s.drag(100 + 40 * Math.cos(a), 100 + 40 * Math.sin(a), false);
    assert.ok(near(s.rot, a, 1e-9), `expected exactly 7.5° (${a}), got ${s.rot}`);
});

test('snapping is ABSOLUTE, so an off-grid shape is pulled back onto the grid', async () => {
    // Snapping the DELTA instead would preserve whatever offset the shape started
    // with — indistinguishable while every shape starts at 0, and wrong the moment
    // one does not.
    const SNAP = Math.PI / 24;
    const s = await makeShape({ rot: 0.1 });   // deliberately off-grid
    s.startDrag('body', 140, 100, true);
    s.drag(120, 140, false);
    const steps = s.rot / SNAP;
    assert.ok(near(steps, Math.round(steps), 1e-9),
        `rot ${s.rot} is ${steps} steps — an off-grid start was carried through`);
});

test('snapping does not un-anchor the pivot handle', async () => {
    // The orbit has to use the SNAPPED delta too. Using the raw one would rotate the
    // shape to a grid angle while sliding the handle off the cursor's pivot.
    const s = await makeShape();
    const before = s.handlePoint('tr');
    s.startDrag('tr', before.x, before.y, true);
    s.drag(before.x + 37, before.y + 61, false);
    const after = s.handlePoint('tr');
    assert.ok(near(after.x, before.x, 1e-6) && near(after.y, before.y, 1e-6),
        `the pivot moved: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
});

test('ALT on the body rotates about the centre, which stays put', async () => {
    const s = await makeShape();
    s.startDrag('body', 140, 100, true);
    s.drag(100, 140);
    assert.ok(near(s.cx, 100) && near(s.cy, 100), 'the centre is the pivot here');
    assert.ok(near(s.rot, Math.PI / 2, 1e-6), `expected a quarter turn, got ${s.rot}`);
});

test('buildPath scales into the DESTINATION layer, and rotation reaches the path', async () => {
    // The mask works at 1536 and the paint layer at 4096, so the same shape has to
    // produce different pixel coordinates per destination. A path built for one and
    // filled into the other is silently offset.
    const s = await makeShape({ kind: 'ellipse', rot: 0.5 });
    const half = s.buildPath(0.5);
    const [op, cx, cy, rx, ry, rot] = half.ops[0];
    assert.strictEqual(op, 'ellipse');
    assert.deepStrictEqual([cx, cy, rx, ry], [50, 50, 20, 10]);
    assert.strictEqual(rot, 0.5, 'the rotation is the path\'s, not the caller\'s transform');

    const full = s.buildPath(1);
    assert.deepStrictEqual(full.ops[0].slice(1, 5), [100, 100, 40, 20]);
});

test('a triangle is three points, and they are rotated ones', async () => {
    const s = await makeShape({ kind: 'triangle', rot: Math.PI / 2 });
    const pts = s.outlinePoints();
    assert.strictEqual(pts.length, 3);
    // Apex is local (0, -halfH); a quarter turn puts it at (+halfH, 0) from centre.
    assert.ok(near(pts[0].x, 120) && near(pts[0].y, 100), `apex at ${JSON.stringify(pts[0])}`);

    const path = s.buildPath(1);
    assert.deepStrictEqual(path.ops.map(o => o[0]), ['moveTo', 'lineTo', 'lineTo', 'closePath']);
});

test('nothing to rasterise returns null rather than an empty path', async () => {
    const s = await makeShape();
    s.hasShape = false;
    assert.strictEqual(s.buildPath(1), null, 'no shape');

    const z = await makeShape({ halfW: 0 });
    assert.strictEqual(z.buildPath(1), null, 'zero area — the commit no-ops instead of booking an undo entry');
});

test('clear() reports whether there was a shape — discardPreview reads that', async () => {
    const s = await makeShape();
    assert.strictEqual(s.clear(), true);
    assert.strictEqual(s.hasShape, false);
    assert.strictEqual(s.clear(), false, 'a second discard is not a second preview drop');
});

test('a new image drops the shape — a gizmo must not survive an entry switch', async () => {
    const s = await makeShape();
    s.init(800, 600);
    assert.strictEqual(s.hasShape, false);
    // Re-arming seeds against the NEW dimensions, not the old ones.
    s.setMode('mask');
    assert.strictEqual(s.cx, 400);
    assert.strictEqual(s.cy, 300);
});
