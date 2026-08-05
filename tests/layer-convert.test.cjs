// MPI-439 — Convert mask to paint / paint to mask.
//
// Source-text assertions, the same constraint mask-adjust.test.cjs and
// paint-adjust.test.cjs work under: both managers build canvases through
// `document` and cannot be instantiated in node. The pixels themselves are
// verified in Chromium — see tasks/MPI-439/validation.md.
//
// What is guarded here is everything that fails SILENTLY in the app:
//   - an undo entry recorded before the no-op guard (a dead Ctrl+Z step) or not at
//     all (a hole in Ctrl+Z, which is what docs/masking-undo.md exists to prevent)
//   - paint → mask writing the DERIVED maskCanvas, which _recomposite() overwrites
//   - the same conversion not punched out of subtract, so the composite erases it
//   - paint → mask not publishing, leaving the op strip locked on a visible mask
//   - mask → paint publishing, which claims a mask change that did not happen
//   - the Block reaching into a canvas instead of the viewer's el.* surface

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const MASK = read('js/components/Primitives/MpiCanvas/managers/MaskManager.js');
const PAINT = read('js/components/Primitives/MpiCanvas/managers/PaintManager.js');
const CANVAS = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
const VIEWER = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
const BLOCK = read('js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js');
const UTILS = read('js/utils/maskUtils.js');

/** Body of a method, by name, from one source. */
const methodBody = (src, name, label) => {
    const m = src.match(new RegExp(`\\n    ${name}\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(m, `${name}() not found in ${label} — the conversion seam moved`);
    return m[2];
};

test('both directions record undo AFTER the empty-source guard', () => {
    // The guard-order bug from the card: record first and converting an empty layer
    // pushes an undo entry that restores nothing, so Ctrl+Z appears to do nothing.
    for (const [src, name, label] of [[PAINT, 'fillFromMask', 'PaintManager'], [MASK, 'fillFromPaint', 'MaskManager']]) {
        const body = methodBody(src, name, label);
        const guard = body.indexOf('return false');
        const record = body.indexOf('this._recordUndo()');
        assert.ok(record > 0, `${label}.${name}() records no undo entry — a silent hole in Ctrl+Z`);
        assert.ok(guard > 0 && guard < record, `${label}.${name}() records undo before its no-op guard`);
        assert.ok(
            body.lastIndexOf('return false') < record,
            `${label}.${name}() can bail AFTER recording — a dead undo entry`,
        );
    }
});

test('paint → mask writes the STORED layer and keeps its mirror in step', () => {
    // Only manual + subtract are stored (docs/masking-undo.md); maskCanvas is derived
    // and _recomposite() would overwrite anything written there. And a region added to
    // manual while subtract still holds it is erased straight back by the composite —
    // the mirror line commitShape() already draws.
    const body = methodBody(MASK, 'fillFromPaint', 'MaskManager');
    assert.match(body, /this\.manualCtx\.drawImage\(stencil/, 'the conversion does not land in manualCanvas');
    assert.doesNotMatch(body, /this\.maskCtx|maskCanvas\.getContext/, 'the conversion writes the derived mask canvas');
    assert.match(
        body,
        /subtractCtx[\s\S]*globalCompositeOperation = 'destination-out'[\s\S]*drawImage\(stencil/,
        'the converted region is not punched out of subtract — the composite erases it back',
    );
    assert.match(body, /this\._recomposite\(\)/, 'the derived mask is never re-composed, so nothing appears');
});

test('only the direction that CHANGES the mask publishes', () => {
    // onMaskStrokeEnd is the viewer's one publish path (→ evaluateMask → mask-ready),
    // and the op strip gates on what it reports. Missing on paint → mask: the strip
    // stays locked on a mask the user can see. Present on mask → paint: a paint
    // mutation claims a mask change that did not happen (the MPI-436 line).
    const toMask = methodBody(CANVAS, 'paintToMask', 'MpiCanvas');
    const toPaint = methodBody(CANVAS, 'maskToPaint', 'MpiCanvas');
    assert.match(toMask, /onMaskStrokeEnd\?\.\(\)/, 'paint → mask does not publish, so the op strip stays locked');
    assert.doesNotMatch(toPaint, /onMaskStrokeEnd/, 'mask → paint publishes a mask change that did not happen');
});

test('the conversions reach el.* through the allowlist, not around it', () => {
    // A method missing from _methods is `undefined` on el, and the optional-call
    // idiom in the viewer swallows that without a word.
    assert.match(CANVAS, /'maskToPaint','paintToMask'/, 'the conversions are missing from the _methods allowlist');
    assert.match(VIEWER, /el\.maskToPaint = \(\) => !!canvas\.maskToPaint/, 'the viewer does not expose maskToPaint');
    assert.match(VIEWER, /el\.paintToMask = \(\) => !!canvas\.paintToMask/, 'the viewer does not expose paintToMask');
});

test('the menu gates each item on ITS OWN layer, and the Block owns no pixels', () => {
    const menu = BLOCK.match(/image-viewer:context-menu[\s\S]*?onSelect: \(key\) => \{[\s\S]*?\n {16}\}/);
    assert.ok(menu, 'the image-viewer context menu handler moved');
    const src = menu[0];
    assert.match(src, /key: 'mask-to-paint'[^}]*disabled: noMask/, 'Convert mask to paint is not gated on hasMask()');
    assert.match(src, /key: 'paint-to-mask'[^}]*disabled: noPaint/, 'Convert paint to mask is not gated on hasPaint()');
    assert.match(src, /const noPaint = !viewer\.el\.hasPaint\?\.\(\)/, 'the paint gate is not read from the viewer');
    assert.match(src, /viewer\.el\.maskToPaint\?\.\(\)/, 'the Block does not go through the viewer surface');
    // MPI-446: PaintManager.color is panel state — it only holds the user's colour
    // once a paint-family tool has mounted and pushed it, and a canvas remount resets
    // it to the module default. Converting from a mask tool then paints the default
    // and looks like the colour picker is being ignored.
    assert.match(
        src,
        /getToolSettings\(state\.currentProject \|\| \{\}, 'paint', \{\}\)\.color[\s\S]*setPaintColor[\s\S]*maskToPaint/,
        'mask → paint does not resolve the CURRENT paint colour from the tool settings first',
    );
    assert.match(src, /viewer\.el\.paintToMask\?\.\(\)/, 'the Block does not go through the viewer surface');
    // The two items that were already there must be untouched.
    assert.match(src, /key: 'clear-mask'/, 'Clear mask went missing');
    assert.match(src, /key: 'send-composite'/, 'Send to Composite went missing');
});

test('ONE stencil helper, cutting ALPHA at the family threshold', () => {
    // MPI-436 settled the channel for the whole MPI-440 set: the shape of a layer is
    // its alpha at >=128, never its luminance — under luminance a black stroke reads
    // as background. A second copy of this cut in either manager forks that decision.
    assert.match(UTILS, /export function alphaStencil\(src, color, alphaT = 128\)/, 'the shared stencil helper is gone');
    assert.match(UTILS, /d\[i\] >= alphaT/, 'the stencil does not cut on alpha');
    for (const [src, label] of [[MASK, 'MaskManager'], [PAINT, 'PaintManager']]) {
        assert.match(src, /import \{ alphaStencil \} from '\.\.\/\.\.\/\.\.\/\.\.\/utils\/maskUtils\.js'/, `${label} does not use the shared stencil`);
        assert.doesNotMatch(src, /getImageData[\s\S]{0,200}luminance/i, `${label} grew a luminance cut`);
    }
});
