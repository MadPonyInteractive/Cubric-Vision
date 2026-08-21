// MPI-381. The mask family is one rail icon per masking method, and a new tool
// has to be declared in THREE places that live in two files. Miss one and the
// failure is silent: the tool mounts but the viewer never enters mask mode, or
// the PromptBox gate and teardown skip it, or the rail button does nothing.
//
// Source-text assertions on purpose — MpiGroupHistoryBlock pulls ~30 DOM modules
// and cannot be imported in node. Shapes (MPI-368) lands here next; this is the
// check that tells whoever wires it which places they forgot.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const RAIL = read('js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js');
const BLOCK = read('js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js');

/**
 * The COMPOSITE family, SCRAPED FROM THE RAIL rather than hardcoded (MPI-454).
 *
 * It used to be the literal `['maskComp', 'paintComp']`, and that left a hole exactly
 * where this file is supposed to be strongest. The list existed only to be SUBTRACTED
 * from the mask/paint prefix scrapes below, so it caught a composite tool only while its
 * name happened to start with `mask` or `paint`. `placeComp` collides with neither — so
 * every guard in this file would have stayed green whether or not it was registered at
 * all, which is precisely the silent-failure class the suite exists to catch.
 *
 * Reading the rail's own Composite group instead means the family is whatever the rail
 * offers, and a fourth front end is guarded the day someone adds the button.
 */
const COMPOSITE_MODES = (() => {
    const group = RAIL.match(/mode:\s*'composite',[\s\S]*?group:\s*\[([\s\S]*?)\n {8}\]/);
    assert.ok(group, 'the rail has no Composite group — MPI-373/MPI-424 taxonomy is gone?');
    const modes = [...group[1].matchAll(/mode:\s*'([A-Za-z]+)'/g)].map(m => m[1]);
    assert.ok(modes.length >= 3,
        `the Composite group offers ${modes.length} tool(s) (${modes.join(', ')}) — expected at `
        + 'least the three front ends: two hole-cutters and Place');
    return modes;
})();

/** Every `mode: 'maskXxx'` the image rail offers. Since MPI-425 some of these are
 *  nested inside a collapse entry's `sub: []` rather than sitting directly in the
 *  group — the key stays `mode:`, so a collapsed method is still caught here. That
 *  is the point: presentation moved, the registration duty did not. */
const railMaskTools = [...RAIL.matchAll(/mode:\s*'(mask[A-Za-z]+)'/g)]
    .map(m => m[1])
    .filter(m => !COMPOSITE_MODES.includes(m));

/** Mask modes that live inside a collapse entry rather than the rail column. */
const collapsedMaskTools = [...RAIL.matchAll(/collapse:\s*'[A-Za-z]+'[\s\S]*?sub:\s*\[([\s\S]*?)\]/g)]
    .flatMap(m => [...m[1].matchAll(/mode:\s*'(mask[A-Za-z]+)'/g)].map(s => s[1]));

test('the rail actually offers mask tools', () => {
    assert.ok(railMaskTools.length >= 3, `expected the split mask family, got ${railMaskTools.join(', ')}`);
});

// MPI-425. A collapse entry is the easy place to add a mode and forget the two
// registries — the button renders and the strip opens, so it LOOKS wired. Assert
// the nested modes explicitly rather than trusting the flat scrape above to keep
// matching if the def shape changes again.
test('collapsed mask modes are still real registered modes', () => {
    assert.ok(collapsedMaskTools.length >= 3,
        `expected the detect methods behind a collapse entry, got ${collapsedMaskTools.join(', ') || 'none'}`);

    const set = BLOCK.match(/const _MASK_TOOLS = new Set\(\[([^\]]*)\]\)/);
    const registry = BLOCK.match(/const TOOL_OPTIONS_REGISTRY = \{([\s\S]*?)\n\};/);
    assert.ok(set, '_MASK_TOOLS set literal not found in MpiGroupHistoryBlock');
    assert.ok(registry, 'TOOL_OPTIONS_REGISTRY not found in MpiGroupHistoryBlock');

    for (const mode of collapsedMaskTools) {
        assert.ok(
            railMaskTools.includes(mode),
            `${mode} is inside a collapse entry but the rail scrape missed it — the def shape changed and this guard went blind`,
        );
        assert.ok(
            set[1].includes(`'${mode}'`),
            `${mode} is in a collapse strip but missing from _MASK_TOOLS — the viewer would never enter mask mode for it`,
        );
        assert.match(
            registry[1],
            new RegExp(`\\b${mode}\\s*:`),
            `${mode} is in a collapse strip but has no TOOL_OPTIONS_REGISTRY entry — its strip button would mount nothing`,
        );
    }
});

// The collapse button itself owns modes, it is not one. If it ever carried a
// `mode:` key it would be scraped as a mask tool above and demand registry
// entries that must not exist.
test('a collapse entry declares no mode of its own', () => {
    const collapseBlocks = [...RAIL.matchAll(/\{\s*collapse:[\s\S]*?\n(\s*)\},/g)].map(m => m[0]);
    assert.ok(collapseBlocks.length >= 1, 'no collapse entry found in the rail');
    for (const block of collapseBlocks) {
        const head = block.slice(0, block.indexOf('sub:'));
        assert.ok(!/\bmode:/.test(head), `a collapse entry declares its own mode:\n${head}`);
    }
});

test('every rail mask tool is registered in _isMaskTool()', () => {
    const set = BLOCK.match(/const _MASK_TOOLS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(set, '_MASK_TOOLS set literal not found in MpiGroupHistoryBlock');
    for (const mode of railMaskTools) {
        assert.ok(
            set[1].includes(`'${mode}'`),
            `${mode} is in the rail but missing from _MASK_TOOLS — the viewer would never enter mask mode for it`,
        );
    }
});

test('every rail mask tool has an options compound', () => {
    const registry = BLOCK.match(/const TOOL_OPTIONS_REGISTRY = \{([\s\S]*?)\n\};/);
    assert.ok(registry, 'TOOL_OPTIONS_REGISTRY not found in MpiGroupHistoryBlock');
    for (const mode of railMaskTools) {
        assert.match(
            registry[1],
            new RegExp(`\\b${mode}\\s*:`),
            `${mode} is in the rail but has no TOOL_OPTIONS_REGISTRY entry — its button would mount nothing`,
        );
    }
});

// MPI-372: mask tools keep the PromptBox up. Any path that re-shows it after a
// hide (delete-entries, model switch) must gate on _modeKeepsPromptBox, never a
// bare `=== 'prompt'` — that leaves the box hidden in a mask tool until the user
// swaps tools and back.
test('PromptBox re-show paths do not gate on prompt mode alone', () => {
    const lines = BLOCK.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + 3).join('\n');
        if (!/_pb\??\.?\??\.el\??\.show\(\)/.test(window)) continue;
        assert.ok(
            !/getActiveMode\??\.?\(\)\s*===\s*'prompt'/.test(window),
            `MpiGroupHistoryBlock.js:${i + 1} re-shows the PromptBox behind a bare prompt-mode check — use _modeKeepsPromptBox()`,
        );
    }
});

