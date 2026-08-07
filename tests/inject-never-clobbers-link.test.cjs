/**
 * tests/inject-never-clobbers-link.test.cjs — MPI-466
 *
 * Title-based injection addresses WIDGETS. A wired input is `[nodeId, slot]` — the
 * graph author's wiring — and a scalar must never overwrite it, or the node receives
 * a filename/number where it expected the upstream value.
 *
 * This is not hypothetical. `MpiStageLatents` carries BOTH a `latent` link and
 * injectable widgets under ONE title (`Input_Video_Latent`). The plain-title spray in
 * `_inject` walks a list of recognised keys that includes `latent`, so it replaced the
 * link with the stage-2 load filename and the node died mid-run with
 * `TypeError: string indices must be integers, not 'str'` — after four minutes of
 * sampling, on the LAST node. ComfyUI cannot catch this: the graph is still
 * structurally valid, the type is only wrong at execution.
 *
 * Three shipped graphs carry that exact node — LTX, MiniMax H3 and WAN i2v — so the
 * bug was fleet-wide even though LTX is where it surfaced.
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONTROLLER = path.join(ROOT, 'js', 'services', 'comfyController.js');
const WORKFLOW_DIR = path.join(ROOT, 'comfy_workflows');

/** Mirrors the `_isLink` predicate in comfyController.js. */
const isLink = (v) => Array.isArray(v) && v.length === 2 && typeof v[1] === 'number';

test('the injector still carries the link guard on BOTH injection paths', () => {
    const src = fs.readFileSync(CONTROLLER, 'utf8');
    assert.match(src, /_isLink\s*=\s*\(v\)\s*=>\s*Array\.isArray\(v\)/,
        'the _isLink predicate is gone from comfyController.js');
    const guards = [...src.matchAll(/_isLink\((?:node\.inputs\[t\]|cur)\)\)\s*continue;/g)];
    assert.strictEqual(guards.length, 2,
        `expected the guard on both the spray path and the Title.widget path, found ${guards.length}`);
});

test('a scalar spray leaves a wired input alone but still writes widgets', () => {
    // The real shape that broke: one node, one link, one widget, same title.
    const node = {
        inputs: { latent: ['569', 0], load_path: 'mpi_stage1' },
        class_type: 'MpiStageLatents',
        _meta: { title: 'Input_Video_Latent' },
    };
    const targets = ['latent', 'load_path'];
    for (const t of targets) {
        if (t in node.inputs) {
            if (isLink(node.inputs[t])) continue;
            node.inputs[t] = 'ComfyUI_00001_.latent';
        }
    }
    assert.deepStrictEqual(node.inputs.latent, ['569', 0], 'the wired latent was clobbered');
    assert.strictEqual(node.inputs.load_path, 'ComfyUI_00001_.latent', 'the widget was not written');
});

test('every shipped MpiStageLatents keeps its latent wired — the guard has real work to do', () => {
    const staged = [];
    for (const file of fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.json'))) {
        let wf;
        try { wf = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')); } catch { continue; }
        if (!wf || typeof wf !== 'object') continue;
        for (const [id, node] of Object.entries(wf)) {
            if (node?.class_type !== 'MpiStageLatents') continue;
            staged.push(`${file}#${id}`);
            assert.ok(isLink(node.inputs?.latent),
                `${file}#${id} MpiStageLatents.latent is not wired — regenerate the graph`);
        }
    }
    assert.ok(staged.length >= 3,
        `expected LTX, H3 and WAN to ship MpiStageLatents, found ${staged.length}: ${staged.join(', ')}`);
});
