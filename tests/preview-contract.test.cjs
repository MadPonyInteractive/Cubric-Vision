// MPI-382 step 1 — THE PREVIEW CONTRACT.
//
// Every canvas tool is visited, previewed, then applied — or the preview goes
// away. An unapplied preview must never outlive its tool: previews that survive
// stack on each other, so the user judges a composite he never committed to
// while the graph receives something else again.
//
// This was BROKEN before MPI-382 in the quietest possible way. The function that
// discards a preview, `_exitAutoMaskMode(false)`, already existed and was
// correct — it simply had no caller, and neither did `commitAutoMask`. So a
// detection survived every rail switch, stayed in maskCanvas, and was injected
// into the graph without `Add` ever being pressed (also MPI-365's open item).
// Nothing failed; the wiring was just absent. That is exactly what a source
// guard is for.
//
// Source-text assertions on purpose — MpiGroupHistoryBlock and MpiCanvasViewer
// pull ~30 DOM modules each and cannot be imported in node, same constraint as
// mask-tool-registry.test.cjs.
//
// MPI-368 (shapes) and MPI-373 (composite) add their previews to the SAME seam.
// If either one teaches mountOptions about itself instead, the first test here
// still passes but the design has drifted — read el.discardPreview's comment.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const BLOCK  = read('js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js');
const VIEWER = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');

/** The body of `_exitAutoMaskMode`, up to the emit tail. */
const exitBody = (() => {
    const m = VIEWER.match(/function _exitAutoMaskMode\(apply\)\s*\{([\s\S]*?)\n        \}/);
    assert.ok(m, '_exitAutoMaskMode not found in MpiCanvasViewer — the seam moved');
    return m[1];
})();

/** Just the `if (!apply) { ... }` discard branch inside it. */
const discardBranch = (() => {
    const m = exitBody.match(/if \(!apply\)\s*\{([\s\S]*?)\n            \}/);
    assert.ok(m, 'the !apply discard branch not found inside _exitAutoMaskMode');
    return m[1];
})();

test('mountOptions discards the outgoing preview on every tool switch', () => {
    const m = BLOCK.match(/async function mountOptions\(mode\)\s*\{([\s\S]*?)_options\?\.destroy/);
    assert.ok(m, 'mountOptions not found, or it no longer destroys the outgoing compound');
    assert.match(
        m[1],
        /discardPreview/,
        'mountOptions does not discard the outgoing preview — a detection would survive the '
        + 'rail switch and reach the graph without Add, which is the bug MPI-382 fixed',
    );
});

test('the discard seam is exposed by the viewer and routes to the no-apply exit', () => {
    const m = VIEWER.match(/el\.discardPreview\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n        \};/);
    assert.ok(m, 'el.discardPreview is not defined on MpiCanvasViewer — mountOptions calls into nothing');
    assert.match(
        m[1],
        /_exitAutoMaskMode\(false\)/,
        'discardPreview does not call _exitAutoMaskMode(false) — a hand-rolled second discard '
        + 'path is how the two fall out of sync',
    );
    assert.match(
        m[1],
        /return false/,
        'discardPreview has no cheap-exit guard, so every rail switch churns the mask state '
        + 'and re-emits mask-ready/mask-clear for nothing',
    );
});

test('discarding drops the WHOLE preview, not just the canvas half', () => {
    // Clearing only the auto layers left the thumb strip advertising selected
    // picks for pixels that no longer existed, and re-entering Detect rehydrated
    // that stale selection.
    const required = [
        [/clearAutoPicks\(\)/,                'the auto pick layers'],
        [/setSelectedAutoPicks\(new Set\(\)\)/, 'the selected-pick set on the canvas'],
        [/_autoMaskPicks\.clear\(\)/,         "the viewer's own pick set"],
        [/_lastDetectThumbUrls\s*=\s*\[\]/,   'the remembered thumb urls'],
        [/autoMaskThumbs\.el\.clear\(\)/,     'the thumb strip UI'],
        [/_clearAutoPickEntry\(/,             'the persisted auto-pick entry'],
    ];
    for (const [re, what] of required) {
        assert.match(discardBranch, re, `discarding a preview does not clear ${what}`);
    }
});

test('discarding never touches committed pixels', () => {
    // manual + subtract are what the user actually painted and erased. A discard
    // is not an edit, so it must not reach them — and must not record undo either.
    for (const forbidden of [/manualCanvas/, /subtractCanvas/, /clearMask\(/, /_recordUndo/]) {
        assert.doesNotMatch(
            discardBranch,
            forbidden,
            `the discard branch touches ${forbidden} — it must drop only the preview; `
            + 'manual and subtract are committed pixels',
        );
    }
});

test('the exit still republishes mask state so the op strip re-locks', () => {
    // Shrinking the mask to nothing by discarding a detection has to relock the op
    // strip, or a mask-only op stays enabled with no mask behind it (MPI-372/384).
    assert.match(exitBody, /emit\('mask-ready'/, '_exitAutoMaskMode no longer emits mask-ready');
    assert.match(exitBody, /emit\('mask-clear'/, '_exitAutoMaskMode no longer emits mask-clear');
});