// MPI-375. Paint is the SECOND family. It is deliberately NOT in _MASK_TOOLS —
// its artifact is real colour, not a mask — but it still has to reach the PromptBox
// gate and the viewer-mode bridge, which used to be one predicate doing three jobs.
// Every failure here is silent in the app: the tool mounts and paints, and only the
// PromptBox quietly never appears.
const railPaintTools = [...RAIL.matchAll(/mode:\s*'(paint[A-Za-z]*)'/g)]
    .map(m => m[1])
    .filter(m => !COMPOSITE_MODES.includes(m));

test('every rail paint tool is registered in _PAINT_TOOLS', () => {
    const set = BLOCK.match(/const _PAINT_TOOLS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(set, '_PAINT_TOOLS set literal not found in MpiGroupHistoryBlock');
    assert.ok(railPaintTools.length >= 1, 'the rail offers no paint tool at all');
    for (const mode of new Set(railPaintTools)) {
        assert.ok(
            set[1].includes(`'${mode}'`),
            `${mode} is in the rail but missing from _PAINT_TOOLS — the viewer would never enter paint mode for it`,
        );
    }
});

test('every rail paint tool has an options compound', () => {
    const registry = BLOCK.match(/const TOOL_OPTIONS_REGISTRY = \{([\s\S]*?)\n\};/);
    assert.ok(registry, 'TOOL_OPTIONS_REGISTRY not found in MpiGroupHistoryBlock');
    for (const mode of new Set(railPaintTools)) {
        assert.match(
            registry[1],
            new RegExp(`\\b${mode}\\s*:`),
            `${mode} is in the rail but has no TOOL_OPTIONS_REGISTRY entry — its button would mount nothing`,
        );
    }
});

// The exact bug the predicate split exists to prevent: paint keeping the PromptBox.
// _modeKeepsPromptBox must reach the paint family, and _viewerModeFor must map it to
// the 'paint' canvas mode rather than falling through to null (which would leave the
// pointer belonging to nobody and a drag panning instead of painting).
test('the PromptBox gate covers the paint family, not just masks', () => {
    const gate = BLOCK.match(/const _modeKeepsPromptBox = [^\n]*/);
    assert.ok(gate, '_modeKeepsPromptBox not found in MpiGroupHistoryBlock');
    assert.match(
        gate[0],
        /_isCanvasTool\(mode\)|_isPaintTool\(mode\)/,
        'paint → mask → detail is ONE operation, so paint must keep the PromptBox — '
        + `the gate only reaches the mask family: ${gate[0]}`,
    );
});

test('the viewer-mode bridge maps the paint family to paint mode', () => {
    // `;\r?\n`, not `;\n` — the working tree is CRLF and a bare \n anchor silently
    // matches nothing, which reads as "the constant was renamed" rather than as a
    // line-ending bug. It cost a red test here before it could cost a wrong fix.
    const bridge = BLOCK.match(/const _viewerModeFor = [\s\S]*?;\r?\n/);
    assert.ok(bridge, '_viewerModeFor not found in MpiGroupHistoryBlock');
    assert.match(
        bridge[0],
        /_isPaintTool\(mode\)\s*\?\s*'paint'/,
        `_viewerModeFor never returns 'paint', so a paint tool would enter no canvas mode:\n${bridge[0]}`,
    );
});

// THE HALF-WIRE THIS TEST EXISTS FOR (MPI-375, caught by the user in the app).
// `paint` was added to MpiCanvas.activeMode, to the rail, to TOOL_OPTIONS_REGISTRY
// and to _viewerModeFor — and MpiCanvasViewer's own _enterMode still had a hardcoded
// chain that only knew 'crop' and 'mask', so 'paint' fell through to
// `activeMode = 'none'`. NOTHING FAILED: the button worked, the panel mounted, and
// the canvas simply panned on drag and zoomed on wheel. A dead tool that looks alive.
//
// The two ends must agree: every mode _viewerModeFor can RETURN, the viewer must
// ACCEPT.
test('the viewer accepts every canvas mode the block can send it', () => {
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const bridge = BLOCK.match(/const _viewerModeFor = [\s\S]*?;\r?\n/);
    assert.ok(bridge, '_viewerModeFor not found in MpiGroupHistoryBlock');

    // Every string literal the bridge can return, minus the null fallback.
    const emitted = [...bridge[0].matchAll(/\?\s*'([a-z]+)'/g)].map(m => m[1]);
    assert.ok(emitted.includes('crop') && emitted.includes('mask'),
        `the bridge scrape went blind — got ${emitted.join(', ') || 'nothing'}`);

    const accepted = viewer.match(/const CANVAS_MODES = new Set\(\[([^\]]*)\]\)/);
    assert.ok(accepted, 'CANVAS_MODES set not found in MpiCanvasViewer — _enterMode went back to a hardcoded chain');

    for (const mode of emitted) {
        // 'crop' is handled by its own branch above the set, since it also restores
        // the crop rect.
        if (mode === 'crop') continue;
        assert.ok(
            accepted[1].includes(`'${mode}'`),
            `_viewerModeFor can return '${mode}' but MpiCanvasViewer's CANVAS_MODES does not accept it — `
            + `_enterMode would fall through to activeMode = 'none' and the tool would silently do nothing`,
        );
    }
});

