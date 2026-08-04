// MPI-382 step 2 — the Adjust tool's two invariants.
//
// Source-text assertions, same constraint as preview-contract.test.cjs and
// mask-tool-registry.test.cjs: MaskManager builds canvases through `document` in
// its constructor, so it cannot be instantiated in node. What is guarded here is
// exactly what fails SILENTLY at runtime — a missing undo entry looks like a
// working tool until the user presses Ctrl+Z, and compounding looks like a
// working tool until the user drags back and forth.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'js/components/Primitives/MpiCanvas/managers/MaskManager.js'),
    'utf8',
);

/** Body of a method on MaskManager, by name. */
const methodBody = (name) => {
    const m = SRC.match(new RegExp(`\\n    ${name}\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(m, `${name}() not found on MaskManager — the Adjust seam moved`);
    return m[2];
};

test('Apply records ONE undo entry, after the guard and before it mutates', () => {
    // A layer-wide one-shot (docs/masking-undo.md): _recordUndo() must come after
    // the no-op guard so an empty Apply cannot push an entry, and before the write
    // or Ctrl+Z restores the already-adjusted layers.
    const body = methodBody('applyAdjust');
    const guard  = body.indexOf('return false');
    const record = body.indexOf('_recordUndo()');
    const write  = body.indexOf('this.manualCtx.drawImage');

    assert.ok(record !== -1, 'applyAdjust does not record undo — a silent hole in Ctrl+Z');
    assert.ok(guard !== -1 && guard < record, 'applyAdjust records undo before its no-op guard');
    assert.ok(write !== -1 && record < write, 'applyAdjust mutates the manual layer before recording undo');
});

test('Apply clears subtract, so the erases are not punched twice', () => {
    // The preview is computed from `manual AND NOT subtract` and already has the
    // erases baked in. Leaving subtract behind would subtract them a second time.
    assert.match(
        methodBody('applyAdjust'),
        /subtractCtx\.clearRect/,
        'applyAdjust leaves subtractCanvas populated — the erases get applied twice',
    );
});

test('every preview frame derives from the pristine copy, never from the last one', () => {
    // Feeding each frame back in means grow-3 applied three times, which eats
    // detail exactly like the MPI-351 double-scale bug. Since MPI-441 the guard is
    // on the FIELD: it is built once in beginAdjust() from the pristine mask, so
    // previewAdjust rebuilding it is the only way the compounding can come back.
    const body = methodBody('previewAdjust');
    assert.match(body, /_adjustField/, 'previewAdjust does not read the distance field');
    assert.doesNotMatch(
        body,
        /signedSquaredDistanceField/,
        'previewAdjust rebuilds the distance field — if it ever sources that from its own output the adjustment compounds',
    );
    assert.match(
        methodBody('beginAdjust'),
        /_adjustField\s*=\s*signedSquaredDistanceField/,
        'beginAdjust no longer builds the field from the pristine snapshot',
    );
});

// ── MPI-431 — Fill Holes ─────────────────────────────────────────────────────
// The graphs stopped filling holes (mask_fill_holes off in every raw template,
// synced 2026-08-03), so this method is now the ONLY thing that closes one. The
// same two silent failures apply as for Apply, plus one of its own: a fill that
// found nothing must not push an undo entry, or Ctrl+Z gains a dead step.

test('Fill records ONE undo entry, after the guard and before it mutates', () => {
    const body = methodBody('fillHoles');
    const guard  = body.indexOf('if (!filled) return false');
    const record = body.indexOf('_recordUndo()');
    const write  = body.indexOf('this.manualCtx.drawImage');

    assert.ok(record !== -1, 'fillHoles does not record undo — a silent hole in Ctrl+Z');
    assert.ok(guard !== -1, 'fillHoles lost its no-op guard — a fill that found nothing would push an entry');
    assert.ok(guard < record, 'fillHoles records undo before its no-op guard');
    assert.ok(write !== -1 && record < write, 'fillHoles mutates the manual layer before recording undo');
});

test('Fill clears subtract, so the erases are not punched twice', () => {
    // Identical reasoning to applyAdjust: the filled result was computed from
    // `manual AND NOT subtract`, so the erases are already in it.
    assert.match(
        methodBody('fillHoles'),
        /subtractCtx\.clearRect/,
        'fillHoles leaves subtractCanvas populated — the erases get applied twice',
    );
});

test('Fill floods from the border rather than seeding inside the mask', () => {
    // The whole method is "background reachable from the edge is outside; the rest
    // is a hole". Seeding anywhere else inverts the meaning and fills the image.
    const body = methodBody('fillHoles');
    assert.match(body, /push\(\(h - 1\) \* w \+ x\)/, 'fillHoles does not seed the bottom border row');
    assert.match(body, /push\(y \* w \+ w - 1\)/, 'fillHoles does not seed the right border column');
    assert.doesNotMatch(body, /new Array\(/, 'fillHoles should use typed arrays for the 1536² flood');
});

test('Fill bakes a live preview instead of silently dropping it', () => {
    // Pressing Fill mid-adjustment must fill what is ON SCREEN. Reading maskCanvas
    // unconditionally would throw the preview away and fill the pre-adjust mask.
    assert.match(
        methodBody('fillHoles'),
        /hasAdjustPreview && this\.adjustCanvas\)\s*\?\s*this\.adjustCanvas/,
        'fillHoles ignores the live preview — an adjustment in flight is silently discarded',
    );
});

test('Fill covers the hole RIM, not just its interior', () => {
    // The seam bug (user, 2026-08-03 — same one ComfyUI's mask editor leaves).
    // Punching a hole leaves alpha ramping 255→0 over a pixel or two. Writing only
    // the pixels below the threshold leaves the ramp's inner half at partial alpha —
    // a visible ring at 70% overlay opacity. The second flood is what removes it, and
    // its wall is `=== 255`, which is also what stops it hardening the OUTER edge.
    const body = methodBody('fillHoles');
    assert.match(body, /const fill = new Uint8Array\(n\)/, 'fillHoles lost its rim pass — the old hole boundary stays semi-transparent');
    assert.match(
        body,
        /if \(fill\[i\] \|\| outside\[i\] \|\| d\[i \* 4 \+ 3\] === 255\) return;/,
        'the rim flood no longer stops at fully-opaque mask — it can escape a hole and harden the outer edge',
    );
});

test('fillMaskHoles is on the MpiCanvas method allowlist', () => {
    // _methods is an ALLOWLIST: a method missing from it is `undefined` on el, and
    // the optional-call in the panel makes that failure completely silent.
    const canvas = fs.readFileSync(
        path.join(__dirname, '..', 'js/components/Primitives/MpiCanvas/MpiCanvas.js'),
        'utf8',
    );
    assert.match(canvas, /'fillMaskHoles'/, 'fillMaskHoles missing from MpiCanvas._methods — el.fillMaskHoles would be undefined');
});
