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

/** Every `<op>: '<file>.json'` inside each ModelDef's `workflows: { ... }` block. */
function workflowsByOp(src) {
    const out = new Map();
    for (const block of src.matchAll(/workflows:\s*\{([\s\S]*?)\n\s{8}\}/g)) {
        for (const [, op, file] of block[1].matchAll(/(\w+):\s*'([^']+\.json)'/g)) {
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

    assert.ok(declared.size > 0, 'parsed zero injectParams — the regex has drifted');

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

test('the Krea2 shared graph carries both branch booleans', () => {
    // Pins the specific regression: t2i / i2i / poseReference all run one file and
    // select a branch with a baked-false boolean. Lose a node (or its title) and the
    // op silently degrades to plain t2i.
    // SFW + NSFW ship the same t2i graph (only the diffusion weight differs), so both
    // runtime files must carry the branch booleans.
    for (const file of ['krea2_turbo_t2i_sfw.json', 'krea2_turbo_t2i_nsfw.json']) {
        const have = titlesOf(file);
        for (const title of ['input_is_i2i', 'input_pose_reference', 'input_batch_size']) {
            assert.ok(have.has(title), `${file} must carry a node titled "${title}"`);
        }
    }
});