// The two `modechange` subscriptions used to hold identical copies of the
// drop-stale-mode triple, so a mode added to one was forgotten in the other.
test('canvas modechange sync is written once', () => {
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const inlined = [...viewer.matchAll(/if \(mode !== 'crop' && _currentMode === 'crop'\)/g)];
    assert.strictEqual(inlined.length, 0,
        'the modechange sync is inlined again — it must stay in _syncModeFromCanvas, '
        + 'or the second subscription will drift from the first');
    assert.match(viewer, /function _syncModeFromCanvas\(mode\)/,
        '_syncModeFromCanvas not found in MpiCanvasViewer');
});

// The strip is shared by both families now, so its destination table is the thing
// that must not silently lose a row — a missing one falls back to 'mask' and the
// paint tool would drive the MASK layer while looking correct.
test('the shared strip declares a paint destination', () => {
    const strip = read('js/components/Compounds/MpiMaskStrip/MpiMaskStrip.js');
    const table = strip.match(/const DESTINATIONS = \{([\s\S]*?)\n\};/);
    assert.ok(table, 'DESTINATIONS table not found in MpiMaskStrip');
    for (const key of ['mask', 'paint']) {
        assert.match(table[1], new RegExp(`\\b${key}\\s*:\\s*\\{`), `DESTINATIONS is missing the ${key} row`);
    }
    assert.match(
        read('js/components/Organisms/MpiToolOptionsPaint/MpiToolOptionsPaint.js'),
        /MpiMaskStrip\.mount\([\s\S]{0,200}?dest:\s*'paint'/s,
        'MpiToolOptionsPaint mounts the strip without dest: paint — it would drive the MASK layer',
    );
});

// MPI-375 item 4. The Apply button asks `typeof viewer.el.applyPaint === 'function'`
// and renders DISABLED when it is missing — deliberately, so a click is never
// swallowed. The cost of that honesty is that a lost method reads as a shipped-but-
// inert button rather than as an error, so the method itself gets a guard.
test('the viewer exposes the Apply the paint tool gates on', () => {
    const panel = read('js/components/Organisms/MpiToolOptionsPaint/MpiToolOptionsPaint.js');
    assert.match(panel, /typeof viewer\.el\.applyPaint === 'function'/,
        'MpiToolOptionsPaint stopped gating Apply on applyPaint — a missing method would now click into silence');
    assert.match(
        read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js'),
        /el\.applyPaint\s*=/,
        'MpiCanvasViewer does not define el.applyPaint, so the Apply button renders permanently disabled',
    );
});

// Apply bakes at the slider, so the new entry matches the screen. Both halves of
// that are silent when broken: a dropped body field bakes at 100%, and a getter
// missing from the _methods ALLOWLIST is `undefined` on el, which the optional call
// swallows into the same wrong 100% — no error either way, just a stronger colour
// than the user chose.
test('Apply carries the opacity slider, and its getter is allowlisted', () => {
    assert.match(
        read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js'),
        /opacity:\s*canvas\.getPaintOpacity\?\.\(\)/,
        'applyPaint stopped sending the opacity — the bake would ignore the slider',
    );
    const methods = read('js/components/Primitives/MpiCanvas/MpiCanvas.js').match(/const _methods = \[([\s\S]*?)\n {8}\];/);
    assert.ok(methods, '_methods allowlist not found in MpiCanvas');
    assert.match(methods[1], /'getPaintOpacity'/,
        'getPaintOpacity is missing from the _methods allowlist, so el.getPaintOpacity is undefined '
        + 'and the optional call falls back to a silent 100% bake');
});

// Per-entry paint persistence is two halves and BOTH are silent when missing:
// no write and the strokes vanish on the next entry switch; no read and they never
// come back. The third guard is the one that bit hardest to reason about — the mask
// TEMP delete used to remove the whole item dir, which would make Clear mask wipe a
// paint layer that has nothing to do with it.
test('paint persists per entry, and Clear mask cannot take it with it', () => {
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');

    const persist = viewer.match(/async function _persistLayers\([\s\S]*?\n {8}\}/);
    assert.ok(persist, '_persistLayers not found in MpiCanvasViewer');
    assert.match(persist[0], /maskTempStore\.writePaint\(/,
        '_persistLayers never writes the paint layer — it would be lost on every entry switch');
    assert.match(persist[0], /maskTempStore\.deletePaint\(/,
        '_persistLayers never deletes the paint layer, so a cleared layer resurrects on the next visit');

    const restore = viewer.match(/async function _restoreLayers\([\s\S]*?\n {8}\}/);
    assert.ok(restore, '_restoreLayers not found in MpiCanvasViewer');
    // Lookahead, not a bare substring: `setPaintFromDataURLTypo` contains the name
    // and would satisfy a loose match — the negative control caught exactly that.
    assert.match(restore[0], /setPaintFromDataURL(?![A-Za-z0-9_])/,
        '_restoreLayers never reads the paint layer back — paint would persist and never return');

    const del = read('main.js').match(/ipcMain\.handle\('mask-temp:delete',[\s\S]*?\n {2}\}\);/);
    assert.ok(del, "mask-temp:delete handler not found in main.js");
    assert.doesNotMatch(del[0], /rmSync\(dir,/,
        'mask-temp:delete removes the whole item dir again — paint.png lives there and Clear mask would wipe it');
});

// MPI-368. Shapes is ONE gizmo mounted twice, and the two mounts are one word
// apart in the source. Swapping which family each belongs to is invisible in the
// app: the rail still shows both buttons, the panel still opens, and the shape
// simply lands in the wrong layer.
test('the two shape mounts sit in DIFFERENT families', () => {
    const maskSet = BLOCK.match(/const _MASK_TOOLS = new Set\(\[([^\]]*)\]\)/);
    const paintSet = BLOCK.match(/const _PAINT_TOOLS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(maskSet && paintSet, 'family sets not found in MpiGroupHistoryBlock');

    assert.ok(maskSet[1].includes(`'maskShapes'`), 'maskShapes is missing from _MASK_TOOLS');
    assert.ok(paintSet[1].includes(`'paintShapes'`), 'paintShapes is missing from _PAINT_TOOLS');
    assert.ok(!maskSet[1].includes(`'paintShapes'`),
        'paintShapes is in _MASK_TOOLS — it would drive the MASK layer while the rail says Paint');
    assert.ok(!paintSet[1].includes(`'maskShapes'`),
        'maskShapes is in _PAINT_TOOLS — it would rasterise colour instead of a mask');
});

// One component is registered under BOTH shape modes and picks its destination from
// `props.mode`. If the block ever stops passing `mode`, the panel throws on mount —
// loud, deliberately — but this guard says which end broke.
test('the options mount passes the mode through, and both shape modes resolve', () => {
    assert.match(BLOCK, /Compound\.mount\(slot,\s*\{[^}]*\bmode\b/,
        'mountOptions no longer passes `mode` into the options props — MpiToolOptionsShapes cannot pick a destination');

    const registry = BLOCK.match(/const TOOL_OPTIONS_REGISTRY = \{([\s\S]*?)\n\};/);
    assert.ok(registry, 'TOOL_OPTIONS_REGISTRY not found');
    for (const mode of ['maskShapes', 'paintShapes']) {
        assert.match(registry[1], new RegExp(`\\b${mode}\\s*:`), `${mode} has no options compound`);
        assert.match(RAIL, new RegExp(`mode:\\s*'${mode}'`), `${mode} has no rail button`);
    }
});

// A shape commit is a layer-wide ONE SHOT, so it records a single undo entry AFTER
// the no-op guard. Both halves are silent when wrong: no record at all is a hole in
// Ctrl+Z, and recording before the guard books an empty entry that eats a press.
test('both shape commits record undo, after the no-op guard', () => {
    const cases = [
        ['js/components/Primitives/MpiCanvas/managers/MaskManager.js', 'MaskManager'],
        ['js/components/Primitives/MpiCanvas/managers/PaintManager.js', 'PaintManager'],
    ];
    for (const [file, name] of cases) {
        const body = read(file).match(/commitShape\(buildPath[\s\S]*?\n {4}\}/);
        assert.ok(body, `${name}.commitShape not found`);
        const guardAt = body[0].search(/if\s*\(!path\)\s*return false;/);
        const recordAt = body[0].search(/this\._recordUndo\(\)/);
        assert.ok(guardAt >= 0, `${name}.commitShape lost its null-path guard`);
        assert.ok(recordAt >= 0, `${name}.commitShape records no undo entry — a silent hole in Ctrl+Z`);
        assert.ok(recordAt > guardAt,
            `${name}.commitShape records BEFORE its no-op guard — a commit with nothing to draw would book an empty entry`);
    }
});

// The gizmo API reaches the panel through el, and the allowlist is what makes that
// true. A name missing there is `undefined` on el and the panel's optional call
// swallows it: the button clicks and nothing happens.
test('every shape method the panel calls is allowlisted on MpiCanvas', () => {
    const methods = read('js/components/Primitives/MpiCanvas/MpiCanvas.js').match(/const _methods = \[([\s\S]*?)\n {8}\];/);
    assert.ok(methods, '_methods allowlist not found in MpiCanvas');
    for (const name of ['setShapeMode', 'setShapeKind', 'getShapeKind', 'hasShape', 'resetShape', 'clearShape', 'commitShape']) {
        assert.match(methods[1], new RegExp(`'${name}'`),
            `${name} is missing from the _methods allowlist — el.${name} would be undefined and the call silently swallowed`);
    }
});

// MPI-373. The THIRD family, and the one that breaks the pattern the other two set:
// it is a canvas tool but must NOT keep the PromptBox. That single difference is
// what a `_isCanvasTool`-shaped gate would silently get wrong — the box would sit on
// top of the slots and nothing would look broken enough to notice.
test('the composite family is registered, and in its OWN set', () => {
    const compSet = BLOCK.match(/const _COMPOSITE_TOOLS = new Set\(\[([^\]]*)\]\)/);
    const maskSet = BLOCK.match(/const _MASK_TOOLS = new Set\(\[([^\]]*)\]\)/);
    const paintSet = BLOCK.match(/const _PAINT_TOOLS = new Set\(\[([^\]]*)\]\)/);
    const registry = BLOCK.match(/const TOOL_OPTIONS_REGISTRY = \{([\s\S]*?)\n\};/);
    assert.ok(compSet, '_COMPOSITE_TOOLS set literal not found in MpiGroupHistoryBlock');
    assert.ok(maskSet && paintSet && registry, 'family sets / registry not found');

    for (const mode of COMPOSITE_MODES) {
        assert.ok(compSet[1].includes(`'${mode}'`), `${mode} is missing from _COMPOSITE_TOOLS`);
        assert.match(RAIL, new RegExp(`mode:\\s*'${mode}'`), `${mode} has no rail button`);
        assert.match(registry[1], new RegExp(`\\b${mode}\\s*:`), `${mode} has no TOOL_OPTIONS_REGISTRY entry`);
        assert.ok(!maskSet[1].includes(`'${mode}'`),
            `${mode} is in _MASK_TOOLS — its cut would be treated as the entry's mask and persist`);
        assert.ok(!paintSet[1].includes(`'${mode}'`),
            `${mode} is in _PAINT_TOOLS — the pointer would belong to the paint brush, not the cut`);
    }
});

test('composite is a canvas tool but does NOT keep the PromptBox', () => {
    const canvasGate = BLOCK.match(/const _isCanvasTool = [^\n]*/);
    const promptGate = BLOCK.match(/const _modeKeepsPromptBox = [^\n]*/);
    assert.ok(canvasGate && promptGate, 'the tool-family predicates were not found');
    assert.match(canvasGate[0], /_isCompositeTool\(mode\)/,
        `composite must count as a canvas tool for teardown and the mode bridge: ${canvasGate[0]}`);
    assert.ok(!/_isCanvasTool\(mode\)/.test(promptGate[0]),
        '_modeKeepsPromptBox delegates to _isCanvasTool, which now includes composite — '
        + `the one group that must DROP the box would keep it: ${promptGate[0]}`);
    assert.ok(!/_isCompositeTool\(mode\)/.test(promptGate[0]),
        `_modeKeepsPromptBox reaches the composite family: ${promptGate[0]}`);
});

// Same half-wire class as MPI-375's dead paint tool: the bridge must return
// 'composite' AND the viewer's CANVAS_MODES must accept it. (The generic
// bridge-vs-viewer test above covers the second half for every mode the bridge can
// emit; this one asserts the bridge emits it at all.)
test('the viewer-mode bridge maps the composite family to composite mode', () => {
    const bridge = BLOCK.match(/const _viewerModeFor = [\s\S]*?;\r?\n/);
    assert.ok(bridge, '_viewerModeFor not found in MpiGroupHistoryBlock');
    assert.match(
        bridge[0],
        /_isCompositeTool\(mode\)\s*\?\s*'composite'/,
        `_viewerModeFor never returns 'composite', so the cut brush would own no pointer:\n${bridge[0]}`,
    );
});

// The cut is SCRATCH (user, 2026-08-04) and an uncommitted one is a preview — of BOTH
// halves. Dropping only the hole would leave the slot image under the next tool.
test('discardPreview drops the whole composite preview', () => {
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const discard = viewer.match(/el\.discardPreview = \(\) => \{[\s\S]*?\n {8}\};/);
    assert.ok(discard, 'el.discardPreview not found in MpiCanvasViewer');
    assert.match(discard[0], /canvas\.resetComposite\?\.\(\)/,
        'discardPreview never resets the composite — an uncommitted cut and its slot image '
        + 'would outlive the tool, which is exactly what the preview contract forbids');

    const reset = read('js/components/Primitives/MpiCanvas/managers/CompositeManager.js')
        .match(/ {4}reset\(\) \{[\s\S]*?\n {4}\}/);
    assert.ok(reset, 'CompositeManager.reset not found');
    assert.match(reset[0], /this\.underlay = null/,
        'reset() keeps the underlay — the next tool would still be showing the slot image');
});

// MPI-454. Place is the third front end and the one that inverts the stack: the slot
// image goes ON TOP and its own alpha is the cut. It borrows the SHAPE gizmo for geometry
// and the COMPOSITE manager for pixels, and each of those seams fails silently on its own —
// a gizmo whose destination falls through commits a rectangle into the mask, and a preview
// the manager's reset() forgets is drawn over the next tool's entry.
test('Place borrows the gizmo without being able to commit into a layer', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const commit = canvas.match(/ {4}commitShape\(op\) \{[\s\S]*?\n {4}\}/);
    assert.ok(commit, 'MpiCanvas.commitShape not found');
    assert.match(commit[0], /dest === 'place'/,
        'commitShape has no branch for the place destination, so it falls through to the '
        + 'mask — a placement would silently rasterise its rectangle into the entry\'s mask');

    const shape = read('js/components/Primitives/MpiCanvas/managers/ShapeManager.js');
    const setMode = shape.match(/ {4}setMode\(dest\) \{[\s\S]*?\n {4}\}/);
    assert.ok(setMode, 'ShapeManager.setMode not found');
    assert.match(setMode[0], /this\.kind = 'rect'/,
        '`kind` is shared with the shape tools, so arming Place after an ellipse would draw '
        + 'an ellipse outline round a rectangular image — setMode must force rect');
});

