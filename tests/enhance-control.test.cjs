'use strict';

// MPI-677 step 1b — the enhance CONTROL.
// Run: node tests/enhance-control.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.
//
// Step 1a proved the service. This proves the four claims the control makes, each of
// which fails silently rather than loudly if it breaks:
//
//  1. **The operation gate.** An edit takes an instruction, not a scene description, so
//     the control is ABSENT on those ops. A new edit op that forgets the exemption gets
//     a control that damages prompts and nothing complains.
//  2. **The in-workflow enhancer is off.** Two halves — nothing offers the toggle and
//     every graph bakes false — asserted in `output-prompt-capture.test.cjs`, which owns
//     the workflow-JSON reads. Here we hold the wiring end: the box calls the local
//     service and no longer imports the broker.
//  3. **One dispatch to the enhancer graph.** The flows had their own near-copy of it.
//     Two copies of "the seed is spread last" is how one of them ends up not being.
//  4. **The broker path is gone from the control.** Step 2 deletes the surface itself;
//     this asserts the button no longer depends on it, which is what unblocks that.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { COMMANDS, ENHANCE_EXEMPT_OPS, opAllowsEnhance } = require('../js/data/commandRegistry.js');

const SRC = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── 1. The operation gate ────────────────────────────────────────────────────

function testEditAndInpaintGetNoEnhancement() {
    for (const op of ['edit', 'kleinEdit', 'krea2Edit', 'qwenEdit', 'inpaint']) {
        assert.ok(COMMANDS[op], `${op} is no longer a registered op — fix the exempt set, not this test`);
        assert.strictEqual(opAllowsEnhance(op), false, `${op} must get NO enhancement at all`);
    }
}

function testGenerativeOpsStillEnhance() {
    // `control` is the one that looks exempt and is not: the reference constrains
    // structure, so the prompt still carries the creative load. That is exactly why
    // Qwen Image Edit is not wholly exempt — the exemption is per OPERATION, never
    // per model.
    for (const op of ['t2i', 'i2i', 'control', 'detail', 'upscale', 't2v', 'i2v']) {
        assert.ok(COMMANDS[op], `${op} is no longer a registered op`);
        assert.strictEqual(opAllowsEnhance(op), true, `${op} must still offer enhancement`);
    }
}

function testEveryEditShapedOpIsExempt() {
    // The set is hand-written, so this is the thing that catches the NEXT edit op:
    // a key that reads as an edit and is not exempt is a control that damages prompts.
    for (const key of Object.keys(COMMANDS)) {
        if (!/edit|inpaint/i.test(key)) continue;
        assert.ok(ENHANCE_EXEMPT_OPS.has(key),
            `${key} looks like an edit op but is not in ENHANCE_EXEMPT_OPS — an edit takes an instruction, not a scene description`);
    }
}

// ── 2. The control is wired to the local service ─────────────────────────────

function testPromptBoxCallsTheLocalServiceAndNotTheBroker() {
    const src = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    assert.ok(src.includes("from '../../../services/llmService.js'"),
        'the prompt box must import the local enhance service');
    assert.ok(!src.includes('connectorOps'),
        'the prompt box must not reach the broker — step 2 deletes that surface entirely');
    assert.ok(!src.includes('checkPromptEnhanceAvailable'),
        'no capability probe: there is no sibling app for the button to be conditional on');
    assert.ok(src.includes('opAllowsEnhance(activeOperation)'),
        'the control must be gated on the OPERATION, which Vision knows locally');
}

function testTheControlHasNoPerModelBranch() {
    // The whole point of one path: `krea2` and `chroma` take the identical code. If a
    // capability or a model id ever reappears in the control block, the branch is back.
    const src = SRC('js/components/Organisms/MpiPromptBox/MpiPromptBox.js');
    const start = src.indexOf('// ── Enhance (MPI-677 step 1b)');
    const end = src.indexOf('// ── Run / Stop ─', start);
    assert.ok(start > 0 && end > start, 'could not find the enhance control block');
    const block = src.slice(start, end);
    for (const pattern of [/capabilities/, /model\?\.id\s*===/, /'krea2'/, /'chroma'/]) {
        assert.ok(!pattern.test(block),
            `the enhance control branches on the model (${pattern}) — it must not`);
    }
}

// ── 3. One dispatch to the enhancer graph ────────────────────────────────────

function testOnlyLlmServiceDispatchesTheEnhancerOp() {
    const flow = SRC('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
    assert.ok(flow.includes('runComfyEnhance('),
        'MpiBaseFlow must route its enhance through the shared dispatch');
    assert.ok(!/operation:\s*d\.op/.test(flow),
        'MpiBaseFlow still dispatches the enhancer itself — that is the second copy this step removed');

    const registry = SRC('js/data/flowsRegistry.js');
    assert.ok(!registry.includes("op: 'promptEnhance'"),
        'a flow declaration still names the enhancer operation — the op name belongs to the dispatch now');

    const service = SRC('js/services/llmService.js');
    assert.ok(service.includes("export const COMFY_ENHANCE_OP = 'promptEnhance';"),
        'the op name must be declared once, in the service that dispatches it');
    assert.ok(COMMANDS.promptEnhance, 'the promptEnhance op must stay registered — the dispatch guards on it');
}

function testTheSeedIsUnreachableByACaller() {
    // `Input_Seed` is driven, never a user field: a fixed seed returns the same phrase
    // on every press and the loop is Enhance → edit → Enhance. It is spread LAST so a
    // caller's own injectionParams cannot reach it. Order is the whole guarantee.
    const service = SRC('js/services/llmService.js');
    const spread = service.indexOf('...(injectionParams || {}),');
    const seed = service.indexOf('Input_Seed: Math.floor');
    assert.ok(spread > 0 && seed > spread,
        'Input_Seed must be spread AFTER the caller params, or a caller can pin the seed');
}

const tests = [
    testEditAndInpaintGetNoEnhancement,
    testGenerativeOpsStillEnhance,
    testEveryEditShapedOpIsExempt,
    testPromptBoxCallsTheLocalServiceAndNotTheBroker,
    testTheControlHasNoPerModelBranch,
    testOnlyLlmServiceDispatchesTheEnhancerOp,
    testTheSeedIsUnreachableByACaller,
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
    ? `\n${failed} of ${tests.length} enhance control tests FAILED.`
    : `\nAll ${tests.length} enhance control tests passed.`);
if (failed) process.exitCode = 1;
