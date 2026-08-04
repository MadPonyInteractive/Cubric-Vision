// MPI-436 — Adjust over the RGBA paint layer (the outline tool).
//
// The GEOMETRY is not retested here: the region is the same
// `signedSquaredDistanceField` + `rangeFor` the mask uses, and
// mask-distance-field.test.cjs already proves it on a thin limb and a concave gap.
// What is new is everything AROUND the primitive, and every one of these fails
// silently in the app:
//   - a second copy of the primitive (the reuse regressing without a symptom)
//   - the three fills, which are what makes shrink lossless and grow's ring the
//     only flat part
//   - radii not scaled to the layer, which is wrong by up to 4x on a big image and
//     still looks like a working slider
//   - a missing undo entry, which looks like a working tool until Ctrl+Z
//   - a preview outliving its pixels
//
// Source-text assertions, same constraint as mask-adjust.test.cjs: PaintManager
// builds canvases through `document` in its constructor and cannot be instantiated
// in node. The Canvas2D compositing itself is verified in Chromium — see
// tasks/MPI-436/validation.md.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const SRC = read('js/components/Primitives/MpiCanvas/managers/PaintManager.js');
const CANVAS = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
const VIEWER = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
const PANEL = read('js/components/Organisms/MpiToolOptionsMaskAdjust/MpiToolOptionsMaskAdjust.js');

