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
        return { id: (body.match(/id:\s*'([^']+)'/) || [])[1], workflows, opInject };
    }).filter(m => m.id && m.workflows.size);
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

test('the first App workflow carries its inject + capture titles (MPI-256)', () => {
    // Universal-op workflows (universal_workflows.js) are NOT covered by the generic
    // per-model sweep above (that only walks models.js `workflows:{}` blocks). The App
    // op runs App_sdxl_regen.json via model:{id:null}; pin the titles the injector +
    // capture depend on. Input_Is_i2i must be present (and baked true — the app is
    // always image-in) or the graph silently degrades to txt2img.
    const file = 'App_sdxl_regen.json';
    const have = titlesOf(file);
    for (const title of ['input_image', 'input_positive', 'input_negative', 'output_image', 'input_is_i2i']) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    // Assert i2i is baked true (app is image-in→image-out, never txt2img).
    const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const i2iNode = Object.values(wf).find(n => (n._meta?.title || '').toLowerCase() === 'input_is_i2i');
    assert.strictEqual(i2iNode?.inputs?.boolean, true, 'Input_Is_i2i must be baked true in the App workflow');
});

test('the second App workflow (SDXL 4K) carries its polymorphic I/O titles (MPI-259)', () => {
    // appSdxl4k runs App_sdxl_4k.json via model:{id:null}. Re-exported as the polymorphic
    // I/O test app: prompt/seed + the full media-input matrix (numbered/lowercase slots)
    // + MULTIPLE same-type capture nodes. Pins the exact titles the app injects into and
    // captures from. Numbered/lowercase names are deliberate — the injector matches them
    // case-insensitively (commandExecutor _buildParams + comfyController media-kind sweep).
    const file = 'App_sdxl_4k.json';
    const have = titlesOf(file);
    // Always-injected + declared input slots (multi-IMAGE variant: up to 2 images).
    for (const title of [
        'input_positive', 'input_negative', 'input_seed',
        'input_image', 'input_image_2',
    ]) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    // Multi-output: several same-type capture nodes (MPI-259 prefix-match capture).
    for (const title of ['output_image', 'output_image_2', 'output_image_3']) {
        assert.ok(have.has(title), `${file} must carry a capture node titled "${title}"`);
    }
});

test('the third App workflow (Video Stitch) carries its media I/O titles (MPI-259)', () => {
    // appVideoStitch runs app_video_test.json with model:{id:null} and NO required model.
    // Pins the lowercase/numbered media-input titles + the video capture titles. The
    // injector matches case-insensitively; the media-kind sweep pattern-forces
    // input_video*/input_audio* so these resolve + upload on the remote engine.
    const file = 'app_video_test.json';
    const have = titlesOf(file);
    for (const title of ['input_video', 'input_video_2', 'input_audio']) {
        assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
    }
    for (const title of ['output_video', 'output_video_2']) {
        assert.ok(have.has(title), `${file} must carry a capture node titled "${title}"`);
    }
});

test('every MpiStyleSelector is titled + shaped for the dotted injection keys (MPI-359)', () => {
    // The new style rack puts TWO injected knobs on ONE node, so the app addresses them
    // as `Title.widget` (comfyController §3). Same silent-skip failure mode as the title
    // sweep above, one level deeper: a renamed node OR a renamed widget = a dead picker.
    // The expected title is DERIVED from the key the control actually emits, so a rename
    // on either side fails here instead of shipping.
    const controls = fs.readFileSync(
        path.join(ROOT, 'js/components/Organisms/MpiPromptBox/PromptBoxControls.js'), 'utf8');
    const keys = [...controls.matchAll(/'(\w+)\.(\w+)':/g)].map(m => ({ title: m[1], widget: m[2] }));
    assert.ok(keys.length >= 2, 'no dotted injection keys found — the style controls have drifted');

    const titles = new Set(keys.map(k => k.title.toLowerCase()));
    assert.strictEqual(titles.size, 1, `dotted keys must address ONE node, got ${[...titles].join(', ')}`);
    const [expectTitle] = titles;

    const problems = [];
    for (const file of fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.json'))) {
        let wf;
        try { wf = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8')); } catch { continue; }
        for (const node of Object.values(wf)) {
            if (node?.class_type !== 'MpiStyleSelector') continue;
            const title = (node._meta?.title || '').toLowerCase();
            if (title !== expectTitle) {
                problems.push(`${file}: MpiStyleSelector titled "${title || '(none)'}", expected "${expectTitle}"`);
            }
            for (const { widget } of keys) {
                if (!(widget in (node.inputs || {}))) problems.push(`${file}: MpiStyleSelector has no "${widget}" input`);
            }
        }
    }
    assert.deepStrictEqual(problems, [], `style-selector injection would silently no-op:\n  ${problems.join('\n  ')}`);
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
