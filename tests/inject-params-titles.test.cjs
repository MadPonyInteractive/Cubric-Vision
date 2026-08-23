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
    const file = 'flow_character_sheet.json';
    const have = titlesOf(file);
    for (const title of [
        'input_positive', 'input_negative', 'input_seed',
        'input_recipe', 'input_quality', 'input_is_turbo', 'input_remove_head',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);
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

test('the Scribble to Object Flow carries its I/O, both model arms and its box (MPI-567)', () => {
    // flowScribbleObject runs flow_scribble_object.json on model:{id:null} with TWO
    // choosable slots, so it has more titled injection points than any other flow —
    // and every one of them fails SILENTLY. The injector skips a title with no node,
    // so a typo here is a control that moves, a run that succeeds, and a graph still
    // on its baked value.
    const file = 'flow_scribble_object.json';
    const have = titlesOf(file);
    for (const title of [
        // Two images, and only the first is the user's: `input_paint` is the paint
        // step's derived layer arriving through `mediaRole: 'image2'`. Lose that title
        // and the drawing never reaches the graph — the ControlNet hint goes empty and
        // SDXL renders from the prompt alone, which still produces a picture.
        'input_image', 'input_paint',
        // The box step's target. Newest of the lot (the LanPaint rebuild added it), and
        // it goes through the `headSwap` injector because an MpiBox carries four widgets
        // the generic title injector would match and silently not write.
        'input_box',
        'input_seed',
        // The two declared fields.
        'input_control_net', 'input_control_strength',
        // Render slot: any of the five SDXL cards.
        'input_base_model',
        // Blend slot: klein-9b / klein-4b, and BOTH nodes swap together. The CLIPLoader
        // was untitled as authored — without `input_edit_clip` a 9B pick keeps 4B's text
        // encoder and dies with a shape error that reads as a LanPaint bug (MPI-600).
        'input_edit_model', 'input_edit_clip',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    assert.ok(have.has('output_image'), `${file} must carry a capture node titled "output_image"`);

    // …and unlike Outpaint and Head Swap, this flow's prompt title is REQUIRED.
    // The two of them bake their instruction and deliberately leave the node untitled so
    // the run's empty `Input_Positive` cannot clobber it. This flow is the opposite: the
    // user's words ARE the subject, and node 17 feeds a StringConcatenate that appends the
    // isolate-on-white suffix before the encoder. Shipping without it is what produced a
    // blob rendered into something nobody asked for on the first live run (2026-08-23) —
    // the drawing gives a silhouette, and a silhouette alone is not a subject.
    assert.ok(have.has('input_positive'),
        `${file} takes a user prompt, so its prompt node MUST stay titled Input_Positive`);
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
