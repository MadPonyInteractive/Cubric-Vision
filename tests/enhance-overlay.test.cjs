'use strict';

// MPI-677 step 1c — the Enhance overlay.
// Run: node tests/enhance-overlay.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.
//
// Step 1c's own verify mode is `user-ux` — it ends with Fabio looking at it, not
// with a green test — so what is asserted here is deliberately the half a person
// CANNOT see by looking: a parser, a payload shape, and three source contracts
// whose breakage is silent.
//
//  1. **The labelled-blob splitter.** A `separate-field` recipe answers with ONE
//     blob and nothing split it until now, so the whole thing landed in the
//     positive field. A regex that silently stops matching puts it back there
//     with no error, which is exactly how the defect survived the broker era.
//     The recipes' own `examplePrompts` are the fixture — they are the format the
//     system prompt demands, not a shape invented here. That sweep is what found
//     that THE FOUR RECIPES DO NOT AGREE ON A FORMAT: `sdxl` labels both halves,
//     `kling-3.0` writes unlabelled prose then a trailing `Negative Prompt:`, and
//     `pony`/`illustrious` declare the field but emit no negative block at all.
//  2. **The reuse payload.** `sourcePrompt`'s ABSENCE is the signal for "this
//     card was never enhanced", so both branches are asserted; getting it wrong
//     hands a user the enhancement as if they had typed it.
//  3. **Three prompt-box contracts** that fail silently: the submit path uses the
//     approved enhancement, the short prompt is carried for persistence, and an
//     edit re-checks staleness. Source-level, like enhance-control.test.cjs —
//     the box needs a DOM, and a grep that names the line is worth more than no
//     check at all.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { splitLabelledPrompt } = require('../js/services/llmService.js');
const { buildPromptReusePayload } = require('../js/utils/promptReuse.js');
const { RECIPE_REGISTRY } = require('../js/data/recipes/registry.js');

const SRC = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── 1. The splitter ──────────────────────────────────────────────────────────

function testSplitsTheLabelledBlob() {
    const out = splitLabelledPrompt(
        'POSITIVE PROMPT: candid photography, lighthouse, golden hour\n'
        + 'NEGATIVE PROMPT: bad hands 5, big eyes, camera');
    assert.deepStrictEqual(out, {
        positive: 'candid photography, lighthouse, golden hour',
        negative: 'bad hands 5, big eyes, camera',
    });
}

function testEverySeparateFieldExemplarParses() {
    // The exemplars ARE the contract: they are what the system prompt shows the
    // model, so a splitter that cannot read them cannot read the model's reply.
    let checked = 0;
    for (const recipe of RECIPE_REGISTRY) {
        for (const [mode, m] of Object.entries(recipe.modes || {})) {
            if (m.negativeHandling !== 'separate-field') continue;
            for (const ex of (m.examplePrompts || [])) {
                if (!/NEGATIVE PROMPT:/i.test(ex)) continue;
                const out = splitLabelledPrompt(ex);
                assert.ok(out && out.positive,
                    `${recipe.modelId}/${mode}: an examplePrompt carrying a NEGATIVE PROMPT block did not split`);
                assert.ok(!/NEGATIVE PROMPT:/i.test(out.positive),
                    `${recipe.modelId}/${mode}: the negative block leaked into the positive half`);
                checked++;
            }
        }
    }
    // A test that silently checked nothing is the failure this guards: the four
    // separate-field recipes carry exemplars today, and losing them would make
    // the assertion above vacuous rather than red.
    assert.ok(checked >= 3,
        `only ${checked} separate-field examplePrompts were checked — the fixture went missing, not the bug`);
}