// THE BUG THIS TOOL SHIPPED WITH, caught on the live app 2026-08-21 and the exact shape of
// the cut bug above: Apply RELOADS the entry it just created, `loadImage` -> `shape.init()`
// clears the gizmo, and Place went dead on its own primary action — image still in the slot,
// Apply still enabled, nothing on the canvas to apply. The re-seed also gives Place the shape
// tools' rule that the gizmo survives its commit.
test('the place gizmo survives the reload its own Apply triggers', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const load = canvas.match(/this\.comp\.init\([\s\S]{0,2000}?await this\.resetView\(\)/);
    assert.ok(load, 'the comp.init() call in loadImage was not found');
    assert.match(load[0], /shapeMode === 'place'[\s\S]*?this\.shape\.seed\(/,
        'loadImage does not re-seed the place gizmo, so Apply leaves the tool enabled over '
        + 'a canvas with nothing on it — the next press warns instead of placing');
});

// THE SECOND BUG THE USER CAUGHT (2026-08-21): the panel's reset button called
// `resetShape()`, whose `seed()` takes no argument and therefore seeds a SQUARE — so the
// control meant to rescue a placement squashed the photo to 1:1 instead. Place gets a
// RESIZER, and `seed()`'s square default must never reach a placed image again.
test('restoring a placement never squares it', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const panel = read('js/components/Organisms/MpiToolOptionsPlace/MpiToolOptionsPlace.js');

    assert.ok(!/viewer\.el\.resetShape/.test(panel),
        'the Place panel calls resetShape() — that seeds a square and distorts the placed '
        + 'image; it wants restorePlaceSize()');
    assert.match(panel, /viewer\.el\.restorePlaceSize\?\.\(\)/,
        'the Place panel has no restore-size control');

    const restore = canvas.match(/ {4}restorePlaceSize\(\) \{[\s\S]*?\n {4}\}/);
    assert.ok(restore, 'MpiCanvas.restorePlaceSize not found');
    assert.match(restore[0], /img\.width \/ 2/,
        'restorePlaceSize does not restore the image\'s own pixel dimensions');
    assert.ok(!/this\.shape\.cx =|this\.shape\.rot =/.test(restore[0]),
        'restorePlaceSize moves or unrotates the placement — it is a resizer, and doing '
        + 'either would undo a placement the user was happy with');

    const reset = canvas.match(/ {4}resetShape\(\) \{[\s\S]*?\n {4}\}/);
    assert.ok(reset, 'MpiCanvas.resetShape not found');
    assert.match(reset[0], /shapeMode === 'place'[\s\S]*?img\.width \/ img\.height/,
        'resetShape still seeds a bare square for a placement — the squash bug');
});

