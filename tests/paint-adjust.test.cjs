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
    // MPI-445 moved the call one level up: paint asks for `fieldOverContent`, which is
    // `signedSquaredDistanceField` over the content box. Still one module, still no
    // second morphology here.
    assert.match(
        SRC,
        /import \{[^}]*fieldOverContent[^}]*\} from '\.\/distanceField\.js'/,
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
        /fieldOverContent|signedSquaredDistanceField/,
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

test('the field covers the content box, and the preview is drawn at its offset (MPI-445)', () => {
    // A full-layer field at 4096 was a 1563 ms freeze on the first slider move; the
    // field is now built over the painted content padded by the largest radius asked
    // for. Two ways that goes silently wrong: drawing the smaller buffer at 0,0 puts
    // the whole preview in the top-left corner, and reusing a field that was padded
    // for a smaller radius lets the region run off its own box.
    const build = methodBody('_ensureAdjustField');
    assert.match(build, /fieldOverContent\(data, w, h, pad\)/, '_ensureAdjustField builds over the whole layer');
    assert.match(build, /_adjustPad\s*>=\s*pad/, 'a field built with a smaller pad is reused — the region runs off its own box');

    const body = methodBody('previewAdjust');
    assert.match(body, /_ensureAdjustField\(maxR\)/, 'previewAdjust does not tell the field how far it will reach');
    assert.match(body, /ctx\.rect\(box\.x, box\.y, box\.w, box\.h\);\s*\n\s*ctx\.clip\(\)/, 'the frame is not clipped to the field box');
    assert.match(body, /putImageData\(this\._adjustImg, box\.x, box\.y\)/, 'the region is not drawn at the field box offset');

    // The fills were the expensive half once the field shrank: a full-canvas fillRect
    // + drawImage measured 46 ms a frame at 4096, seven times the range test they
    // composited. Nothing outside the box can be part of any result — the box holds
    // every non-transparent pixel — so nothing outside it may be touched.
    for (const banned of [/fillRect\(0, 0, w, h\)/, /drawImage\(src, 0, 0\)/]) {
        assert.doesNotMatch(body, banned, 'a fill still runs over the whole canvas');
    }
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
        'endPaintAdjust', 'hasPaintAdjustPreview', 'fillPaintHoles']) {
        assert.match(methods[1], new RegExp(`'${name}'`),
            `${name} is missing from the _methods allowlist — el.${name} would be undefined and swallowed`);
    }
});

test('ONE panel serves both destinations, and drives the layer it is mounted on', () => {
    // The MPI-368 / MPI-373 pattern. A panel that reached for the mask methods
    // regardless of mode would adjust the MASK while the rail showed Paint.
    assert.match(PANEL, /const DEST = \{[\s\S]*?paintAdjust:/, 'the panel has no paint destination row');
    const setup = PANEL.slice(PANEL.indexOf('setup:'));
    for (const banned of ['beginMaskAdjust', 'previewMaskAdjust', 'applyMaskAdjust', 'endMaskAdjust',
        'fillMaskHoles']) {
        assert.ok(!setup.includes(banned), `setup() calls ${banned} directly — it must go through DEST`);
    }
    // The strip has to follow the destination too, or Clear and the opacity slider
    // drive the mask from inside the paint tool.
    assert.match(setup, /dest:\s*dest\.stripDest/, 'the shared strip is not pointed at the tool destination');
});

// ── Fill (MPI-566) ──────────────────────────────────────────────────────────────
//
// The outline tool without a Fill is stopped one press short, and the failure modes
// are the same silent ones as Apply's: a second flood forking the two layers, a
// missing undo entry, and a Fill that publishes a mask change it is not.

test('ONE flood drives both layers — paint imports it, it does not reimplement it', () => {
    // Exactly the constraint the distance field is already under. `MaskManager` held
    // the only copy until MPI-566; a paint-side flood would work and would silently
    // fork the two layers' definition of "enclosed" the next time either is touched.
    assert.match(SRC, /import \{[^}]*holeFlood[^}]*\} from '\.\/holeFlood\.js'/,
        'PaintManager does not import the shared flood');
    const body = methodBody('fillHoles');
    assert.match(body, /holeFlood\(/, 'fillHoles does not call the shared flood');
    assert.doesNotMatch(body, /new Uint8Array|new Int32Array/,
        'fillHoles builds its own flood buffers — that is a second implementation');
});