function testTheKlingShapeSplitsToo() {
    // FOUND BY THE EXEMPLAR SWEEP ABOVE, not by reading `sdxl`: the four
    // `separate-field` recipes do NOT agree on a format. `kling-3.0` writes
    // unlabelled prose and then a trailing `Negative Prompt:` block — different
    // label, different case, no positive label at all. A splitter written to
    // `sdxl`'s shape reads this as prose and welds the negative into the positive
    // with no error, which is the exact defect the split exists to end.
    const out = splitLabelledPrompt(
        'A narrow ramen stall glows with magenta neon late at night. Static tripod framing.\n'
        + 'Negative Prompt: morphing textures, flickering, extra limbs.');
    assert.ok(out, 'the kling-3.0 shape must split');
    assert.strictEqual(out.negative, 'morphing textures, flickering, extra limbs.');
    assert.ok(out.positive.startsWith('A narrow ramen stall'),
        'an unlabelled positive half is still the positive half');
}

function testProseIsNeverCut() {
    // A prose recipe that happens to say "negative prompt" is not offering a second
    // field. Returning null is what keeps the caller on the raw text.
    assert.strictEqual(splitLabelledPrompt('A lighthouse at dusk, no negative prompt needed.'), null);
    assert.strictEqual(splitLabelledPrompt(''), null);
    assert.strictEqual(splitLabelledPrompt(undefined), null);
}

function testAnEmptyPositiveHalfIsNotASplit() {
    // A truncated reply. Handing the box an empty positive is worse than handing
    // it the blob, so this must fall through to the raw text.
    assert.strictEqual(splitLabelledPrompt('POSITIVE PROMPT:\nNEGATIVE PROMPT: blurry'), null);
}

// ── 2. Reuse carries both texts, and its absence carries the other case ──────

function testReuseRestoresBothTextsOnAnEnhancedCard() {
    const payload = buildPromptReusePayload({
        prompt: 'A weathered stone lighthouse, wide shot, Hasselblad X2D',
        sourcePrompt: 'lighthouse',
        negativePrompt: 'blurry',
        modelId: 'sdxl',
    });
    assert.strictEqual(payload.positive, 'lighthouse',
        'the box gets the short prompt — that is the thing you can iterate on');
    assert.deepStrictEqual(payload.enhanced,
        { positive: 'A weathered stone lighthouse, wide shot, Hasselblad X2D' },
        'the enhancement is restored beside it, not thrown away');
}

function testReuseOfAnUnenhancedCardIsUnchanged() {
    // Every card generated before step 1c has no `sourcePrompt`, and every
    // un-enhanced run still has none. Both must reuse exactly as they always did.
    const payload = buildPromptReusePayload({
        prompt: 'lighthouse at dusk',
        negativePrompt: 'blurry',
        modelId: 'sdxl',
    });
    assert.strictEqual(payload.positive, 'lighthouse at dusk');
    assert.strictEqual(payload.enhanced, null,
        'no sourcePrompt means no enhancement to restore — the control must read un-enhanced');
}

// ── 3. The prompt-box contracts that break silently ──────────────────────────

function testTheApprovedEnhancementIsWhatRuns() {
    const src = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    assert.ok(src.includes('positive:   _enhanced?.positive ?? positiveValue'),
        'the submit path must send the approved enhancement, not the short prompt on screen');
    assert.ok(src.includes('sourcePrompt: _enhanced ? positiveValue : null'),
        'the short prompt must ride along or it cannot be persisted, and Reuse has nothing to restore');
}

function testEveryEditRechecksStaleness() {
    // The box shows the short prompt and submits the enhancement, so an edit to the
    // short prompt orphans it — and the user cannot see that, because the thing that
    // changed is not the thing on screen. The check has to be on the write path.
    const src = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    assert.ok(/_writeMode\(textareaEl\.value\);\s*(\/\/[^\n]*\n\s*)*_syncEnhancedState\(\);/.test(src),
        'the textarea input handler must re-check staleness right after it writes the value');
    assert.ok(src.includes("if (_enhanced && _enhanced.source !== positiveValue) _enhanced = null;"),
        'staleness is the stored SOURCE against the current text — that comparison is the whole mechanism');
}