test('a placement is dropped by the same preview seam the cut is', () => {
    const reset = read('js/components/Primitives/MpiCanvas/managers/CompositeManager.js')
        .match(/ {4}reset\(\) \{[\s\S]*?\n {4}\}/);
    assert.ok(reset, 'CompositeManager.reset not found');
    assert.match(reset[0], /this\.placeImage = null/,
        'reset() keeps the placed image — it would stay drawn over the next tool\'s entry, '
        + 'which is exactly what the preview contract forbids');
});

test('every Place method the panel calls is allowlisted on MpiCanvas', () => {
    const methods = read('js/components/Primitives/MpiCanvas/MpiCanvas.js').match(/const _methods = \[([\s\S]*?)\n {8}\];/);
    assert.ok(methods, '_methods allowlist not found in MpiCanvas');
    for (const name of ['setPlaceImage', 'hasPlaceImage', 'getPlaceURL']) {
        assert.match(methods[1], new RegExp(`'${name}'`),
            `${name} is missing from the _methods allowlist — el.${name} would be undefined and swallowed`);
    }
});

// The cut-out must not become a gallery card or a history entry — that pollution is the
// whole reason MPI-377's original design was rejected. `deferCommit` is honoured ONLY in
// the gallery branch, which is selected by the ABSENCE of `existingGroup`; passing one
// would commit the cut-out with no error anywhere.
test('Place removes a background without committing anything', () => {
    const run = BLOCK.match(/function _cutOutSlotImage\([\s\S]*?\n {8}\}/);
    assert.ok(run, '_cutOutSlotImage not found in MpiGroupHistoryBlock');
    // Comments stripped first: this function EXPLAINS why it passes no `existingGroup`, so
    // a naive scan of the body finds the word in the prose that warns against it.
    const code = run[0].replace(/\/\/[^\n]*/g, '');
    assert.match(code, /deferCommit:\s*true/,
        'the slot cut-out is dispatched without deferCommit — it would land as a real '
        + 'gallery card for an image the user only wanted in a tool slot');
    assert.ok(!/existingGroup/.test(code),
        'passing existingGroup selects the groupHistory branch, where deferCommit is never '
        + 'read — the cut-out would be appended to the group as a history entry');

    const gen = read('js/services/generationService.js');
    assert.match(gen, /if \(!opts\.deferCommit\) \{/,
        'generationService no longer honours deferCommit — Place\'s Remove Background '
        + 'toggle is built on it (MPI-306 HOLD-UNTIL-APPLY)');
});

// The drop is the load-bearing half of MPI-377. An IMAGE drop fills the tool slot; a VIDEO
// drop keeps the chip path, because that is how a start/end frame unlocks the frame-driven
// i2v ops when no media is staged. Collapsing the two is how the video half gets broken
// while fixing the image one.
test('an image drop fills the Place slot and a video drop still stages a chip', () => {
    const drop = BLOCK.match(/const _dropOverlay = MpiMediaDropOverlay\.mount\([\s\S]*?\n {8}\}\);/);
    assert.ok(drop, 'the drop overlay mount was not found in MpiGroupHistoryBlock');
    assert.match(drop[0], /_fillPlaceSlotFromFile\(/,
        'a dropped image no longer reaches the Place slot — MPI-377\'s bug is back');
    assert.match(drop[0], /injectMedia/,
        'the video chip path was stripped out of the drop handler — a start/end-frame drop '
        + 'is how the frame-driven i2v ops are unlocked with no media staged');
    assert.match(drop[0], /if \(!isVideo\)/,
        'the two drop destinations are not split on group type, so one of them is wrong');
});

// The composite mask never round-trips as base64 and the route it feeds does NOT
// fill holes any more (MPI-437). A `fillHoles: true` creeping in here would turn an
// edge-band cut into a solid disc — the exact defect that card removed.
test('composite Apply reuses the full-res route, and never fills holes', () => {
    assert.match(BLOCK, /_runComposite\(baseItem, \{ filePath: overlayUrl \}, maskDataUrl\)/,
        'the composite panel no longer routes through _runComposite — the full-res server path');
    const run = BLOCK.match(/async function _runComposite\([\s\S]*?\n {8}\}/);
    assert.ok(run, '_runComposite not found');
    assert.match(run[0], /'\/project\/composite-media'/, '_runComposite stopped calling composite-media');
    assert.ok(!/fillHoles/.test(run[0]),
        '_runComposite passes fillHoles — MPI-437 made it opt-in because an edge-band mask '
        + 'composited as a solid disc; MPI-373 inherits that route unchanged');
});

// THE BUG THE USER HIT (2026-08-04). Apply reloads the entry it just created, which
// runs loadImage → comp.init() → the cut is wiped. The panel was never told, so Apply
// stayed enabled over a hole that no longer existed and the next press returned
// silently at its own null guard — no error, no toast, nothing. Every path that
// empties the cut has to announce it, or the gate lies.
test('every path that empties the composite cut announces it', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');

    // `\r?\n` — the working tree is CRLF and a bare `\n` anchor matches nothing,
    // which reads as "the method was renamed" rather than as a line-ending bug. It
    // cost a red test here once already (see _viewerModeFor above).
    // The window is a proximity bound, not a size limit: the announce has to sit in the
    // same block as `comp.init`, not somewhere else in loadImage. Widened from 1200 for
    // MPI-454, which added the place-gizmo re-seed to that block (measured span 1532).
    const load = canvas.match(/this\.comp\.init\([\s\S]{0,2000}?await this\.resetView\(\)/);
    assert.ok(load, 'the comp.init() call in loadImage was not found');
    assert.match(load[0], /this\._onCompositeChange\?\.\(\)/,
        'loadImage clears the cut without announcing it — Apply would stay enabled over an '
        + 'empty hole and the next press would return silently, which is how this shipped');

    for (const [name, re] of [
        ['clearComposite', / {4}clearComposite\(\) \{[\s\S]*?\n {4}\}/],
        ['setCompositeHoleFromDataURL', / {4}async setCompositeHoleFromDataURL\([\s\S]*?\n {4}\}/],
    ]) {
        const body = canvas.match(re);
        assert.ok(body, `${name} not found in MpiCanvas`);
        assert.match(body[0], /_onCompositeChange\?\.\(\)/,
            `${name} changes the cut without announcing it — the Apply gate would go stale`);
    }
});

// The slot toggles `hidden` on two children its own CSS gives a `display` to, and a
// class beats the UA sheet — so the filled thumb and the empty hint rendered side by
// side. Caught in the app, 2026-08-04. Same trap MPI-382 hit with the slider rows.
test('the media slot actually hides the half it is not showing', () => {
    const css = read('js/components/Compounds/MpiMediaSlot/MpiMediaSlot.css');
    for (const cls of ['__thumb', '__empty']) {
        assert.match(css, new RegExp(`\\.mpi-media-slot${cls}\\[hidden\\]`),
            `.mpi-media-slot${cls} carries a display but has no [hidden] override — `
            + 'it renders even when the component hides it');
    }
    assert.match(css, /\[hidden\][\s\S]{0,80}\{\s*display:\s*none/,
        'the [hidden] overrides do not set display: none');
});

// The preview and the file must agree. The canvas covers-and-centre-crops its
// underlay; Sharp has to do the same, or a mismatched pair looks like a centre crop
// on screen and lands stretched on disk.
test('client preview and server blend both COVER the underlay', () => {
    assert.match(
        read('js/components/Primitives/MpiCanvas/managers/CompositeManager.js'),
        /Math\.max\(W \/ img\.width, H \/ img\.height\)/,
        'drawUnderlayCover no longer covers — a fit would leave transparent bands inside the cut');
    const svc = read('services/imageComposite.js');
    // `overlayRgb`, not `overlay`: the cover resize is MATERIALISED before the mask is
    // joined to it, because joinChannel in the same pipeline binds to the pre-crop image
    // and left a transparent strip at one edge. The pixel test above guards that half.
    const overlay = svc.match(/const overlayRgb = await sharp\(overlayPath\)[\s\S]*?\.toBuffer\(\);/);
    assert.ok(overlay, 'the overlay pipeline was not found in imageComposite.js');
    assert.match(overlay[0], /fit:\s*'cover'/,
        "the overlay is resized with something other than fit: 'cover' — the written file would "
        + 'disagree with the preview the user approved');
});

// A REAL-PIXEL test, and it has to be: the defect it guards is libvips BEHAVIOUR, so
// every source assertion in this file would have passed while the bug shipped.
//
// `fit: 'cover'` is resize-then-CROP, and `joinChannel` in the same pipeline binds the
// mask to the PRE-crop image — the alpha plane is zero-extended to the wider intermediate
// and the crop then keeps some of those transparent columns at one edge. The user saw a
// 4px strip of the BASE down the right edge of a composite whose mask was white there
// (measured 2026-08-04: exactly 4x1136 = 4544 px). It CANNOT happen while the overlay is
// resized with `fit: 'fill'`, which is why MPI-373's cover change is what introduced it.
//
// Mismatched aspects on purpose — a matching pair crops nothing and passes either way.
test('a white mask takes the WHOLE overlay, right to the frame edge', async () => {
    const sharp = require('sharp');
    const os = require('node:os');
    const { compositeThroughMask } = require('../services/imageComposite.js');

    const W = 40, H = 50;                       // base 0.80 …
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi373-'));
    const basePath = path.join(dir, 'base.png');
    const overPath = path.join(dir, 'over.png');
    const outPath = path.join(dir, 'out.png');

    try {
        await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 0, b: 0 } } })
            .png().toFile(basePath);
        // … overlay 1.00, so cover scales it to 50x50 and crops 5 columns off EACH side.
        await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 255 } } })
            .png().toFile(overPath);

        const maskBuffer = await sharp({
            create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        }).png().toBuffer();

        await compositeThroughMask({ basePath, overlayPath: overPath, maskBuffer, outPath, feather: 0 });

        const px = await sharp(outPath).removeAlpha().raw().toBuffer();
        const leaked = [];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 3;
                if (px[i] > 40) leaked.push(`${x},${y}`);   // any red = the base showed through
            }
        }
        assert.strictEqual(leaked.length, 0,
            `${leaked.length} px kept the BASE under an all-white mask (first at ${leaked[0]}). `
            + 'The mask is being joined to the overlay BEFORE the cover crop, so the alpha plane '
            + 'is misaligned and a strip at one edge comes out transparent.');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// Composite methods reach the panel through el, same allowlist trap as the shape and
