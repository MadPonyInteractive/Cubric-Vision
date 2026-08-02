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
