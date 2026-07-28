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

/** Every `mode: 'maskXxx'` the image rail offers. */
const railMaskTools = [...RAIL.matchAll(/mode:\s*'(mask[A-Za-z]+)'/g)].map(m => m[1]);

test('the rail actually offers mask tools', () => {
    assert.ok(railMaskTools.length >= 3, `expected the split mask family, got ${railMaskTools.join(', ')}`);
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

// Only the Brush tool paints. A brushless tool that still armed the brush would
// let a drag paint with no visible brush control — the incoherence MPI-381 removed.
test('only the brush tool mounts the strip with its brush pair', () => {
    const withBrush = ['js/components/Organisms/MpiToolOptionsMaskBrush/MpiToolOptionsMaskBrush.js'];
    const brushless = [
        'js/components/Organisms/MpiToolOptionsMaskDetect/MpiToolOptionsMaskDetect.js',
        'js/components/Organisms/MpiToolOptionsMaskPoints/MpiToolOptionsMaskPoints.js',
    ];
    for (const f of withBrush) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*true/s, `${f} should paint`);
    for (const f of brushless) assert.match(read(f), /MpiMaskStrip\.mount\([\s\S]{0,160}?brush:\s*false/s, `${f} must not paint`);
});