// paint families: a missing name is `undefined` and the optional call eats it.
test('every composite method the panel calls is allowlisted on MpiCanvas', () => {
    const methods = read('js/components/Primitives/MpiCanvas/MpiCanvas.js').match(/const _methods = \[([\s\S]*?)\n {8}\];/);
    assert.ok(methods, '_methods allowlist not found in MpiCanvas');
    for (const name of ['setCompositeUnderlay', 'setCompositeHoleFromDataURL', 'setCompositeHoleFromMask', 'setCompositeEnabled',
        'hasCompositeHole', 'getCompositeURL', 'clearComposite', 'resetComposite', 'setOnCompositeChange']) {
        assert.match(methods[1], new RegExp(`'${name}'`),
            `${name} is missing from the _methods allowlist — el.${name} would be undefined and swallowed`);
    }
});

// The strip is shared by three destinations now. A missing row falls back to 'mask',
// which would point Clear and the brush pair at the entry's real mask.
test('the shared strip declares a composite destination, with no opacity', () => {
    const strip = read('js/components/Compounds/MpiMaskStrip/MpiMaskStrip.js');
    const table = strip.match(/const DESTINATIONS = \{([\s\S]*?)\n\};/);
    assert.ok(table, 'DESTINATIONS table not found in MpiMaskStrip');
    assert.match(table[1], /\bcomposite\s*:\s*\{/, 'DESTINATIONS is missing the composite row');
    const row = table[1].match(/composite:\s*\{([\s\S]*?)\n {4}\}/);
    assert.ok(row, 'the composite row could not be read');
    assert.match(row[1], /opacitySlider:\s*false/,
        'the composite destination offers an opacity slider — a composite is a hard cut, so a '
        + 'display alpha would make the preview disagree with the file Sharp writes');
    assert.match(strip, /dest\.opacitySlider === false/,
        'DESTINATIONS declares opacitySlider but setup() never honours it — the row would render inert');
});

// The retired MPI-362 modal. Deleting it was a DECISION (user, 2026-08-04), not
// cleanup, and a half-deletion is the shape that rots: a dangling handler on an event
// nothing emits, or a preloaded stylesheet for a component that is gone.
test('the blind Add/Subtract composite modal is fully gone', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'js/components/Compounds/MpiMaskCompositeDialog')),
        'MpiMaskCompositeDialog still exists — MPI-373 replaced it with the Composite group');
    assert.ok(!/MpiMaskCompositeDialog/.test(read('js/shell/preloadStyles.js')),
        'preloadStyles.js still loads the deleted dialog stylesheet');
    assert.ok(!/composite-requested/.test(read('js/components/Compounds/MpiHistoryList/MpiHistoryList.js')),
        'MpiHistoryList still emits composite-requested — nothing listens for it any more');
});