test('Fill records ONE undo entry, after the guard and before it mutates', () => {
    const body = methodBody('fillHoles');
    const guard  = body.lastIndexOf('return false');
    const record = body.indexOf('_recordUndo()');
    const write  = body.indexOf('this.paintCtx.clearRect');

    assert.ok(record !== -1, 'fillHoles does not record undo — a silent hole in Ctrl+Z');
    assert.ok(guard !== -1 && guard < record, 'fillHoles records undo before its no-op guard');
    assert.ok(write !== -1 && record < write, 'fillHoles mutates the layer before recording undo');
    assert.doesNotMatch(body, /pendingLayer|undo\.begin/, 'fillHoles uses the gesture facility for a one-shot');
});

test('Fill takes what is ON SCREEN, and the fill is the current colour under the original', () => {
    // Same rule as the mask's: a live preview is baked WITH the fill as one entry
    // rather than silently dropped. And the composite is Adjust's grow row — region
    // flat in the colour, original back on top — which is what keeps every existing
    // stroke's own colour and alpha.
    const body = methodBody('fillHoles');
    assert.match(body, /hasAdjustPreview && this\.adjustCanvas\s*\)\s*\?/,
        'fillHoles ignores a live preview — pressing Fill mid-adjustment would drop it');
    assert.match(body, /source-in[\s\S]*fillStyle = this\.color/,
        'the filled region is not clipped to the hole in the current colour');
    const fillAt = body.indexOf('fillRect');
    const overAt = body.indexOf('drawImage(src');
    assert.ok(fillAt !== -1 && overAt > fillAt,
        'the original is not drawn back on top — the fill would flatten existing strokes');
});

test('Fill on the paint layer is not published as a mask change', () => {
    const fill = CANVAS.match(/fillPaintHoles\(\)\s*\{([^}]*)\}/);
    assert.ok(fill, 'fillPaintHoles not found on MpiCanvas');
    assert.doesNotMatch(fill[1], /onMaskStrokeEnd/, 'paint Fill publishes a mask change');
});

test('BOTH destinations offer Fill, and each routes to its own layer', () => {
    // It was mask-only, on the reasoning that an enclosed hole is a coverage idea —
    // wrong for the layer that ships the outline tool. The panel must not grow an
    // `if (isPaint)` to say so: the destination row carries it, like everything else.
    const dest = PANEL.match(/const DEST = \{[\s\S]*?\n\};/);
    assert.ok(dest, 'the DEST table moved');
    assert.match(dest[0], /fillMaskHoles/, 'the mask destination lost its Fill');
    assert.match(dest[0], /fillPaintHoles/, 'the paint destination has no Fill');
    const setup = PANEL.slice(PANEL.indexOf('setup:'));
    assert.match(setup, /dest\.fill\(viewer\)/, 'the Fill button does not go through the destination row');
    assert.doesNotMatch(setup, /dest\.fillHoles\s*\?/, 'the Fill button is still conditional on the destination');
});

test('EVERY method the panel reaches for is forwarded by the viewer', () => {
    // `viewer.el` is the MpiCanvasViewer, which forwards to MpiCanvas BY HAND, one
    // assignment per method — and the panel calls all of them through `?.()`. So a
    // method that exists on MpiCanvas and on its _methods allowlist but was never
    // forwarded is `undefined` on `viewer.el`, the optional call swallows it, and the
    // control renders, mounts, wires and does NOTHING. No error, no console entry.
    //
    // That is exactly how MPI-566's Fill shipped broken: added to MpiCanvas and to the
    // allowlist, missing from the viewer, and the panel-level tests all passed. The
    // allowlist check below it is necessary and was never sufficient — this is the
    // other half, and it covers the whole panel rather than one method name.
    const VIEWER_SRC = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const wanted = new Set();
    for (const m of PANEL.matchAll(/\b(?:viewer|v)\.el\.(\w+)\?\./g)) wanted.add(m[1]);
    assert.ok(wanted.size >= 10, `only found ${wanted.size} viewer calls in the panel — the regex missed the seam`);

    for (const name of wanted) {
        assert.match(
            VIEWER_SRC, new RegExp(`el\\.${name}\\s*=`),
            `the panel calls viewer.el.${name}() but MpiCanvasViewer never forwards it — `
            + 'the optional call makes that a dead control, silently',
        );
    }
});
