// `commandRegistry.commands[op].injectParams` names workflow nodes BY TITLE. The
// injector matches titles case-insensitively and SILENTLY SKIPS any param with no
// matching node — no error, no log, no toast. A typo or a prefix slip therefore
// produces a dead control that looks like it works.
//
// This is not hypothetical. MPI-242 shipped a batch node titled `Input_Batch` while
// the injector emitted `Input_Batch_Size`; batch N rendered 1 image, silently, in
// BOTH Krea2 and Chroma. The same class of bug ate `Input_Is_i2i`, which no code
// ever set, so Krea2's i2i ran as t2i.
//
// This guard asserts every injectParams title exists in every workflow the declaring
// op can actually run.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'js/data/modelConstants/models.js');
const COMMANDS = path.join(ROOT, 'js/data/commandRegistry.js');
const WORKFLOWS = path.join(ROOT, 'comfy_workflows');

/** `op: { ... injectParams: { Title: value, ... } ... }` → Map<op, string[]>. */
function injectParamsByOp(src) {
    const out = new Map();
    const re = /^\s{4}(\w+):\s*\{$/gm;
    const starts = [...src.matchAll(re)].map(m => ({ id: m[1], at: m.index }));
    for (let i = 0; i < starts.length; i++) {
        const body = src.slice(starts[i].at, starts[i + 1]?.at ?? src.length);
        const m = body.match(/injectParams:\s*\{([^}]*)\}/);
        if (m) out.set(starts[i].id, [...m[1].matchAll(/(\w+)\s*:/g)].map(x => x[1]));
    }
    return out;
}

/**
 * Every ModelDef as `{ workflows: Map<op,file>, opInject: Map<op,string[]> }`.
 *
 * Per-MODEL, not flattened by op, because the two injection sources are mutually
 * exclusive: a model declaring `opInject` for an op REPLACES that op's `injectParams`
 * (commandExecutor._buildParams), so the op's titles must not be demanded of its graph.
 */