// THE REDESIGN (user, 2026-08-04). `Copy image` in the history list was the slot's
// first source and came straight back out: the image you want UNDERNEATH is the one
// you are looking at, so the gesture belongs on the canvas — the same one the Video
// workspace already offers as Set as start/end frame. A half-swap (both gestures, or
// neither) is the shape that rots.
test('the composite slot is filled from the canvas, not from the history list', () => {
    const list = read('js/components/Compounds/MpiHistoryList/MpiHistoryList.js');
    assert.ok(!/'copy-image'/.test(list),
        'Copy image is still in the history list — it was replaced by Send to Composite on the canvas');

    const menu = BLOCK.match(/Events\.on\('image-viewer:context-menu'[\s\S]*?\n {12}\}\)\);/);
    assert.ok(menu, 'the image-viewer context-menu handler was not found in MpiGroupHistoryBlock');
    assert.match(menu[0], /key: 'send-composite'/,
        'the canvas context menu offers no Send to Composite — nothing can fill the slot');
    assert.match(menu[0], /_compositeImage = \{/,
        'Send to Composite never writes the buffer the Composite panel reads');
});

// THE REDESIGN, part 2: no pasted-mask slot. Mask Comp reads the mask already on the
// selected entry — the user has the whole mask toolkit pointed at that exact layer.
test('Mask Comp reads the entry mask instead of a pasted one', () => {
    const panel = read('js/components/Organisms/MpiToolOptionsComposite/MpiToolOptionsComposite.js');
    assert.ok(!/mask-slot|maskSlot/.test(panel),
        'the pasted-mask slot survives in MpiToolOptionsComposite — it was deleted (user, 2026-08-04)');
    assert.match(panel, /setCompositeHoleFromMask\?\.\(\)/,
        'Mask Comp never reads the entry mask, so its cut can only ever be empty');

    const clip = BLOCK.match(/const _clipboard = \{[\s\S]*?\n {8}\};/);
    assert.ok(clip, '_clipboard not found in MpiGroupHistoryBlock');
    assert.ok(!/hasMask|getMask/.test(clip[0]),
        '_clipboard still exposes the mask buffer to the panel — dead once the mask slot went');
});