/** Body of a method on PaintManager, by name. */
const methodBody = (name) => {
    const m = SRC.match(new RegExp(`\\n    ${name}\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(m, `${name}() not found on PaintManager — the Adjust seam moved`);
    return m[2];
};

test('ONE primitive drives both layers — paint imports it, it does not reimplement it', () => {
    // The card's first acceptance item. A local dilate here would work and would
    // silently fork the two layers' morphology the next time either is tuned.
    assert.match(
        SRC,
        /import \{[^}]*signedSquaredDistanceField[^}]*\} from '\.\/distanceField\.js'/,
        'PaintManager does not import the shared primitive',
    );
    for (const banned of [/function\s+\w*[Dd]istance/, /_morph\s*\(/]) {
        assert.doesNotMatch(SRC, banned, 'PaintManager carries its own morphology — the reuse regressed');
    }
});

test('radii are scaled to the layer, not passed through in image px', () => {
    // The layer runs at PAINT_MAX_EDGE 4096 and coordinates arrive in image px —
    // the contract paint() and commitShape() already follow. Skip the scale and a
    // "20px" grow is 20 LAYER px, i.e. wrong by 1/_scale on any source over 4096,
    // while still looking like a working slider.
    const body = methodBody('previewAdjust');
    assert.match(body, /const s = this\._scale/, 'previewAdjust does not read the layer scale');
    assert.match(body, /grow:\s*grow\s*\*\s*s/, 'grow is not scaled to layer px');
    assert.match(body, /outward:\s*\(opts\.outward \|\| 0\)\s*\*\s*s/, 'outward is not scaled to layer px');
    assert.match(body, /inward:\s*\(opts\.inward \|\| 0\)\s*\*\s*s/, 'inward is not scaled to layer px');
});

test('every preview frame derives from the pristine copy, never from the last one', () => {
    // Feeding each frame back in means grow-3 applied three times, which eats detail
    // exactly like the MPI-351 double-scale bug. The guard is on the FIELD and on the
    // fills: both must read `_adjustPristine`.
    const build = methodBody('_ensureAdjustField');
    assert.match(build, /_adjustPristine/, '_ensureAdjustField does not build from the pristine snapshot');
    assert.doesNotMatch(build, /adjustCanvas/, '_ensureAdjustField sources the field from its own output');

    const body = methodBody('previewAdjust');
    assert.match(body, /const src = this\._adjustPristine/, 'previewAdjust does not read the pristine snapshot');
    assert.doesNotMatch(
        body,
        /signedSquaredDistanceField/,
        'previewAdjust builds the field itself — that belongs in _ensureAdjustField, off the pristine snapshot',
    );

    // Lazily built, so beginAdjust must DROP the previous one: a stale field would
    // describe the pre-Apply shape while the pristine snapshot describes the new one.
    assert.match(
        methodBody('beginAdjust'),
        /_adjustField\s*=\s*null/,
        'beginAdjust does not invalidate the distance field — the next preview would use the previous snapshot',
    );
});

test('the three fills are what the card specified — shrink keeps colour, grow keeps colour, band is flat', () => {
    // The whole difference between this and the mask. Get a fill wrong and the tool
    // still previews something plausible: shrink that repaints the survivors flat,
    // or a grow that flattens the original scribble.
    const body = methodBody('previewAdjust');

    // Shrink: the region CLIPS the original, so nothing is repainted.
    const shrink = body.match(/if \(!edge && grow < 0\) \{([\s\S]*?)\n        \} else \{/);
    assert.ok(shrink, 'the shrink branch is gone — grow and shrink must not share a fill');
    assert.match(shrink[1], /'source-in'/, 'shrink does not clip through source-in');
    assert.match(shrink[1], /drawImage\(src/, 'shrink repaints instead of keeping the original pixels');
    assert.doesNotMatch(shrink[1], /fillStyle/, 'shrink fills with the current colour — surviving pixels lose theirs');

    // Grow and band: flat colour through the region, then the original back on top
    // for grow ONLY — the band replaces the layer with its outline.
    const other = body.slice(body.indexOf('} else {'));
    assert.match(other, /fillStyle = this\.color/, 'the grown ring and the band are not filled in the paint colour');
    assert.match(
        other,
        /if \(!edge\) \{[\s\S]*?drawImage\(src/,
        'grow does not draw the original back on top — existing pixels would go flat',
    );
});

test('Apply records ONE undo entry, after the guard and before it mutates', () => {
    // Layer-wide one shot (docs/masking-undo.md), NOT a gesture: _recordUndo() after
    // the no-op guard so an empty Apply cannot push an entry, and before the write or
    // Ctrl+Z restores the already-adjusted layer.
    const body = methodBody('applyAdjust');
    const guard  = body.indexOf('return false');
    const record = body.indexOf('_recordUndo()');
    const write  = body.indexOf('this.paintCtx.clearRect');

    assert.ok(record !== -1, 'applyAdjust does not record undo — a silent hole in Ctrl+Z');
    assert.ok(guard !== -1 && guard < record, 'applyAdjust records undo before its no-op guard');
    assert.ok(write !== -1 && record < write, 'applyAdjust mutates the layer before recording undo');
    assert.doesNotMatch(body, /pendingLayer|undo\.begin/, 'applyAdjust uses the gesture facility for a one-shot');
});

test('an unapplied preview cannot outlive its tool OR its pixels', () => {
    // THE PREVIEW CONTRACT. Two doors: leaving the tool (the shared discardPreview
    // seam, never the mountOptions call site) and a new image landing under it.
    const discard = VIEWER.match(/el\.discardPreview = \(\) => \{([\s\S]*?)\n        \};/);
    assert.ok(discard, 'discardPreview not found on the viewer');
    assert.match(discard[1], /hasPaintAdjustPreview/, 'discardPreview does not check for a paint adjust preview');
    assert.match(discard[1], /endPaintAdjust/, 'discardPreview does not drop the paint adjust preview');

    assert.match(methodBody('init'), /this\.endAdjust\(\)/, 'a new image leaves the previous preview alive');
});

test('the preview draws INSTEAD of the layer, never over it', () => {
    // Drawing both would have the user judging the old scribble and the proposed one
    // at once — and the paint layer draws in EVERY mode, so it would follow them out
    // of the tool.
    const step = CANVAS.match(/if \(this\.paint\.paintCanvas\.width\) \{([\s\S]*?)\n        \}/);
    assert.ok(step, 'the paint step of _renderOverlay moved');
    assert.match(step[1], /hasAdjustPreview[\s\S]*?adjustCanvas/, 'the overlay ignores the paint adjust preview');
    assert.doesNotMatch(
        step[1],
        /drawImage\([\s\S]*?\n[\s\S]*?drawImage\(/,
        'the overlay draws the layer AND the preview',
    );
});

test('an adjustment to the paint layer is not published as a mask change', () => {
    // `onMaskStrokeEnd` is the viewer's ONE mask publish path and it re-gates the op
    // strip. Paint riding it would claim a mask exists where none does — the same
    // line the shape commit's paint branch draws.
    const apply = CANVAS.match(/applyPaintAdjust\(\)\s*\{([^}]*)\}/);
    assert.ok(apply, 'applyPaintAdjust not found on MpiCanvas');
    assert.doesNotMatch(apply[1], /onMaskStrokeEnd/, 'paint Adjust publishes a mask change');

    // And the allowlist — a name missing there is `undefined` on `el`, and the
    // panels' optional-call idiom swallows it without a word.
    const methods = CANVAS.match(/const _methods = \[([\s\S]*?)\n {8}\];/);
    assert.ok(methods, '_methods allowlist not found in MpiCanvas');
    for (const name of ['beginPaintAdjust', 'previewPaintAdjust', 'applyPaintAdjust',
        'endPaintAdjust', 'hasPaintAdjustPreview']) {
        assert.match(methods[1], new RegExp(`'${name}'`),
            `${name} is missing from the _methods allowlist — el.${name} would be undefined and swallowed`);
    }
});

test('ONE panel serves both destinations, and drives the layer it is mounted on', () => {
    // The MPI-368 / MPI-373 pattern. A panel that reached for the mask methods
    // regardless of mode would adjust the MASK while the rail showed Paint.
    assert.match(PANEL, /const DEST = \{[\s\S]*?paintAdjust:/, 'the panel has no paint destination row');
    const setup = PANEL.slice(PANEL.indexOf('setup:'));
    for (const banned of ['beginMaskAdjust', 'previewMaskAdjust', 'applyMaskAdjust', 'endMaskAdjust']) {
        assert.ok(!setup.includes(banned), `setup() calls ${banned} directly — it must go through DEST`);
    }
    // The strip has to follow the destination too, or Clear and the opacity slider
    // drive the mask from inside the paint tool.
    assert.match(setup, /dest:\s*dest\.stripDest/, 'the shared strip is not pointed at the tool destination');
});
