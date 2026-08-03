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

/** Every `mode: 'maskXxx'` the image rail offers. Since MPI-425 some of these are
 *  nested inside a collapse entry's `sub: []` rather than sitting directly in the
 *  group — the key stays `mode:`, so a collapsed method is still caught here. That
 *  is the point: presentation moved, the registration duty did not. */
const railMaskTools = [...RAIL.matchAll(/mode:\s*'(mask[A-Za-z]+)'/g)].map(m => m[1]);

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
const railPaintTools = [...RAIL.matchAll(/mode:\s*'(paint[A-Za-z]*)'/g)].map(m => m[1]);

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

// Only the Brush tool paints. A brushless tool that still armed the brush would
// let a drag paint with no visible brush control — the incoherence MPI-381 removed.
test('only the brush tool mounts the strip with its brush pair', () => {
    const withBrush = ['js/components/Organisms/MpiToolOptionsMaskBrush/MpiToolOptionsMaskBrush.js'];
    const brushless = [
        'js/components/Organisms/MpiToolOptionsMaskDetect/MpiToolOptionsMaskDetect.js',
        'js/components/Organisms/MpiToolOptionsMaskPoints/MpiToolOptionsMaskPoints.js',
        'js/components/Organisms/MpiToolOptionsMaskText/MpiToolOptionsMaskText.js',
    ];
    for (const f of withBrush) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*true/s, `${f} should paint`);
    for (const f of brushless) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*false/s, `${f} must not paint`);
});