function modelDefs(src) {
    // CRLF-tolerant: models.js is checked out with CRLF on Windows.
    return src.split(/\r?\n {4}\{\r?\n/).slice(1).map((body) => {
        const grab = (key) => {
            const m = body.match(new RegExp(`${key}:\\s*\\{([\\s\\S]*?)\\n\\s{8}\\}`));
            return m ? m[1] : '';
        };
        const workflows = new Map(
            [...grab('workflows').matchAll(/(\w+):\s*'([^']+\.json)'/g)].map(m => [m[1], m[2]]));
        const opInject = new Map(
            [...grab('opInject').matchAll(/(\w+):\s*\{([^}]*)\}/g)]
                .map(m => [m[1], [...m[2].matchAll(/(\w+)\s*:/g)].map(x => x[1])]));
        // `capabilities` is one flat object, often on a single line — grab() wants a
        // multi-line block, so match it directly. Needed by the mediaInputs sweep, which
        // has to reproduce filterMediaInputsForModel's gating to avoid demanding a
        // capability-gated slot of a model that never sees it.
        const capsBody = (body.match(/capabilities:\s*\{([^}]*)\}/) || [])[1] || '';
        const capabilities = Object.fromEntries(
            [...capsBody.matchAll(/(\w+):\s*(true|false)/g)].map(m => [m[1], m[2] === 'true']));
        return { id: (body.match(/id:\s*'([^']+)'/) || [])[1], workflows, opInject, capabilities };
    }).filter(m => m.id && m.workflows.size);
}

/** `op: { ... mediaInputs: [ {...}, ... ] ... }` → Map<op, slot[]>. */
function mediaInputsByOp(src) {
    const out = new Map();
    const starts = [...src.matchAll(/^\s{4}(\w+):\s*\{$/gm)].map(m => ({ id: m[1], at: m.index }));
    for (let i = 0; i < starts.length; i++) {
        const body = src.slice(starts[i].at, starts[i + 1]?.at ?? src.length);
        const block = body.match(/mediaInputs:\s*\[([\s\S]*?)\n\s{8}\]/);
        if (!block) continue;
        // Comments inside the array are prose, and prose contains apostrophes and the
        // odd brace — strip them before the entry regex sees them.
        const clean = block[1].replace(/\/\/[^\n]*/g, '');
        const slots = [...clean.matchAll(/\{([\s\S]*?)\}/g)].map(m => m[1]).map(entry => ({
            title: (entry.match(/title:\s*'([^']+)'/) || [])[1],
            mediaType: /mediaType:\s*'audio'/.test(entry) ? 'audio'
                : /MEDIA_TYPE\.VIDEO/.test(entry) ? 'video' : 'image',
            requiresCapability: (entry.match(/requiresCapability:\s*'([^']+)'/) || [])[1] || null,
        })).filter(s => s.title);
        if (slots.length) out.set(starts[i].id, slots);
    }
    return out;
}

/**
 * op → workflow files that still take the OP's injectParams, i.e. skipping any model
 * that overrides the op with its own `opInject`.
 */
function workflowsByOp(src) {
    const out = new Map();
    for (const m of modelDefs(src)) {
        for (const [op, file] of m.workflows) {
            if (m.opInject.has(op)) continue;   // model owns this op's injection
            if (!out.has(op)) out.set(op, new Set());
            out.get(op).add(file);
        }
    }
    return out;
}

/** Lowercased `_meta.title` of every node in an API-shape workflow. */
function titlesOf(file) {
    const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    return new Set(Object.values(wf).map(n => (n?._meta?.title || '').toLowerCase()).filter(Boolean));
}

test('every injectParams title exists in the workflows its op runs', () => {
    const declared = injectParamsByOp(fs.readFileSync(COMMANDS, 'utf8'));
    const wfByOp = workflowsByOp(fs.readFileSync(REGISTRY, 'utf8'));

    // MPI-365 emptied this set: every image model became a one-master-template model, so
    // every op's branch is picked by `opInject` and the last `injectParams` (`i2i`'s
    // `Input_Is_i2i`) lost its node. Zero is therefore a legitimate state — but "zero"
    // and "the regex stopped matching" look identical from here, which is exactly the
    // silent-skip class this file exists to catch. So compare against the raw count of
    // `injectParams:` occurrences in the source instead of asserting a non-empty parse.
    const rawCount = (fs.readFileSync(COMMANDS, 'utf8').match(/^\s+injectParams:/gm) || []).length;
    assert.strictEqual(declared.size, rawCount,
        `parsed ${declared.size} injectParams but the source declares ${rawCount} — the regex has drifted`);

    const problems = [];
    for (const [op, titles] of declared) {
        const files = wfByOp.get(op);
        assert.ok(files?.size, `op "${op}" declares injectParams but no model maps it to a workflow`);
        for (const file of files) {
            const have = titlesOf(file);
            for (const title of titles) {
                if (!have.has(title.toLowerCase())) {
                    problems.push(`${op} → ${file}: no node titled "${title}"`);
                }
            }
        }
    }

    assert.deepStrictEqual(
        problems, [],
        'injectParams names a node title that does not exist. The injector silently skips '
        + 'unmatched titles, so this ships as a dead control with no error:\n  '
        + problems.join('\n  '),
    );
});

// The same guard for the per-MODEL form (ModelDef.opInject, MPI-354). It carries the
// identical failure mode — an unmatched title is silently skipped — plus a worse one
// unique to a one-master-template model: a MISSING op entry does not inject the branch
// selector at all, so the graph runs its default branch and returns a plausible image
// from the WRONG operation. Both are invisible at runtime, so they are pinned here.
test('every opInject title exists, and covers every op the model runs (MPI-354)', () => {
    const defs = modelDefs(fs.readFileSync(REGISTRY, 'utf8')).filter(m => m.opInject.size);
    assert.ok(defs.length > 0, 'parsed zero opInject models — the regex has drifted');

    const problems = [];
    for (const m of defs) {
        for (const [op, file] of m.workflows) {
            if (!m.opInject.has(op)) {
                problems.push(`${m.id}: op "${op}" has a workflow but no opInject entry `
                    + '— it would run the graph\'s DEFAULT branch');
            }
        }
        for (const [op, titles] of m.opInject) {
            const file = m.workflows.get(op);
            if (!file) {
                problems.push(`${m.id}: opInject declares "${op}" but no workflow maps it`);
                continue;
            }
            const have = titlesOf(file);
            for (const title of titles) {
                if (!have.has(title.toLowerCase())) {
                    problems.push(`${m.id}: ${op} → ${file}: no node titled "${title}"`);
                }
            }
        }
    }

    assert.deepStrictEqual(problems, [], 'opInject is incoherent:\n  ' + problems.join('\n  '));
});

test('the LTX extend Flow carries its I/O titles AND its declared control node (MPI-520)', () => {
    // flowLtxExtend runs flow_ltx_extend.json with model:{id:null} on the installed LTX
    // 2.3 checkpoint. Two silent-skip classes in one test: the media/prompt/seed titles
    // the injector always writes, and `input_duration` — the first DECLARED control
    // (MPI-531) addressed straight at a graph node. A control whose node is missing is
    // worse than a missing slot: the slider moves, the run succeeds, and the duration
    // the user chose is silently the graph's baked default.
    const file = 'flow_ltx_extend.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_negative', 'input_seed',
        'input_video', 'input_duration',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_video'), `${file} must carry a capture node titled "output_video"`);
});

test('the H3 arm of the extend Flow carries its titles, and NO negative (MPI-591)', () => {
    // Extend Video is the first Flow whose picked model selects a different GRAPH, so
    // this file has to answer the same titles `flow_ltx_extend.json` does — the run is
    // the same op with the same collected fields, only the workflow swaps.
    //
    // `input_negative` is deliberately ABSENT and that absence is the assertion. H3
    // takes no negative conditioning (`models.js` minimax-h3: `negativePrompt: false`
    // — one Qwen3-VL encode, no second pass), so a node carrying that title would be a
    // node nothing reads. The field hides on the H3 arm rather than feeding a dead
    // node; leaving it visible AND unwired is MPI-475 exactly — a stop the user typed
    // that never reached the model, with nothing saying so.
    const file = 'flow_h3_extend.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_seed', 'input_video', 'input_duration',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_video'), `${file} must carry a capture node titled "output_video"`);
    assert.ok(!have.has('input_negative'),
        `${file} must NOT carry "input_negative" — H3 has no negative conditioning`);
});

test('the LTX foley Flow carries its I/O titles (MPI-536)', () => {
    // flowLtxFoley declares NO injection-param field — its two prompt fields are the
    // top-level positive/negative that submitFlowGeneration writes — so the pinned set
    // is the media/prompt/seed titles the injector always writes plus the capture.
    // (Those two live on the `preview` STEP since MPI-531, not on the run slide.)
    // `input_audio` is deliberately absent from this list: that node belongs to the
    // unshipped voice mode and the op declares no audio slot, so nothing addresses it.
    const file = 'flow_ltx_foley.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_negative', 'input_seed', 'input_video',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_video'), `${file} must carry a capture node titled "output_video"`);
});

test('the LTX upscale Flow + plugin carry their I/O and control titles (MPI-579/MPI-584)', () => {
    // ONE graph, TWO surfaces: the History Upscale dropdown entry (the plugin, MPI-579)
    // and the `ltx-upscale` Flow (MPI-584). Both address the SAME titles, so one missing
    // node breaks both at once — and breaks them silently: `input_prompt_strength` and
    // `input_denoise` are DECLARED controls, so a missing node means the slider moves,
    // the run succeeds, and the value the user chose is the graph's baked default.
    //
    // `input_denoise` is the exception and is deliberately NOT in this list: no node
    // carries that title. It is consumed by ltxSigmasInjector (LTX_SIGMAS_CONSUMES),
    // which turns it into `input_sigmas`' schedule string — so `input_sigmas` is what
    // has to exist, and the injector throws by itself when it does not.
    const file = 'ltx_video_upscale.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_seed', 'input_video',
        'input_sigmas', 'input_prompt_strength',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_video'), `${file} must carry a capture node titled "output_video"`);
});

test('the Character Sheet Flow carries its I/O and declared control titles (MPI-504)', () => {
    // flowCharacterSheet runs flow_character_sheet.json with model:{id:null} on the
    // installed krea2 + klein-4b weights. It declares NO media at all, so the pinned
    // set is the prompt/seed titles the injector always writes plus FOUR declared
    // controls — and a declared control whose node is missing is the worst silent skip
    // there is: the dropdown opens, the toggle flips, the run succeeds, and what the
    // user chose is the graph's baked default.
    //
    // `input_quality` is the one that cannot be caught any other way: it selects TWO
    // MpiAnySwitch banks rather than driving a widget, so losing it does not break the
    // graph — it silently pins the sheet at the 1k arm whatever the user picked.
    //
    // `input_positive` is pinned twice over: it is both the injector's always-written
    // prompt title AND the `to` of the flow's enhance pair, so the enhanced phrase and
    // the raw fallback land on the same node.
    //
    // `input_edit_model` / `input_edit_clip` WERE the blend slot (MPI-610) — the Klein edit
    // that removed the head. MPI-628 replaced that pass with a mask subtraction, so both
    // titles are pinned as ABSENT below: a surviving one would take injections the
    // descriptor no longer declares, and injection skips a miss in silence either way.
    const file = 'flow_character_sheet.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_negative', 'input_seed',
        'input_recipe', 'input_quality', 'input_is_turbo', 'input_remove_head',
        'input_base_model',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    for (const title of ['input_edit_model', 'input_edit_clip']) {
        assert.ok(!have.has(title),
            `${file} still carries "${title}" — the Klein blend pass went in MPI-628`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // ONE LoRA rack, phase-titled (MPI-610). The flat `Input_Lora_N` form must be GONE:
    // commandExecutor still emits `Lora_N` beside `Lora_Phase1_N` for graphs that predate
    // the phase titles, so a graph carrying both takes the phase-1 rack twice over. The
    // phase-2 titles are pinned absent for the same reason as the loaders above.
    for (let i = 1; i <= 6; i += 1) {
        assert.ok(have.has(`input_lora_phase1_${i}`), `${file} is missing Input_Lora_Phase1_${i}`);
        assert.ok(!have.has(`input_lora_phase2_${i}`),
            `${file} still carries Input_Lora_Phase2_${i} — its slot went in MPI-628`);
        assert.ok(!have.has(`input_lora_${i}`),
            `${file} still carries the flat Input_Lora_${i} — phase 1 would be injected twice`);
    }
});

test('the Outpaint Flow carries its I/O and declared control titles (MPI-594)', () => {
    // flowOutpaint runs flow_outpaint.json on krea2 with model:{id:null}. Its ONE
    // media slot is `image1` -> `input_image`, and the image it loads is already
    // padded by the app, so there is no box, mask or fill title to pin — the crop
    // step binds through STEP_MEDIA, not injection.
    //
    // `input_is_turbo` is the declared control, and the silent-skip case: the toggle
    // flips, the run succeeds, and the accelerator LoRA branch stays on the graph's
    // baked value whatever the user chose.
    //
    // `input_base_model` + `input_bypass_filter_lora` are the any-of arms (both Krea 2
    // cards run this flow). The UNETLoader was UNTITLED as authored — lose the title
    // again and the model picker changes the badge while krea2 SFW keeps loading.
    const file = 'flow_outpaint.json';
    const have = titlesOf(file);
    for (const title of [
        'input_image', 'input_seed', 'input_is_turbo',
        'input_base_model', 'input_bypass_filter_lora',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // …and the ABSENCE of one title is load-bearing here (MPI-594, caught in a live run).
    // The outpaint instruction is BAKED and the flow declares no prompt, so `_buildParams`
    // sends `Input_Positive: ''` on every run — which the injector happily writes, wiping
    // the instruction. Head Swap has the same shape and solves it the same way: a
    // fixed-prompt graph does not TITLE its prompt node. Do not "fix" this by re-adding
    // the title; the empty string that clobbers it is deliberate everywhere else (nearly
    // every graph carries a leftover authoring prompt that must be overwritten).
    assert.ok(!have.has('input_positive'),
        `${file}'s prompt is baked — titling it Input_Positive lets the run inject '' over it`);
});

test('the Draw It In Flow carries its I/O, its model arm and its box (MPI-567)', () => {
    // flowScribObj runs flow_draw_it_in.json on model:{id:null}. Every injection point
    // here fails SILENTLY: the injector skips a title with no node, so a typo is a
    // control that moves, a run that succeeds, and a graph still on its baked value.
    //
    // MPI-621 rebuilt the graph on one Klein 9B edit, which DELETED four of these
    // titles — `input_base_model` (the SDXL render slot) and the two ControlNet fields
    // `input_control_net` / `input_control_strength` went with the render phase, and
    // `input_negative` with them. The list below is deliberately the whole surface, so
    // adding a title back means adding it here too.
    const file = 'flow_draw_it_in.json';
    const have = titlesOf(file);
    for (const title of [
        // Two images, and only the first is the user's: `input_paint` is the paint
        // step's derived layer arriving through `mediaRole: 'image2'`. Lose that title
        // and the drawing never reaches the graph — the composite is then the bare
        // photo, and Klein edits a scene with nothing drawn on it, which still produces
        // a picture.
        'input_image', 'input_paint',
        // The box step's target: the region that may change, and the only region
        // stitched back. It goes through the `headSwap` injector because an MpiBox
        // carries four widgets the generic title injector would match and silently not
        // write.
        'input_box',
        'input_seed',
        // The one model slot, and BOTH nodes swap together. The CLIPLoader was untitled
        // as authored — without `input_edit_clip` a 9B pick keeps 4B's text encoder and
        // dies with a shape error that reads as a sampler bug (MPI-600).
        'input_edit_model', 'input_edit_clip',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // The deleted render phase must not leave titled stumps behind. A node still titled
    // `input_base_model` would be a checkpoint loader nothing feeds and nothing reads —
    // and the model picker would have no slot pointing at it.
    for (const gone of ['input_base_model', 'input_control_net', 'input_control_strength']) {
        assert.ok(!have.has(gone),
            `${file} still carries "${gone}" — the SDXL render phase it belonged to is deleted`);
    }

    // THE GRADE MATCH IS LOAD-BEARING, and it fails silently if it is dropped: the run
    // still succeeds and the seam simply comes back. Found live 2026-08-25 on a VINTAGE
    // plate — Klein renders the crop in its own clean modern look, so the patch returned
    // de-faded and more contrasty (mean +9.5/+5.5/+2.6 RGB, top-edge luma step 3.60 where
    // the photo's own step across that line was 0.39). A feather cannot hide a whole-patch
    // shift, and a bigger box did not help either. So the stitch must read from the
    // ColorMatch, never straight from the decode.
    const graph = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const [matchId, match] = Object.entries(graph)
        .find(([, n]) => n?._meta?.title === 'Match The Photo Grade') || [];
    assert.ok(match && match.class_type === 'ColorMatch',
        `${file} must carry a ColorMatch titled "Match The Photo Grade"`);
    const [, stitch] = Object.entries(graph)
        .find(([, n]) => n?.class_type === 'InpaintStitchImproved');
    assert.deepEqual(stitch.inputs.inpainted_image, [matchId, 0],
        'the stitch must take the GRADE-MATCHED patch, or the vintage-plate seam returns');
    assert.ok(Array.isArray(match.inputs.image_ref), 'ColorMatch image_ref must be wired');
    assert.equal(match.inputs.image_ref[0], stitch.inputs.stitcher[0],
        'image_ref must be the ORIGINAL crop from the same InpaintCropImproved the stitch uses');

    // …and unlike Outpaint and Head Swap, this flow's prompt title is REQUIRED.
    // The two of them bake their instruction and deliberately leave the node untitled so
    // the run's empty `Input_Positive` cannot clobber it. This flow is the opposite: the
    // user's words ARE the subject, and the prompt node feeds a StringConcatenate that
    // wraps it in the edit instruction before the encoder. Shipping without it is what
    // produced a blob rendered into something nobody asked for on the first live run
    // (2026-08-23) — the drawing gives a silhouette, and a silhouette is not a subject.
    assert.ok(have.has('input_positive'),
        `${file} takes a user prompt, so its prompt node MUST stay titled Input_Positive`);
});

test('the Scribble Flow carries its I/O, its Klein slot and its LoRA rack (MPI-620)', () => {
    // flowScribble runs flow_scribble.json on model:{id:null}. Same silent-failure class
    // as every other flow here: the injector skips a title with no node, so a missing one
    // is a control that moves in the UI, a run that succeeds, and a graph still sitting on
    // its baked value.
    //
    // THE GRAPH IS AN EDIT-MODEL GRAPH, not SDXL + ControlNet. The flow shipped on
    // Klein after a live side-by-side: both ControlNet arms are monochrome LINE
    // DETECTORS that discard colour, so a blue fill contributed an outline
    // indistinguishable from a red terrain stroke and the sea landed on the wrong side.
    // Klein reads actual RGB. That is why every ControlNet assertion this test used to
    // hold is gone rather than relaxed.
    const file = 'flow_scribble.json';
    const have = titlesOf(file);
    for (const title of [
        // The ONE image input. The paint step composites onto it (or onto flat white when
        // the user uploaded nothing) and REPLACES it — there is no `input_paint` twin the
        // way Draw It In has one, because that flow needs the photo and the drawing as
        // two separate inputs and this graph reads a single opaque picture.
        'input_image',
        'input_seed',
        // The user's words ARE the subject. The drawing carries shape, placement and
        // colour; without this the model has no idea what the silhouette is meant to be.
        'input_positive',
        // The choosable model slot — BOTH tiers run this one graph and `modelParams`
        // swaps them through these two titles. The clip half is not optional trim: 9B
        // needs qwen_3_8b_int8_convrot and 4B needs qwen_3_4b, and crossing them dies
        // with a shape error that reads as a sampler bug and is not one (MPI-600).
        'input_edit_model',
        'input_edit_clip',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // THE NEGATIVE IS BAKED, SO IT MUST NOT BE TITLED. `_buildParams` emits
    // `Input_Negative: negative || ''` on EVERY universal run whatever the flow declares,
    // and this flow declares no negative field — so a node titled `Input_Negative` would
    // have its baked string overwritten with '' on every single run. That is not
    // hypothetical: Draw It In shipped exactly this bug, and every render it ever made ran
    // with an empty negative because nothing failed and nothing logged.
    assert.ok(!have.has('input_negative'),
        `${file}'s negative is baked — titling it Input_Negative lets the run inject '' over it`);

    const graph = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));

    // THE FULL SIX-SLOT RACK, PHASE-TITLED. `_buildParams` emits `Lora_Phase<N>_<i>` per
    // declared phase plus — phase 1 only — the flat compatibility key `Lora_<i>`, so a
    // graph carrying BOTH forms takes the same rack twice. Pinning the phase form here is
    // what stops a re-export reintroducing the flat one.
    const rack = Object.values(graph)
        .filter(n => /^Input_Lora_Phase1_\d$/.test(n?._meta?.title || ''))
        .map(n => n._meta.title)
        .sort();
    assert.deepEqual(rack, [1, 2, 3, 4, 5, 6].map(i => `Input_Lora_Phase1_${i}`),
        `${file} declares loras:true on its slot, so it must carry all six phase-titled slots`);
    assert.ok(!Object.values(graph).some(n => /^Input_Lora_\d$/.test(n?._meta?.title || '')),
        `${file} must not ALSO carry the flat Input_Lora_N form — both means the rack applies twice`);

    // THE RACK IS A CHAIN, AND A BREAK IN IT IS SILENT. Each MpiLoraModel takes the
    // previous one's MODEL output; if one is wired straight off the loader instead, the
    // LoRAs before it are simply dropped from the run with no error. Walk it: exactly one
    // slot feeds off Input_Edit_Model and each of the others feeds off another slot.
    const [unetId] = Object.entries(graph)
        .find(([, n]) => n?._meta?.title === 'Input_Edit_Model') || [];
    const rackIds = Object.entries(graph)
        .filter(([, n]) => /^Input_Lora_Phase1_\d$/.test(n?._meta?.title || ''))
        .map(([id]) => id);
    const feeds = rackIds.map(id => graph[id].inputs.model[0]);
    assert.equal(feeds.filter(f => f === unetId).length, 1,
        'exactly one rack slot may read the loader directly — the rest chain off each other');
    assert.equal(new Set(feeds).size, feeds.length,
        'two rack slots read the same source — one branch of the rack is dropped silently');

    // NO CONTROLNET APPARATUS SURVIVES. The flow moved to edit models, so a preprocessor
    // or a strength remap reappearing here means a re-export pulled from the wrong source
    // graph — and it would re-introduce the exact failure the pivot was made to escape.
    for (const cls of ['AIO_Preprocessor', 'ControlNetApplyAdvanced', 'MpiNormalizeValue']) {
        assert.ok(!Object.values(graph).some(n => n?.class_type === cls),
            `${file} is an edit-model graph — a ${cls} here means it was rebuilt from the SDXL source`);
    }
    for (const gone of ['input_control_net', 'input_control_strength', 'input_base_model']) {
        assert.ok(!have.has(gone),
            `${file} dropped the ControlNet half — "${gone}" is a title from the retired SDXL graph`);
    }

    // SIZING IS DERIVED, NOT INJECTED. There is no Input_Width/Input_Height here on
    // purpose: the drawing's own dimensions become the output's, so the sampler reads
    // GetImageSize off the scaled input. A re-export that hardcodes the size instead
    // would quietly pin every render to one shape while the canvas-size field kept working.
    for (const gone of ['input_width', 'input_height']) {
        assert.ok(!have.has(gone),
            `${file} derives its size from the drawing — "${gone}" would fight GetImageSize`);
    }
    const [sizeId] = Object.entries(graph)
        .find(([, n]) => n?.class_type === 'GetImageSize') || [];
    assert.ok(sizeId, `${file} must carry a GetImageSize to derive the render size`);
    const sched = Object.values(graph).find(n => n?.class_type === 'Flux2Scheduler');
    assert.deepEqual([sched.inputs.width[0], sched.inputs.height[0]], [sizeId, sizeId],
        'the scheduler must be sized from GetImageSize, not baked');
});

test('the Voice Changer Flow carries its two audio inputs and the audio capture (MPI-607)', () => {
    // The first audio-only graph in the fleet: two MpiLoadAudio paths into
    // FL_ChatterboxVC, out through a native SaveAudio. Both inputs fail the same
    // silent way — the injector skips a title with no node, and MpiLoadAudio's
    // `block_if_empty` then stops the branch, so a typo here is a run that produces
    // nothing at all rather than a run that errors.
    const file = 'flow_voice_changer.json';
    const have = titlesOf(file);
    for (const title of [
        // `input_audio` is the user's performance, `input_audio_2` the target voice.
        // Swapping them is not a crash, it is a conversion in the wrong direction.
        'input_audio', 'input_audio_2', 'input_seed',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    // `output_audio`, NOT output_video — this op's SaveAudio is the primary output.
    // The executor matches this title EXACTLY (numbered siblings are an image/video
    // affordance only), and generationService promotes it to the run's product on
    // the strength of the op's declared `mediaType: 'audio'`.
    assert.ok(have.has('output_audio'), `${file} must carry a capture node titled "output_audio"`);

    // The graph has no text node anywhere, and it must stay that way. `_buildParams`
    // emits `Input_Positive: ''` on every run whether or not the flow collects a
    // prompt — same trap Outpaint and Head Swap dodge by leaving the node untitled.
    assert.ok(!have.has('input_positive'),
        `${file} takes no prompt — a node titled Input_Positive would be written with ''`);
});

test('the DramaBox Flow carries its prompt, duration, optional voice and audio capture (MPI-607)', () => {
    // The opposite half of Voice Changer: this graph DOES read a prompt, so
    // `input_positive` must be PRESENT here where the flow above requires its absence.
    // Both are the same `_buildParams` behaviour — it emits the title unconditionally —
    // and which way the assertion points is decided by whether the flow collects a
    // prompt, never by what reads tidier.
    const file = 'flow_drama_box.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_seed', 'input_audio', 'input_duration',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_audio'), `${file} must carry a capture node titled "output_audio"`);

    // The negative prompt is BAKED on DramaBoxTextEncode and must never become its own
    // titled node. `_buildParams` emits `Input_Negative: negative || ''` on every run
    // whatever the flow declares, so an `Input_Negative` node here would have this
    // baked list silently replaced with an empty string on every single generation —
    // the bug Draw It In actually shipped (MPI-620).
    assert.ok(!have.has('input_negative'),
        `${file} bakes its negative on DramaBoxTextEncode — a titled node would be wiped to ''`);
    const graph = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'comfy_workflows', file), 'utf8'));
    const encode = Object.values(graph).find(n => n?.class_type === 'DramaBoxTextEncode');
    assert.ok(encode, `${file} must carry a DramaBoxTextEncode`);
    assert.ok(typeof encode.inputs.negative_prompt === 'string' && encode.inputs.negative_prompt.length,
        `${file}: the negative must stay baked on the encode node`);

    // The prompt-only route is a real fork, not a fallback: one sampler takes
    // `voice_ref` and one does not, and an MpiAnyChecker on Input_Audio picks between
    // them. If both samplers ever take a voice_ref, an empty audio slot stops being a
    // supported route and the op's `required: false` becomes a lie.
    const samplers = Object.values(graph).filter(n => n?.class_type === 'DramaBoxSampler');
    assert.equal(samplers.length, 2, `${file} must keep both sampler arms`);
    assert.equal(samplers.filter(n => 'voice_ref' in n.inputs).length, 1,
        `${file}: exactly one sampler arm takes a voice reference (the other is the prompt-only route)`);
});

test('the Text to Speech Flow carries both TTS arms (MPI-607)', () => {
    const file = 'flow_chatter_box.json';
    const have = titlesOf(file);
    // NOT `input_audio_2`. That node fed the VC arm, which was stripped on
    // 2026-08-28 — the op maps one audio role now, so nothing can fill it. Asserting
    // it would demand a node the flow no longer has a way to reach.
    for (const title of [
        'input_positive', 'input_seed', 'input_audio',
        'input_is_multilingual', 'input_language',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_audio'), `${file} must carry a capture node titled "output_audio"`);

    const graph = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'comfy_workflows', file), 'utf8'));
    const byTitle = (t) => Object.entries(graph)
        .find(([, n]) => (n._meta?.title || '').toLowerCase() === t);

    // THE VC ASSERTIONS ARE GONE BECAUSE THE VC ARM IS. They pinned a real regression —
    // FL_ChatterboxVC#31 was wired straight to the English TTS instead of to the
    // Input_Is_Multilingual selector, and since MpiIfElse is lazy the selector was never
    // evaluated, so on the TTS -> VC route the language pick did nothing and the output
    // was always English. That route no longer exists: the op maps one audio role, so
    // `Input_Audio_2` is never filled and MpiAnyChecker#57 can only take the false arm.
    // The bypass itself is guarded in tests/flow-derived-fields.test.cjs, which is the
    // assertion that matters now — one declared role, one mapped mediaInput.

    // Both arms must survive: the flow declares BOTH weight sets and the selector needs
    // something on each side.
    assert.ok(Object.values(graph).some(n => n?.class_type === 'FL_ChatterboxTTS'),
        `${file} must keep the English TTS arm`);
    assert.ok(Object.values(graph).some(n => n?.class_type === 'FL_ChatterboxMultilingualTTS'),
        `${file} must keep the multilingual TTS arm`);

    // The dotted key the FlowDef emits must address a real node AND a real widget. The
    // MPI-359 sweep further down reads PromptBoxControls.js only, so it does NOT cover a
    // FLOW's declared fields — without this assertion a renamed widget here is a dead
    // control that no test notices.
    const flows = fs.readFileSync(
        path.join(__dirname, '..', 'js/data/flowsRegistry.js'), 'utf8');
    const dotted = [...flows.matchAll(/id: '(Input_\w+)\.(\w+)'/g)];
    assert.ok(dotted.length >= 1, 'no dotted flow field found — flowsRegistry has drifted');
    for (const [, title, widget] of dotted) {
        const hit = byTitle(title.toLowerCase());
        if (!hit) continue;                       // a dotted key for some other flow's graph
        assert.ok(widget in hit[1].inputs,
            `${file}: node "${title}" has no widget "${widget}" — the declared field is dead`);
    }

    // The baked language must be one the FlowDef actually offers, or the default sends a
    // value ComfyUI rejects with "Value not in list".
    const lang = byTitle('input_language')[1].inputs.language;
    assert.ok(flows.includes(`v: '${lang}'`),
        `${file}: baked language ${JSON.stringify(lang)} is not among the FlowDef's options`);
});

test('the Stems Flow carries its audio input and all FOUR numbered captures (MPI-663)', () => {
    const file = 'flow_stems.json';
    const have = titlesOf(file);
    assert.ok(have.has('input_audio'), `${file} must carry a node titled "input_audio"`);

    // One MpiBlocker per stem, and the FlowDef's four toggles name them. A title that
    // does not exist is silently skipped at injection, so the toggle would move and the
    // gate would stay at whatever the graph baked — every run returning all four stems
    // with nothing anywhere reporting it.
    for (const stem of ['bass', 'drums', 'other', 'vocals']) {
        assert.ok(have.has(`input_get_${stem}`),
            `${file} must carry a gate titled "Input_Get_${stem}"`);
    }

    // FOUR captures, numbered from _1 — the whole product of this flow is that there are
    // four of them, one card each. They are NOT `output_audio`: that title is matched
    // EXACTLY by the executor as the video mux side-channel, so a stem carrying it would
    // be swallowed by that path instead of landing as a card. Numbered from _1 rather
    // than base + _2 for the same reason — the bare title is taken.
    for (const n of [1, 2, 3, 4]) {
        assert.ok(have.has(`output_audio_${n}`),
            `${file} must carry a capture node titled "output_audio_${n}"`);
    }
    assert.ok(!have.has('output_audio'),
        `${file}: a bare "output_audio" node would be captured as the mux side-channel, not as a card`);

    // No text node anywhere, and it must stay that way: `_buildParams` emits
    // `Input_Positive: ''` on every run whether or not the flow collects a prompt.
    assert.ok(!have.has('input_positive'),
        `${file} takes no prompt — a node titled Input_Positive would be written with ''`);

    const graph = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'comfy_workflows', file), 'utf8'));
    // Each save keeps the stem's NAME in its filename_prefix. That is not cosmetic: it is
    // the only thing telling four otherwise identical cards apart, and generationService
    // reads it back off the /view filename to name them (`_multiAudioLabel`).
    const prefixes = Object.values(graph)
        .filter(n => (n._meta?.title || '').toLowerCase().startsWith('output_audio_'))
        .map(n => n.inputs.filename_prefix);
    assert.deepEqual(prefixes.slice().sort(),
        ['stems/Bass', 'stems/Drums', 'stems/Other', 'stems/Vocals'],
        `${file}: each stem save must name its own file — the card name is read back from it`);
    // FLAC, never MP3 — the source is already lossy, and separate-then-re-encode-then-
    // master stacks artifacts three deep.
    for (const n of Object.values(graph)) {
        if (!(n._meta?.title || '').toLowerCase().startsWith('output_audio_')) continue;
        assert.equal(n.inputs.format, 'flac', `${file}: stems ship as flac`);
    }
});

test('the MiniMax Music Flow carries the whole caption-assembly surface (MPI-664)', () => {
    // flowMinimaxMusic runs flow_minimax_music.json with no model — three flow deps and
    // a text-only input surface. Under GAP 4 option B the GRAPH assembles the caption:
    // the LLM writes only the three marked prose blocks into `Input_Caption`, and the
    // graph writes the headings, Basic Attributes, the instrumental clause and the
    // serialised voice roster around them. Every one of the titles below is therefore a
    // caption fragment, and injection skips a missing title in SILENCE — the run
    // succeeds and the fragment is simply absent from what the model was told.
    const file = 'flow_minimax_music.json';
    const have = titlesOf(file);
    for (const title of [
        'input_seed', 'input_mood', 'input_vocal', 'input_arrangement',
        'input_lyrics', 'input_structure', 'input_low_vram',
        'input_instrumental', 'input_style', 'input_style_custom', 'input_bpm',
        'input_voices', 'input_voice_notes', 'input_duration',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_audio'), `${file} must carry a capture node titled "output_audio"`);

    // 🔴 THE BRIEF NOW REACHES THE GRAPH, and this assertion is the reverse of what it
    // said until 2026-09-02 (decision A, Fabio). While the brief was the enhancer's
    // input and nothing else, the user's one sentence — the thing carrying his whole
    // intent — was paraphrased by a 4B and then thrown away, and only the paraphrase
    // was sung. It is prepended to Global Metadata now, which is where MiniMax's own
    // `Application Scenarios & Imagery` sub-label already lives; a FOURTH heading was
    // the alternative and is off-schema, their caption interface being exactly three.
    //
    // `Input_Positive` is the title BECAUSE `_buildParams` writes it on every run —
    // that is the whole delivery mechanism, and the reason the node is not called
    // `Input_Brief`: a bespoke title would need bespoke plumbing to fill it.
    assert.ok(have.has('input_positive'),
        `${file}: the brief must reach the graph — `
        + 'a node titled Input_Positive is how `positive` gets there at all');
    for (const title of ['input_negative', 'input_negative_audio']) {
        assert.ok(!have.has(title),
            `${file}: a node titled "${title}" would be written with '' on every run — `
            + 'this flow has no negative prompt');
    }

    const graph = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const idOf = (t) => Object.keys(graph)
        .find(k => (graph[k]._meta?.title || '').toLowerCase() === t);
    const feeds = (srcId, cls, input) => Object.values(graph).filter(
        n => n.class_type === cls && Array.isArray(n.inputs?.[input])
            && n.inputs[input][0] === srcId);

    // The encoder must read the ASSEMBLED strings. If either input ever went back to a
    // direct feed from the box, the whole chain would still be in the file, still convert,
    // still run — and every caption would be the raw prose with no headings at all.
    const enc = Object.values(graph).find(n => n.class_type === 'MiniMaxMusic3TextEncode');
    for (const input of ['caption', 'lyrics']) {
        assert.ok(Array.isArray(enc.inputs[input]),
            `${file}: MiniMaxMusic3TextEncode.${input} must come from the assembly chain`);
    }

    // TWO gates — and this assertion demanded exactly ONE until 2026-09-03, on the
    // reasoning that the lyrics gate "silently drops the section prose an instrumental
    // track is steered with". TWO LIVE RUNS ON THE GPU DISPROVED THAT, so it is reversed
    // here rather than deleted, because the old reasoning is the trap.
    //
    // What was true: `build_prompt` always sends `<|lyrics_start|>…<|lyrics_end|>` and
    // `normalize_lyrics` keeps `[section]` tags verbatim. What did NOT follow: that the
    // box therefore steers an instrumental arrangement. The tags survive; the prose
    // between them is a LYRIC LINE and the model sings it. Run 1 (tags with prose under
    // them) sang the stage directions. Run 2 folded every direction inside the brackets
    // — legal, `_LYRIC_TAG_RE` is `\[[^\]]+\]` — and it sang those too from the verse on.
    //
    // MiniMax's own local guidance, in `research/minimax-music-3.md` the whole time:
    // empty Lyrics AND an instrumental caption clause, or the model sneaks in humming
    // and vocoder pads. `Input_Structure` is the steering surface, and it now reaches
    // the model TWICE: as prose through the enhancer's [ARRANGEMENT] block, and as
    // WORDLESS SECTION TAGS through this gate's true arm (`Bare_Tags`, below). What run
    // 1 and run 2 actually proved is narrower than "no lyrics on an instrumental run" —
    // it is that WORDS in the lyrics slot get sung, brackets or no brackets. A bare
    // `[intro]` has none.
    //
    // Both gates matter for the same reason: a hidden or greyed field KEEPS ITS VALUE,
    // so the GRAPH re-checks the flag rather than trusting the UI to have blanked it.
    const instrumental = idOf('input_instrumental');
    const gates = feeds(instrumental, 'MpiIfElse', 'boolean');
    assert.equal(gates.length, 2,
        `${file}: Input_Instrumental must gate BOTH the Vocal Details block and the `
        + 'lyrics slot. Dropping the lyrics gate lets the caption say "no vocals" while '
        + 'the encoder is handed words to sing, and the model sings them');

    // Three prose blocks, THREE BOXES, each wired straight into its own heading
    // (MPI-664, 2026-09-02). This was one `Input_Caption` feeding three `RegexExtract`
    // nodes that split it back apart on `[MOOD]`/`[VOCAL]`/`[ARRANGEMENT]`; the UI now
    // holds the three blocks separately, so the graph takes them separately and the
    // extractors are gone. A box wired to the wrong concatenate would put the vocal
    // prose under the arrangement heading and still run.
    for (const title of ['input_mood', 'input_vocal', 'input_arrangement']) {
        assert.equal(feeds(idOf(title), 'StringConcatenate', 'string_b').length, 1,
            `${file}: ${title} must feed exactly one caption heading`);
    }
    assert.ok(!Object.values(graph).some(n => n.class_type === 'RegexExtract'),
        `${file}: the marker extractors are dead — the app splits the enhancer's answer now`);

    // `<Choir>` is not in MiniMax's tag set, so the roster markers are stripped before the
    // lyrics reach the model. Assert the pattern still does that rather than merely that a
    // RegexReplace exists — a pattern edit is exactly how this goes quiet.
    const strip = Object.values(graph)
        .find(n => (n._meta?.title || '') === 'Strip_Voice_Markers');
    assert.ok(strip, `${file} must carry the Strip_Voice_Markers node`);
    assert.equal(
        '[Chorus]\n<The Choir> carry it together'.replace(new RegExp(strip.inputs.regex_pattern, 'g'), ''),
        '[Chorus]\ncarry it together',
        `${file}: Strip_Voice_Markers must remove <Name> markers and leave the [Section] tags`);

    // BARE TAGS ON THE INSTRUMENTAL ARM (MPI-664, 2026-09-03). The gate's true arm was
    // `Empty_String`, which left the STRONGEST input channel blank: measured across
    // seven live runs, MiniMax honours Lyrics >> Global Metadata ~= Vocal Details >
    // Arrangement, so an instrumental run posted 100% of the user's intent through the
    // weakest channel and the model filled the blank lyrics slot from its prior — an
    // orchestral bed and a singer. The true arm now carries the user's section names
    // with every word stripped out.
    //
    // THE WHITELIST IS THE SAFETY PROPERTY, not the brackets. Run 2 put every stage
    // direction INSIDE brackets, Suno-style, and the model sang those too — a bracketed
    // run is a legal tag but it is not automatically wordless. So the pattern keeps only
    // MiniMax's own nine tags (`research/minimax-music-3.md`), with an optional trailing
    // number for `[Verse 2]`, and collapses everything else — prose, `[Drop]`, a
    // dangling bracket — to whitespace that `normalize_lyrics` then discards.
    const bare = Object.values(graph).find(n => (n._meta?.title || '') === 'Bare_Tags');
    assert.ok(bare, `${file} must carry the Bare_Tags node`);
    const barred = ('[Intro] a single orchestral drum, long reverb tail\n'
        + '[Drop] the 808 hits\n'
        + '[the drum loses its reverb, a viola enters]\n'
        + '[Chorus] big strings')
        .replace(new RegExp(bare.inputs.regex_pattern, 'gi'), '$1\n');
    assert.equal(barred.replace(/\s+/g, ' ').trim(), '[Intro] [Chorus]',
        `${file}: Bare_Tags must keep MiniMax's own section tags and drop everything else`);
    assert.equal(barred.replace(/\[[^\]]*\]|\s/g, ''), '',
        `${file}: Bare_Tags must leave NO word outside a tag — a word in the lyrics slot `
        + 'gets sung, which is the defect this card spent three sessions on');

    // A correct pattern wired nowhere is the silent version of this bug.
    const structure = idOf('input_structure');
    assert.ok(Array.isArray(bare.inputs.string) && bare.inputs.string[0] === structure,
        `${file}: Bare_Tags must read Input_Structure`);
    const bareId = Object.keys(graph).find(k => graph[k] === bare);
    const lyricsGate = Object.values(graph)
        .find(n => (n._meta?.title || '') === 'Lyrics_Gate');
    assert.equal(lyricsGate?.inputs?.true?.[0], bareId,
        `${file}: Lyrics_Gate's true arm must carry the bare tags — back on Empty_String `
        + 'it leaves the model\'s strongest input channel blank on every instrumental run');
});

test('the prompt enhancer graph carries the seed node its caller drives (MPI-504)', () => {
    // MpiBaseFlow._runEnhance sends `injectionParams: { Input_Seed: <random> }` on every
    // press, because step 3's loop is Enhance -> Generate -> Enhance and a fixed seed
    // returns the SAME phrase every time. The node was missing until 2026-08-20: the key
    // was silently skipped, every press returned the identical phrase, and nothing
    // anywhere reported it. Pinning it here is what stops that regressing.
    //
    // `input_seed` is an MpiInt wired into TextGenerate's NESTED `sampling_mode.seed`
    // widget. Option A, Fabio's standard: every workflow carries an Input_Seed, so
    // exposing seed as a user control later is a UI change and never a graph change.
    const file = 'qwen3vl_4b_prompt_enhancer.json';
    const have = titlesOf(file);
    for (const title of ['input_positive', 'input_system_prompt', 'input_seed']) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_prompt'), `${file} must carry a capture node titled "output_prompt"`);

    // The seed only does anything if it reaches the sampler. A titled node that feeds
    // nothing would pass the title check above and still leave the phrase frozen.
    const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const seedId = Object.keys(wf).find(
        id => (wf[id]._meta?.title || '').toLowerCase() === 'input_seed');
    const wired = Object.values(wf).some(n => Array.isArray(n.inputs?.['sampling_mode.seed'])
        && n.inputs['sampling_mode.seed'][0] === seedId);
    assert.ok(wired, `${file}: Input_Seed must be LINKED into a node's sampling_mode.seed, `
        + 'not left dangling — an unwired seed node freezes the enhanced phrase');
});

test('every media slot a model can actually see exists in that model\'s workflow', () => {
    // Same silent-skip class as the injectParams sweep above, on the OTHER injection
    // source. A `mediaInputs` slot whose title matches no node gives the user a chip well
    // that accepts a file, uploads it, and drops it on the floor — no error anywhere.
    // Untested until MPI-475, which is when it started to matter: ref2v_ms declares
    // FIFTEEN slots, so one typo is a reference that silently never conditions anything.
    //
    // The gating here mirrors filterMediaInputsForModel exactly, or the sweep would demand
    // Klein's depthSubject slots of Krea2 and LTX's audio slot of WAN.
    const declared = mediaInputsByOp(fs.readFileSync(COMMANDS, 'utf8'));
    assert.ok(declared.size >= 5, 'mediaInputs parse found almost nothing — the regex has drifted');

    const problems = [];
    let checked = 0;
    for (const model of modelDefs(fs.readFileSync(REGISTRY, 'utf8'))) {
        for (const [op, file] of model.workflows) {
            for (const slot of declared.get(op) || []) {
                if (slot.mediaType === 'audio' && model.capabilities.audio !== true) continue;
                if (slot.requiresCapability && model.capabilities[slot.requiresCapability] !== true) continue;
                let have;
                try { have = titlesOf(file); } catch { problems.push(`${model.id}: cannot read ${file}`); continue; }
                checked++;
                if (!have.has(slot.title.toLowerCase())) {
                    problems.push(`${model.id} / ${op}: ${file} has no node titled "${slot.title}" — that slot injects nowhere`);
                }
            }
        }
    }
    assert.ok(checked >= 20, `only ${checked} slot/workflow pairs checked — the sweep stopped reaching models`);
    assert.deepStrictEqual(problems, [], `media slots that would silently no-op:\n  ${problems.join('\n  ')}`);
});

test('every dotted injection key addresses a real node AND a real widget (MPI-359)', () => {
    // `Title.widget` addresses ONE widget on a node, which is how a control reaches a knob
    // that shares its node with others (comfyController §3). Same silent-skip failure mode
    // as the title sweep above, one level deeper: a renamed node OR a renamed widget = a
    // dead control, no error. Both expectations are DERIVED from the keys the controls
    // actually emit, so a rename on either side fails here instead of shipping.
    //
    // Grouped BY TITLE since MPI-475. This used to assert every dotted key pointed at the
    // one same node, which was true only while the style rack was the sole user — ref2va's
    // `Input_Refs.ref_image_size` made it two, and the flat widget loop below would then
    // have demanded `ref_image_size` on an MpiStyleSelector. The guard that matters is
    // per-node, not fleet-wide-singular.
    const controls = fs.readFileSync(
        path.join(ROOT, 'js/components/Organisms/MpiPromptBox/PromptBoxControls.js'), 'utf8');
    const keys = [...controls.matchAll(/'(\w+)\.(\w+)':/g)].map(m => ({ title: m[1], widget: m[2] }));
    assert.ok(keys.length >= 2, 'no dotted injection keys found — the controls have drifted');

    /** @type {Map<string, Set<string>>} lowercased node title → widgets addressed on it */
    const byTitle = new Map();
    for (const { title, widget } of keys) {
        const t = title.toLowerCase();
        if (!byTitle.has(t)) byTitle.set(t, new Set());
        byTitle.get(t).add(widget);
    }

    const problems = [];
    const found = new Set();
    for (const file of fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.json'))) {
        let wf;
        try { wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8')); } catch { continue; }
        for (const node of Object.values(wf)) {
            const title = (node?._meta?.title || '').toLowerCase();
            const widgets = byTitle.get(title);
            if (widgets) {
                found.add(title);
                for (const widget of widgets) {
                    if (!(widget in (node.inputs || {}))) {
                        problems.push(`${file}: node "${title}" has no "${widget}" input`);
                    }
                }
            }
            // The style rack's own node must never lose its title — an untitled
            // MpiStyleSelector is unreachable by every one of its dotted keys at once.
            if (node?.class_type === 'MpiStyleSelector' && !byTitle.has(title)) {
                problems.push(`${file}: MpiStyleSelector titled "${title || '(none)'}" matches no dotted key`);
            }
        }
    }
    for (const title of byTitle.keys()) {
        if (!found.has(title)) problems.push(`no workflow carries a node titled "${title}" — that control injects nowhere`);
    }
    assert.deepStrictEqual(problems, [], `dotted injection would silently no-op:\n  ${problems.join('\n  ')}`);
});

test('every FlowDef field and enhance recipe addresses a real node (MPI-664)', async () => {
    // The THIRD injection source, and the only one nothing guarded: a FlowDef's own
    // declared fields, and the `injectionParams` an `enhance` action carries.
    //
    // Both fail in silence, and this card produced one of each:
    //   - `style_custom` / `voice_notes` were written as LOWERCASE ids. A non-`Input_*`
    //     id is a top-level run input, not an injection param, so once the GRAPH started
    //     assembling the caption both controls reached NOTHING — the user typed into a
    //     box that was wired to nowhere, with no error anywhere.
    //   - `injectionParams` addresses the ENHANCER's graph, not the flow's, and its keys
    //     are dotted (`Input_Text_Gen.max_length`). A rename on either side leaves the
    //     BAKED recipe running, which is Character Sheet's — so a music flow would answer
    //     a song brief with a phrase about someone's wardrobe.
    //
    // Derived from the declarations rather than listed, so a new flow is covered by
    // existing here rather than by remembering to add a case.
    const esmImport = p => import('file://' + path.join(ROOT, p).replace(/\\/g, '/'));
    const { FLOWS } = await esmImport('js/data/flowsRegistry.js');
    const { UNIVERSAL_WORKFLOWS } = await esmImport('js/data/modelConstants/universal_workflows.js');
    assert.ok(FLOWS.length >= 10, 'the flow registry came back nearly empty — the import has drifted');

    const graphOf = (file) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const nodeByTitle = (graph, title) => Object.values(graph)
        .find(n => (n?._meta?.title || '').toLowerCase() === title.toLowerCase());

    // A declared `Input_*` that something other than the graph consumes.
    //
    // `ltx-upscale:Input_Denoise` is read by `ltxSigmasInjector`, which derives a
    // four-value schedule from it and injects THAT into `Input_Sigmas` — so a node named
    // for the dial would be a node nothing writes.
    //
    // `minimax-music:Input_Structure` WAS listed here and is not any more (MPI-664,
    // 2026-09-03). It was allow-listed on the reasoning that wiring it into the graph
    // would put the user's 40 words beside a rewrite of the same 40 words in one
    // caption — the rival-plan defect this card spent two GPU runs diagnosing. That
    // reasoning holds for the CAPTION and only the caption: the node it feeds now is
    // `Bare_Tags`, which strips every word and sends the section tags alone into the
    // lyrics slot. Two destinations, no rivalry — the prose still reaches [ARRANGEMENT]
    // through the enhancer, and nothing wordy reaches the encoder.
    //
    // Keep this list short: every addition is a control whose wiring this guard stops
    // checking.
    const INJECTOR_DERIVED = new Set([
        'ltx-upscale:Input_Denoise',
    ]);

    const problems = [];
    for (const flow of FLOWS) {
        const decls = [
            ...(flow.fields || []),
            ...(flow.steps || []).flatMap(s => s.fields || []),
        ];
        // MPI-591 — a flow's picked model may select a different GRAPH FILE (`byModel`
        // on the op), so "the flow's graph" is a SET. A declared field is legitimate
        // when it addresses a node in ANY of them and its `hiddenWhen` model rule takes
        // it off screen on the arms that lack it; it is a silent no-op only when NO
        // candidate carries the node. Checking `flow.workflow` alone would have called
        // Extend Video's Turbo toggle dead when it is the H3 arm's whole sampler gate.
        const files = [flow.workflow,
            ...Object.values(UNIVERSAL_WORKFLOWS[flow.operation]?.byModel || {})];
        const graphs = [];
        let unreadable = false;
        for (const file of [...new Set(files)].filter(Boolean)) {
            try { graphs.push([file, graphOf(file)]); } catch { problems.push(`${flow.id}: cannot read ${file}`); unreadable = true; }
        }
        if (unreadable || !graphs.length) continue;
        const findNode = (title) => graphs.map(([, g]) => nodeByTitle(g, title)).find(Boolean);

        for (const d of decls) {
            // A declared `Input_*` id names a node in the FLOW's own graph — and it may
            // be DOTTED itself (`Input_Language.language`), addressing one widget on a
            // node that carries several, exactly like an injectionParams key.
            const [fieldTitle, fieldWidget] = String(d.id).split('.');
            if (/^input_/i.test(fieldTitle) && !INJECTOR_DERIVED.has(`${flow.id}:${d.id}`)) {
                const node = findNode(fieldTitle);
                if (!node) {
                    problems.push(`${flow.id}: field "${d.id}" names no node in `
                        + `${graphs.map(([f]) => f).join(' / ')}`);
                } else if (fieldWidget && !(fieldWidget in (node.inputs || {}))) {
                    problems.push(`${flow.id}: field "${d.id}" — node "${fieldTitle}" has no "${fieldWidget}" input`);
                }
            }
            // A field with NO `default` is never seeded — `_seedField` returns
            // undefined and both seeding loops skip it — so the id never reaches
            // `injectionParams` and the GRAPH'S BAKED VALUE RUNS instead. Harmless when
            // the node is baked empty; when it is baked with the author's own bench
            // content, an untouched control silently ships that content. MPI-664's
            // lyrics and caption nodes both carry a full demo song.
            //
            // `Input_Positive` / `Input_Negative` are exempt: `_buildParams` writes both
            // on EVERY run whatever the flow declares, so neither can ever be left
            // sitting on its baked value. Character Sheet relies on exactly that — its
            // `Input_Positive` box is filled by Enhance, and by the top-level `positive`
            // when Enhance is never pressed.
            const ALWAYS_WRITTEN = /^input_(positive|negative)$/i;
            if (/^input_/i.test(fieldTitle) && d.default === undefined && !d.action
                && !ALWAYS_WRITTEN.test(fieldTitle)) {
                // Every candidate graph, not just the first: a node baked empty on one
                // arm and baked with bench content on another still ships that content.
                for (const [file, g] of graphs) {
                    const node = nodeByTitle(g, fieldTitle);
                    const baked = Object.entries(node?.inputs || {})
                        .find(([, v]) => typeof v === 'string' && v.trim() !== '');
                    if (baked) {
                        problems.push(`${flow.id}: field "${d.id}" declares no default, so the `
                            + `baked ${fieldTitle}.${baked[0]} in ${file} runs untouched — "${baked[1].slice(0, 40)}…"`);
                    }
                }
            }
            if (!d.injectionParams) continue;

            // ...but an action's `injectionParams` names nodes in the OP IT RUNS.
            const opFile = UNIVERSAL_WORKFLOWS[d.op]?.workflow;
            if (!opFile) {
                problems.push(`${flow.id}: field "${d.id}" injects into op "${d.op}", which has no workflow`);
                continue;
            }
            const opGraph = graphOf(opFile);
            for (const key of Object.keys(d.injectionParams)) {
                const [title, widget] = key.split('.');
                const node = nodeByTitle(opGraph, title);
                if (!node) {
                    problems.push(`${flow.id}: "${key}" names no node in ${opFile}`);
                } else if (widget && !(widget in (node.inputs || {}))) {
                    problems.push(`${flow.id}: "${key}" — node "${title}" has no "${widget}" input`);
                }
            }
        }
    }
    assert.deepStrictEqual(problems, [], `declared controls that would silently no-op:\n  ${problems.join('\n  ')}`);
});

test('the Krea2 master graph carries its branch selector and speed toggle', () => {
    // Pins the same regression the old branch-boolean test pinned, at the node the
    // design moved to (MPI-365). All SIX Krea2 ops run ONE file and select their branch
    // with Input_wf_type; lose that node (or its title) and every op silently degrades
    // to the baked default (t2i) instead of erroring — a plausible image from the wrong
    // operation, which is the worst failure mode this model has.
    //
    // Input_is_Turbo is here for the same reason: it replaced the Input_Tier int, and a
    // lost title means the speed toggle silently stops working rather than failing.
    //
    // SFW + NSFW ship the same graph (only the diffusion weight and the filter-bypass
    // strength differ), so both runtime files must carry both nodes.
    for (const file of ['krea2_t2i_sfw.json', 'krea2_t2i_nsfw.json']) {
        const have = titlesOf(file);
        for (const title of ['input_wf_type', 'input_is_turbo']) {
            assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
        }
        // The booleans this design replaced must be GONE, not merely unused — a stale
        // Input_Is_i2i left in the graph would be a second, contradictory branch
        // selector that nothing drives.
        for (const title of ['input_is_i2i', 'input_is_edit', 'input_depth_reference']) {
            assert.ok(!have.has(title),
                `${file} still carries "${title}" — MPI-365 replaced the per-op branch ` +
                `booleans with Input_wf_type; a leftover is a rival selector nothing sets`);
        }
    }
});

test('the Qwen master graph carries its branch selector', () => {
    // Qwen's three ops (1 edit / 2 depth / 3 pose) are branches of one graph. The
    // authoring template bakes 3, so a missing selector would run POSE for every op —
    // generate_qwen.py rebakes it to 1 and asserts, and this pins the shipped result.
    const have = titlesOf('qwen_edit.json');
    assert.ok(have.has('input_wf_type'), 'qwen_edit.json must carry a node titled "input_wf_type"');
    // Qwen KEEPS its three-tier radio — unlike Krea2, whose tier became a boolean.
    assert.ok(have.has('input_tier'), 'qwen_edit.json must keep its Input_Tier radio node');
});

test('a Flow step that declares fields declares a role its media schema supplies (MPI-531)', () => {
    // A step renders its gizmo only when `_mediaForRole(step.role)` finds media, but
    // its FIELDS are frame-owned and render either way. So a step whose role matches
    // no `inputSchema.media` role shows its prompt boxes under the line "Add the image
    // for this step on the first step." forever, and the value still reaches the run -
    // a control that works while telling the user it cannot. Cheap to typo, invisible
    // in review, and only reproducible by opening the Flow with media loaded.
    const src = fs.readFileSync(path.join(ROOT, 'js/data/flowsRegistry.js'), 'utf8');

    // Roles are declared as `roles: ['video1', ...]` inside inputSchema.media, and
    // consumed as `role: 'video1'` on a step. Both are flat string literals, so a
    // per-flow slice is enough - no JS evaluation, matching this file's other sweeps.
    const flows = [...src.matchAll(/^\s{8}id: '([a-z0-9-]+)',$/gm)];
    assert.ok(flows.length, 'flowsRegistry.js declares no flows - the id pattern moved');

    for (let i = 0; i < flows.length; i++) {
        const id = flows[i][1];
        const body = src.slice(flows[i].index, flows[i + 1]?.index ?? src.length);

        const supplied = new Set(
            [...body.matchAll(/roles:\s*\[([^\]]*)\]/g)]
                .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(r => r[1]))
        );
        // Only steps that actually declare fields are in scope: a gizmo-only step with
        // a bad role already fails loudly by rendering nothing the user can act on.
        const stepsBlock = body.slice(body.indexOf('steps: ['));
        for (const m of stepsBlock.matchAll(/role:\s*'([^']+)'/g)) {
            assert.ok(supplied.has(m[1]),
                `flow "${id}" has a step with role "${m[1]}", which no inputSchema.media ` +
                `roles[] supplies (supplied: ${[...supplied].join(', ') || 'none'})`);
        }
    }
});

test('the Object Stamp Flow carries its I/O, its model arm, its box and its mode (MPI-596)', () => {
    // flowObjectStamp runs flow_object_stamp.json. Every injection point here fails
    // SILENTLY: the injector skips a title with no node, so a typo is a control that
    // moves, a run that succeeds, and a graph still on its baked value.
    const file = 'flow_object_stamp.json';
    const have = titlesOf(file);
    for (const title of [
        // Two images. `input_paint` carries `image2` and the GRAPH fans it out — it
        // feeds both the composite (Auto) and the clean-object reference arm (Manual).
        // There is deliberately no third image title: `commandExecutor._buildParams`
        // keys its `assigned` Map by `slot.key`, so one role can never fill two titles.
        'input_image', 'input_paint',
        // The region that may change, and the only region stitched back. Goes through
        // the `headSwap` injector because an MpiBox carries four widgets the generic
        // title injector would match and silently not write.
        'input_box',
        // THE MODE, and it is the one this flow cannot lose. Three MpiAnySwitch nodes
        // read it to pick the crop source, reference 2 and the baked instruction. Drop
        // the title and every run silently takes Auto's wiring — including a Manual one,
        // which then stamps the object it was supposed to re-draw and still succeeds.
        'input_mode',
        'input_seed',
        // The one model slot, and BOTH nodes swap together. Without `input_edit_clip` a
        // 9B pick would keep 4B's text encoder and die with a shape error that reads as
        // a sampler bug (MPI-600).
        'input_edit_model', 'input_edit_clip',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // The prompt IS declared (an optional field on the place step), so unlike Outpaint
    // and Head Swap this graph SHOULD carry `input_positive` — the baked instruction
    // lives in its own MpiText nodes and is joined to the user's words downstream, so
    // an empty injection here wipes nothing.
    assert.ok(have.has('input_positive'),
        `${file} declares an optional prompt field, so it must carry Input_Positive`);

    const graph = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));

    // THE MODE MUST REACH ALL THREE SWITCHES. Two of them wired and one left on a
    // constant is the silent half-fork: Manual would take its own reference but Auto's
    // crop source, and the run would still finish.
    const [modeId] = Object.entries(graph)
        .find(([, n]) => (n?._meta?.title || '').toLowerCase() === 'input_mode') || [];
    const driven = Object.values(graph).filter(n =>
        n?.class_type === 'MpiAnySwitch' && Array.isArray(n.inputs?.select) && n.inputs.select[0] === modeId);
    assert.strictEqual(driven.length, 3,
        `${file}: Input_Mode must drive all 3 MpiAnySwitch nodes, found ${driven.length}`);

    // BOTH CROPS MUST SHARE ONE REGION. Law 7: the two references are only comparable
    // because they are framed identically, and a run with mismatched framing returns a
    // doll's-house composite rather than an error.
    const crops = Object.entries(graph).filter(([, n]) => n?.class_type === 'InpaintCropImproved');
    assert.strictEqual(crops.length, 2, `${file} must carry exactly 2 InpaintCropImproved nodes`);
    const [maskA, maskB] = crops.map(([, n]) => JSON.stringify(n.inputs.mask));
    assert.strictEqual(maskA, maskB, `${file}: both crops must read the same box mask (law 7)`);
    const [facA, facB] = crops.map(([, n]) => JSON.stringify(n.inputs.context_from_mask_extend_factor));
    assert.strictEqual(facA, facB, `${file}: both crops must share one context factor (law 7)`);

    // THE WRITE-BACK GROWTH IS DERIVED, NEVER A CONSTANT. Law 8: the canvas must equal
    // the region written back, or an object larger than the box is sliced by the stitch
    // and no prompt can reach it. A hard-coded pixel count is right for exactly one box
    // size — the bench's 276 — and silently wrong for every other.
    for (const [id, n] of crops) {
        assert.ok(Array.isArray(n.inputs.mask_expand_pixels),
            `${file}: crop ${id} must derive mask_expand_pixels from the box size, not hard-code it (law 8)`);
    }
});