function testAnEmptyLowerBoxMeansRunMyWordsRaw() {
    const src = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    assert.ok(src.includes('_enhanced = positive ? { source: positiveValue, positive, note: note || null } : null'),
        'clearing the enhanced box on OK must drop the enhancement, not keep the previous one');
}

// ── 4. Provenance survives a reopen ──────────────────────────────────────────
// Found by Fabio's user-ux pass, 2026-09-11: reopening an APPROVED enhancement
// restored the text with a BLANK note. The note is not decoration — it is the
// only surface the fallback warning has ("this model matched no recipe, the
// pinned fallback answered"), and the fallback is DESIGNED to answer, so losing
// the warning loses the only signal that anything was wrong. Four links, each of
// which drops the note silently if it breaks, and none of which a person can see
// by looking at a dialog that otherwise renders correctly.
function testTheNoteIsCarriedOutOfTheDialog() {
    const src = SRC('js/components/Compounds/MpiEnhanceDialog/MpiEnhanceDialog.js');
    assert.ok(/emit\('apply',\s*\{[\s\S]*?note:\s*lastNote/.test(src),
        'apply must carry the note — without it the box has no provenance to store');
    assert.ok(src.includes('lastNote = {'),
        'a successful run must RECORD the note, not only render it');
}

function testTheNoteIsRestoredOnReopen() {
    const src = SRC('js/components/Compounds/MpiEnhanceDialog/MpiEnhanceDialog.js');
    assert.ok(src.includes('let lastNote  = props.enhanced?.note || null;'),
        'the dialog must seed its note from the enhancement it reopens on');
    assert.ok(src.includes('if (lastNote) _note(lastNote.text, lastNote.kind);'),
        'a seeded note must actually be rendered at mount, not merely held');
    const box = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    assert.ok(box.includes('negative: negativeValue, note: _enhanced.note'),
        'the box must pass the stored note back when it reopens the dialog');
}

// A transient failure must NOT overwrite the provenance of the text still in the
// box: a re-run that errors leaves the PREVIOUS enhancement standing, so the
// previous enhancement's note is still the true one. Only the success path and
// the prop seed may assign.
function testAFailedRunDoesNotRewriteProvenance() {
    const src = SRC('js/components/Compounds/MpiEnhanceDialog/MpiEnhanceDialog.js');
    const assignments = src.match(/lastNote\s*=[^=]/g) || [];
    assert.strictEqual(assignments.length, 2,
        `lastNote must be assigned exactly twice (the prop seed and the success path), found ${assignments.length}`);
    assert.ok(src.includes("_note(result.error || 'Enhance failed.', 'warn');"),
        'the failure path must still call _note directly, without recording it as provenance');
}

const tests = [
    testSplitsTheLabelledBlob,
    testEverySeparateFieldExemplarParses,
    testTheKlingShapeSplitsToo,
    testProseIsNeverCut,
    testAnEmptyPositiveHalfIsNotASplit,
    testReuseRestoresBothTextsOnAnEnhancedCard,
    testReuseOfAnUnenhancedCardIsUnchanged,
    testTheApprovedEnhancementIsWhatRuns,
    testEveryEditRechecksStaleness,
    testAnEmptyLowerBoxMeansRunMyWordsRaw,
    testTheNoteIsCarriedOutOfTheDialog,
    testTheNoteIsRestoredOnReopen,
    testAFailedRunDoesNotRewriteProvenance,
];

let failed = 0;
for (const t of tests) {
    try {
        t();
        console.log(`  ok  ${t.name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${t.name}\n    ${err.message}`);
    }
}
console.log(failed
    ? `\n${failed} of ${tests.length} enhance overlay tests FAILED.`
    : `\nAll ${tests.length} enhance overlay tests passed.`);
if (failed) process.exitCode = 1;