// THE SECOND HALF, and it shipped broken (user, 2026-08-04): selecting another history
// entry does NOT remount the panel, so its mount-time mask read is the one thing that
// never fires again — while `loadImage()` wipes the hole because it was drawn for the
// OLD image's geometry. Apply went dead with the tool still open. The re-read has to
// live in `loadEntry` and has to run AFTER `_restoreLayers()`, or it reads the mask of
// the entry the user just left.
test('changing entry re-reads the cut from the new entry mask', () => {
    const viewer = read('js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
    const load = viewer.match(/el\.loadEntry = async \(item, idx\) => \{[\s\S]*?\n {8}\};/);
    assert.ok(load, 'el.loadEntry was not found in MpiCanvasViewer');
    assert.match(load[0], /refreshCompositeHoleFromMask\?\.\(\)/,
        'loadEntry never re-reads the composite cut — Mask Comp goes dead on the next entry '
        + 'and only a rail switch brings it back');

    const iRestore = load[0].indexOf('_restoreLayers');
    const iRefresh = load[0].indexOf('refreshCompositeHoleFromMask');
    assert.ok(iRestore >= 0 && iRefresh > iRestore,
        'the composite re-read runs BEFORE _restoreLayers(), so it would read the mask of the '
        + 'entry the user just left rather than the one now on screen');

    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const body = canvas.match(/ {4}async refreshCompositeHoleFromMask\(\)[\s\S]*?\n {4}\}/);
    assert.ok(body, 'refreshCompositeHoleFromMask not found in MpiCanvas');
    assert.match(body[0], /this\.comp\.followMask/,
        'the re-read is not gated on followMask — Paint Comp would have the brush cut the user '
        + 'just made replaced by the new entry\'s mask');
});

// THE DEFECT THAT SURVIVED THE FIRST BUILD. `holeCanvas` is consumed by ALPHA on the
// canvas (`destination-in`, and `isEmpty()`) but by LUMINANCE on the server. The mask
// export every prompt-tool consumer uses — getURL('black', 'white') — is OPAQUE, so
// feeding it here reads as "cut the whole frame" on screen and "cut only the white
// part" on disk: the preview lies, which is the one thing this card exists to fix.
test('the composite hole is fed an ALPHA mask, not an opaque black-and-white one', () => {
    const canvas = read('js/components/Primitives/MpiCanvas/MpiCanvas.js');
    const body = canvas.match(/ {4}async setCompositeHoleFromMask\(\)[\s\S]*?\n {4}\}/);
    assert.ok(body, 'setCompositeHoleFromMask not found in MpiCanvas');
    assert.match(body[0], /this\.mask\.getURL\(\)/,
        'the entry mask is not read through the no-arg (white-on-transparent) overload');
    assert.ok(!/getURL\(\s*'/.test(body[0]),
        'setCompositeHoleFromMask passes bg/fg to getURL — that overload is OPAQUE, so the '
        + 'canvas would cut everywhere while Sharp cut only the white part');
});

// Only the Brush tool paints. A brushless tool that still armed the brush would
// let a drag paint with no visible brush control — the incoherence MPI-381 removed.
test('only the brush tool mounts the strip with its brush pair', () => {
    const withBrush = ['js/components/Organisms/MpiToolOptionsMaskBrush/MpiToolOptionsMaskBrush.js'];
    const brushless = [
        'js/components/Organisms/MpiToolOptionsMaskDetect/MpiToolOptionsMaskDetect.js',
        'js/components/Organisms/MpiToolOptionsMaskPoints/MpiToolOptionsMaskPoints.js',
        'js/components/Organisms/MpiToolOptionsMaskText/MpiToolOptionsMaskText.js',
        // Shapes is brushless on BOTH mounts (MPI-368) — a drag off the gizmo must
        // pan, not paint.
        'js/components/Organisms/MpiToolOptionsShapes/MpiToolOptionsShapes.js',
    ];
    for (const f of withBrush) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*true/s, `${f} should paint`);
    for (const f of brushless) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*false/s, `${f} must not paint`);
});
