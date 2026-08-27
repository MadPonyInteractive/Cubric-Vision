/**
 * flow-lora-rack.test.cjs — MPI-504.
 *
 * A Flow that declares `settingsModel` fills its `Input_Lora_1..6` nodes from that
 * model's user LoRA rack. The value crosses THREE boundaries to get there, and every
 * one of them drops an unknown key in silence:
 *
 *   flowService  config.loraModelId
 *     → generationService  runCommand({...}) — an explicit WHITELIST
 *       → commandExecutor  _buildParams → params.Lora_N → Input_Lora_N
 *
 * Nothing throws if a link is missing. The flow opens, the panel opens, the LoRAs
 * save, the run succeeds — and the output has no LoRA in it. That is the same shape
 * as the Enhance dead-box this card also fixed: right everywhere the user can see,
 * lost on the one hop nobody watched.
 *
 * These are source assertions because the chain is three browser modules deep and
 * standing them up costs more than it proves — the same call `flow-defer-commit`
 * makes about `deferCommit`. The RENDER half is a real desktop probe instead:
 * tests/desktop/flow-lora-button.spec.js.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('flowService puts the resolved per-phase racks into the config', () => {
    const src = read('js/services/flowService.js');
    // A RESOLVER call, not a raw field read: each slot may be an any-of set, and each
    // rack has to follow whichever member is actually running (MPI-590). Was a single
    // `loraModelId` string until MPI-608 — one string could name only one rack.
    assert.match(
        src,
        /loraPhases:\s*flowLoraPhases\(flow\)/,
        'the flow config must carry loraPhases, or no rack ever leaves the descriptor',
    );
    assert.match(
        src,
        /model:\s*\{ id: null,/,
        'a flow still dispatches as an OPERATION — a rack must not become a model selection',
    );
});

test('the runCommand whitelist forwards loraPhases', () => {
    const src = read('js/services/generationService.js');
    assert.match(
        src,
        /loraPhases:\s*Array\.isArray\(config\.loraPhases\)/,
        'runCommand takes an explicit whitelist; a key not named there never reaches the executor',
    );
});

test('the executor injects a rack ONLY for the phases a flow declared', () => {
    const src = read('js/services/commandExecutor.js');
    // The universal-op branch is shared by every tool in the app. Gating on the DECLARED
    // phases — not on `payload.operation` — is what keeps every other op injecting no
    // LoRAs. It is also what stops `flow_ltx_extend` and `flow_ltx_foley`, which both
    // carry Input_Lora_1..6 nodes and declare no rack, from silently acquiring one.
    assert.match(
        src,
        /for \(const \{ phase, modelId \} of \(payload\.loraPhases \|\| \[\]\)\)/,
        'the flow rack must be gated on the declared phases, never on the operation',
    );
    assert.match(
        src,
        /getModelSettings\(project, modelId\)/,
        'the rack is the MODEL\'s own settings — a flow gets no private copy',
    );
    assert.match(
        src,
        /params\[`Lora_Phase\$\{phase\}_\$\{i \+ 1\}`\] = param/,
        'slots land as Lora_PhaseN_i, which the Input_ pass renames to Input_Lora_PhaseN_i',
    );
    // Phase 1 ALSO emits the flat key. Every graph authored before per-phase racks is
    // titled Input_Lora_1..6 — flow_character_sheet is one — so dropping the flat form
    // would stop filling it, and the failure is a run that succeeds with no LoRA in it.
    assert.match(
        src,
        /if \(phase === 1\) params\[`Lora_\$\{i \+ 1\}`\] = param/,
        'phase 1 must keep emitting the flat Lora_N for graphs that predate the phase titles',
    );
});

test('a staged-LoRA model is skipped loudly, not injected in the wrong shape', () => {
    const src = read('js/services/commandExecutor.js');
    const branch = src.slice(src.indexOf('of (payload.loraPhases || [])'));
    assert.match(
        branch.slice(0, 900),
        /loraStages\?\.length/,
        'a loraStages model needs stage prefixes; injecting flat slots would be silently wrong',
    );
    // `continue`, not `break`: a staged model in phase 2 must skip ITSELF and leave the
    // perfectly good phase-1 rack alone. Anchored to the warn, because the loop already
    // carries an earlier `continue` for a missing id — matching a bare /continue;/ here
    // passes even when this guard has been changed to `break`, which is a test that
    // watches nothing.
    assert.match(
        branch.slice(0, 900),
        /is a staged-LoRA model; skipped \(flat slots only\)`\);\s*continue;/,
        'a skipped phase must skip only itself, never abandon the phases after it',
    );
});

test('BOTH Blocks that own a settings overlay listen for the flow button', () => {
    // The twin trap: each Block mounts its OWN MpiModelSettings, so a listener in
    // only one of them leaves the button dead in the other workspace — and dead
    // exactly the way this card's other bug was dead, with no error anywhere.
    for (const p of [
        'js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js',
        'js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js',
    ]) {
        const src = read(p);
        assert.match(
            src,
            /Events\.on\('ui:open-model-settings'/,
            `${p} mounts a settings overlay, so it must open it for a Flow too`,
        );
        assert.match(src, /_settingsOverlay\.el\.open\(\{ modelId \}\)/, `${p} must open on the named model`);
    }
});

test('the character sheet declares its rack on the SLOT, and its old button is gone', () => {
    const src = read('js/data/flowsRegistry.js');
    const flow = src.slice(src.indexOf("id: 'character-sheet'"));
    assert.match(flow.slice(0, 6000),
        /models: \['krea2', 'krea2-nsfw'\], loras: true/,
        'the rack is declared on the slot, so it follows whichever any-of member runs');
    assert.doesNotMatch(flow.slice(0, 20000), /action: 'settings'/,
        'the last-stage LoRA button is replaced by the per-slot cogwheel (MPI-608)');
});

test('settingsModel is retired everywhere, not just at its declaration', () => {
    // A half-removed vocabulary is worse than either state: a FlowDef that still declares
    // `settingsModel` would read as wired and inject nothing at all.
    for (const p of ['js/data/flowsRegistry.js', 'js/services/flowService.js',
        'js/services/generationService.js', 'js/services/commandExecutor.js',
        'js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js']) {
        const src = read(p);
        assert.doesNotMatch(src, /^\s*settingsModel:/m, `${p} still DECLARES settingsModel`);
        assert.doesNotMatch(src, /flowSettingsModel\(/, `${p} still CALLS flowSettingsModel`);
        assert.doesNotMatch(src, /payload\.loraModelId|config\.loraModelId/,
            `${p} still reads the retired loraModelId`);
    }
});

test('the opt-in survives: a slot without `loras` contributes no rack', () => {
    // flow_ltx_extend and flow_ltx_foley both carry Input_Lora_1..6 nodes and declare NO
    // rack. If the gate ever became "does the graph have the nodes", both would start
    // injecting the user's LTX LoRAs with nothing on screen to say so.
    const src = read('js/data/flowsRegistry.js');
    assert.match(src, /loras: entry\.loras === true/,
        'a slot opts IN explicitly; anything else must resolve to false');
    for (const fid of ['ltx-extend', 'ltx-foley']) {
        const i = src.indexOf(`id: '${fid}'`);
        if (i === -1) continue;
        assert.doesNotMatch(src.slice(i, i + 9000), /loras: true/,
            `${fid} carries Input_Lora nodes it deliberately does not fill`);
    }
});

test('the slide-over gives every rack-bearing slot its OWN cogwheel', () => {
    // Fabio, MPI-608: "each model has its own separate cogwheel that opens its own
    // separate 6 LoRA selector" — so a third model in a future flow needs no new UI.
    const src = read('js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
    assert.match(src, /slot\.loras \? `<div id="flow-detail-loras-\$\{i\}"><\/div>` : ''/,
        'the cogwheel host is rendered per slot, and only for a slot that declared a rack');
    assert.match(src, /Events\.emit\('ui:open-model-settings', \{ modelId: runningId \}\)/,
        'it opens the app\'s OWN panel on the member running in THAT slot');
    // The phase is the slot's position in requiredModels. flowModelChoices FILTERS
    // single-candidate slots out, so its array index is not the phase — carrying the
    // original index is what stops a cogwheel addressing the wrong model.
    const reg = read('js/data/flowsRegistry.js');
    assert.match(reg, /\.map\(\(slot, index\) => \(\{ \.\.\.slot, index \}\)\)/,
        'flowModelChoices must carry the ORIGINAL slot index through the filter');
});

test('the RUN slide carries the same per-slot cogwheels, beside the output (MPI-613)', () => {
    // Fabio, after live-testing MPI-610: "It should be on the final stage, actually. It's
    // where the output is, so if the user decides to test some different LoRAs, he has to
    // go all the way back to the slide over, and that doesn't make much sense."
    //
    // LoRA choice is a COMPARE decision. From the slide-over, changing one costs six
    // navigations with the result and the control at opposite ends of the app.
    const src = read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');

    assert.match(src, /flowLoraPhases\(flow\)/,
        'the frame must render the flow\'s DECLARED racks, not a per-flow hardcode');
    assert.match(src, /slots\[phase - 1\]\?\.label/,
        'each cogwheel keeps its slot label — two reading "LoRAs" cannot be told apart '
        + 'here, where the models are no longer on screen beside them');

    // The trap this placement must NOT inherit: `ui:open-model-settings` is listened for
    // by exactly two components and both are workspace Blocks, so a flow opened from the
    // landing page would emit into nothing at all — no panel, no error, no log. Owning
    // the instance also stops a Block's listener opening a SECOND panel over a flow.
    assert.ok(!/Events\.emit\('ui:open-model-settings'/.test(src),
        'the flow frame must NOT reach the panel through the event — it mounts its own');
    assert.match(src, /_loraSettings = MpiModelSettings\.mount\(/,
        'the frame owns its MpiModelSettings instance');

    // The run slide is rebuilt on every navigation, so without this each visit leaks
    // another set of button instances. Sliced to the function BODY rather than matched
    // within a character budget — a budget silently stops proving anything the moment
    // someone adds a comment above the call.
    const body = (needle) => {
        const at = src.indexOf(needle);
        assert.ok(at !== -1, `${needle} not found — this test is stale`);
        const end = src.indexOf('\n        }', at);
        return src.slice(at, end === -1 ? undefined : end);
    };
    assert.match(body('function _teardownSlide()'), /_destroyLoraBtns\(\)/,
        'slide teardown must destroy the cogwheels');
    assert.match(body('el.destroy = ()'), /_loraSettings\?\.el\?\.destroy\?\.\(\)/,
        'the overlay outlives the slide and must die with the flow');
});

test('opening the LoRA panel does not close the slide-over underneath it', () => {
    // `Overlays.open` pulses `ui:close-all-popups { reason: 'overlay-open' }` on EVERY
    // open, so a panel opened FROM the detail drawer closed the drawer on its way up: the
    // user came back from the LoRA rack to the bare grid and had to find their flow again
    // (Fabio, MPI-608). The drawer is a long-lived panel and must ignore that pulse, which
    // is exactly what MpiOverlay and MpiSlideOver already do.
    const src = read('js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
    assert.match(
        src,
        /Events\.on\('ui:close-all-popups', \(payload\) => \{\s*if \(payload\?\.reason === 'overlay-open'\) return;/,
        'the detail drawer must ignore the overlay-open pulse, or its own cogwheel closes it',
    );
    // Escape and Overlays.reset() fire it BARE, and the drawer must still close on those —
    // a guard that swallowed every pulse would strand the drawer open instead.
    assert.match(src, /if \(payload\?\.reason === 'overlay-open'\) return;\s*_closeDetail\(\);/,
        'a bare pulse (Escape, Overlays.reset) must still close the drawer');
});

// ── Per-phase racks (MPI-567 / MPI-608) ──────────────────────────────────────
// A flow that runs more than one model needs more than one rack. `settingsModel`
// is a single string, so a flow that picks a render model AND an edit model could
// never fill both. Twelve nodes titled `Input_Lora_Phase<N>_<i>`, phase-keyed
// rather than model-keyed so an any-of slot can swap klein-4b for klein-9b without
// the graph being retitled (Fabio, 2026-08-23).
//
// These nodes are the ones a bench re-export drops without anybody noticing, and
// the failure then is a run that succeeds with no LoRA in it — which is why the
// graph half is pinned here and not left to the wiring tests.
//
// MOVED OFF THE SCRIBBLE FLOW 2026-08-25 (MPI-621): Draw It In was rebuilt on ONE
// model with NO rack at all — style rides in the user's own words there, and a
// character LoRA from another family will not load on Klein regardless. The
// character sheet inherited the pin. Its phase 1 is `MpiLoraModel` and not
// `MpiLoraModelClip`: Krea 2 comes off a `UNETLoader`, so there is no CLIP to carry
// through the rack, which is why the old third test in this block is gone.
//
// DOWN TO ONE PHASE 2026-08-27 (MPI-628). Phase 2 was the Klein head-removal pass;
// the head is now subtracted from a BiRefNet matte, so there is no second model and
// no second rack. The walk below still handles N phases — NO SHIPPED FLOW HAS TWO
// ANY MORE, so the day one lands, add its row here rather than rebuilding this.
const PHASES = [
    { n: 1, loader: 'Input_Base_Model', type: 'MpiLoraModel', consumer: '143', input: 'model' },
];

const sheet = () => JSON.parse(read('comfy_workflows/flow_character_sheet.json'));
const idByTitle = (g, title) => Object.keys(g)
    .filter(k => (g[k]._meta || {}).title === title);

test('a two-phase flow carries six LoRA slots for EACH of its model phases', () => {
    const g = sheet();
    for (const { n, type } of PHASES) {
        for (let i = 1; i <= 6; i++) {
            const title = `Input_Lora_Phase${n}_${i}`;
            const ids = idByTitle(g, title);
            assert.equal(ids.length, 1,
                `flow_character_sheet.json must carry exactly one node titled "${title}" — ` +
                'injection matches a title EXACTLY, so a duplicate is never driven');
            assert.equal(g[ids[0]].class_type, type,
                `${title} must be a ${type}: the SDXL chain carries CLIP and the Klein chain ` +
                'does not, and the wrong variant drops one of them silently');
            assert.equal(g[ids[0]].inputs.lora_name, 'None',
                `${title} must bake "None" — a baked LoRA ships a weight nobody asked for`);
        }
    }
});

test('each phase rack is CHAINED into its own model path, loader through to sampler', () => {
    // A titled node that is not in the path is the silent failure this pins. The
    // graph validates, the run succeeds, and the LoRA does nothing at all.
    //
    // Walked BACKWARDS from the consumer rather than forwards in slot order, because
    // slot order is not chain order: the character sheet's phase 1 runs 1 -> 4 -> 2 ->
    // 5 -> 3 -> 6, which is how the bench laid it out and is functionally fine. What
    // must hold is that all six sit in one unbroken path between the loader and the
    // sampler, and a permutation still satisfies that. A rack may also hang off an
    // intermediate the graph bakes for itself (phase 1's filter-bypass LoRA), so the
    // walk stops at the loader rather than demanding slot 1 read it directly.
    const g = sheet();
    for (const { n, loader, consumer, input } of PHASES) {
        const loaderId = idByTitle(g, loader)[0];
        assert.ok(loaderId, `${loader} must exist to feed phase ${n}`);

        const want = new Set();
        for (let i = 1; i <= 6; i++) want.add(`Input_Lora_Phase${n}_${i}`);

        const link = g[consumer].inputs[input];
        assert.ok(Array.isArray(link),
            `node ${consumer}.${input} must be WIRED for phase ${n}, not a baked value`);

        const seen = [];
        let cur = link[0];
        for (let hop = 0; hop < 20 && cur !== loaderId; hop++) {
            const title = (g[cur]._meta || {}).title;
            if (want.delete(title)) seen.push(title);
            const up = g[cur].inputs.model;
            assert.ok(Array.isArray(up),
                `phase ${n}'s model path breaks at node ${cur} (${title}) before reaching ` +
                `${loader} — every slot downstream of a break is orphaned`);
            cur = up[0];
        }

        assert.equal(cur, loaderId,
            `phase ${n}'s model path must run back to ${loader}, not stop at node ${cur}`);
        assert.equal(want.size, 0,
            `these phase ${n} slots are NOT in the model path and do nothing: ` +
            `${[...want].join(', ')} (found ${seen.length} of 6)`);
    }
});

// DELETED 2026-08-25 (MPI-621): 'phase 1 carries CLIP through its rack as well as
// MODEL' pinned `MpiLoraModelClip` on the scribble flow's SDXL render phase, so that
// a style LoRA's trigger words were tokenised by a PATCHED encoder. That phase no
// longer exists — Draw It In is one Klein pass with no rack — and the flow that
// inherited the pin runs Krea 2 off a `UNETLoader`, which carries no CLIP through the
// rack at all. Restore it the day a flow puts a CLIP-carrying rack back on a phase.
