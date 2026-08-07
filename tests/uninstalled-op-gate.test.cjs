'use strict';

/**
 * uninstalled-op-gate.test.cjs — MPI-453.
 *
 * Reported live 2026-08-05: Wan 2.2 selected, no image staged, Generate pressed →
 * the "Generation failed / Prompt outputs failed validation" dialog with a REPORT
 * ON GITHUB button. The user read it as "I forgot to stage an image". It was not.
 * He has ONLY the i2v weights installed, the app dispatched `t2v_ms` anyway, and
 * ComfyUI rejected a graph loading two weights that are not on disk.
 *
 * Two defects, pinned here:
 *   1. AVAILABILITY — per-op deps are opt-in (`models.js` operations[].deps), so
 *      the app KNOWS the t2v pair is absent, and offered the op regardless.
 *   2. ERROR SURFACE — the rejection carried no tag, so it reached MpiErrorDialog
 *      instead of a toast naming the missing weight.
 *
 * The 400 body below is transcribed from the real
 * `%APPDATA%/Cubric Vision/logs/app.log` at 2026-08-05T06:05:07, not imagined.
 *
 * MPI-470 later DEPRECATED wan-22's `t2v_ms`, so the two-op state this bug needed no
 * longer exists in `models.js` — and with it gone, no shipped model declares 2+
 * operation groups. The guard is what must not regress, so the two-op model is
 * reconstructed here by `wanWithT2V()`. Nothing in it is invented: the `wan-22-t2v-*`
 * DEPS entries are still real (kept on purpose so the uninstall orphan sweep can
 * reclaim them from users who already downloaded them).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ── the real rejection, both carriers ─────────────────────────────────────────
// Local: ComfyUI answers directly. `details` is '' because another output node
// still validated — the whole reason the filename must come from node_errors.
const INSTALLED_UNETS = [
    'Chroma1-HD-flash-heun.safetensors',
    'Wan_22_i2v_High.safetensors',
    'Wan_22_i2v_Low.safetensors',
    'boogu_image_edit_turbo.safetensors',
    'flux-2-klein-4b.safetensors',
    'krea2_raw.safetensors',
    'lustify-v10-krea-raw.safetensors',
    'qwen_image_edit_2511.safetensors',
];
const LOCAL_400 = {
    error: {
        type: 'prompt_outputs_failed_validation',
        message: 'Prompt outputs failed validation',
        details: '',
        extra_info: {},
    },
    node_errors: {
        95: {
            class_type: 'UNETLoader',
            errors: [{
                type: 'value_not_in_list',
                message: 'Value not in list',
                details: `unet_name: 'Wan_22_t2v_High.safetensors' not in ${JSON.stringify(INSTALLED_UNETS)}`,
                extra_info: { input_name: 'unet_name', received_value: 'Wan_22_t2v_High.safetensors' },
            }],
        },
        96: {
            class_type: 'UNETLoader',
            errors: [{
                type: 'value_not_in_list',
                message: 'Value not in list',
                details: `unet_name: 'Wan_22_t2v_Low.safetensors' not in ${JSON.stringify(INSTALLED_UNETS)}`,
                extra_info: { input_name: 'unet_name', received_value: 'Wan_22_t2v_Low.safetensors' },
            }],
        },
    },
};
// Remote: the Pod wrapper folds ComfyUI's TEXT into detail.comfy_body — same
// rejection, no structured node_errors to read.
const REMOTE_503 = {
    error: 'engine_error',
    message: 'ComfyUI Error',
    detail: {
        comfy_status: 400,
        comfy_body: "Failed to validate prompt for output 932: * UNETLoader 95: - Value not in list: "
            + "unet_name: 'Wan_22_t2v_High.safetensors' not in ['Wan_22_i2v_High.safetensors']",
    },
};

test('the LoRA reader is blind to this rejection — nothing tagged it, so it reached the dialog', async () => {
    const { findRejectedFile } = await import('../js/utils/comfyValidationError.js');
    // This is the unfixed behaviour: the only carrier the code read was lora_name.
    assert.equal(findRejectedFile(LOCAL_400.node_errors, ['lora_name'], ''), null);
    assert.equal(findRejectedFile(null, ['lora_name'], REMOTE_503.detail.comfy_body), null);
    // And the legacy text scrape had nothing to scrape: `details` is ''.
    assert.equal(/value not in list:\s*lora_name:\s*'([^']+)'/i.exec(LOCAL_400.error.details), null);
});

test('the weight inputs resolve on the LOCAL carrier, and the name is the filename', async () => {
    const { findRejectedFile, rejectedBasename, MODEL_FILE_INPUTS } =
        await import('../js/utils/comfyValidationError.js');

    const hit = findRejectedFile(LOCAL_400.node_errors, MODEL_FILE_INPUTS, '');
    assert.deepEqual(hit, {
        name: 'Wan_22_t2v_High.safetensors',
        input: 'unet_name',
        carrier: 'node_errors',
    });
    // carrier === 'node_errors' is what tags the error LOCAL rather than remote.
    assert.equal(rejectedBasename(hit.name), 'Wan_22_t2v_High.safetensors');
    // A path-prefixed value (how ComfyUI echoes LoRA subfolders) still reduces.
    assert.equal(rejectedBasename('SDXL\\Models\\x.safetensors'), 'x.safetensors');
});

test('the same rejection resolves on the REMOTE carrier — MPI-229 shipped only one of the two', async () => {
    const { findRejectedFile, MODEL_FILE_INPUTS } = await import('../js/utils/comfyValidationError.js');

    const hit = findRejectedFile(null, MODEL_FILE_INPUTS, REMOTE_503.detail.comfy_body);
    assert.equal(hit.name, 'Wan_22_t2v_High.safetensors');
    assert.equal(hit.carrier, 'text', 'text carrier => weights_missing_remote, not _local');
});

test('unrelated validation failures are not reported as a missing weight', async () => {
    const { findRejectedFile, MODEL_FILE_INPUTS } = await import('../js/utils/comfyValidationError.js');

    assert.equal(findRejectedFile(null, MODEL_FILE_INPUTS, ''), null);
    assert.equal(findRejectedFile({}, MODEL_FILE_INPUTS, ''), null);
    // A weight input failing for a different REASON is not a missing file.
    assert.equal(findRejectedFile({
        9: { errors: [{ type: 'required_input_missing', extra_info: { input_name: 'unet_name' } }] },
    }, MODEL_FILE_INPUTS, ''), null);
    // A LoRA miss must stay on the LoRA path — it has its own toast and its own fix.
    assert.equal(findRejectedFile({
        7: {
            errors: [{
                type: 'value_not_in_list',
                extra_info: { input_name: 'lora_name', received_value: 'sdxl\\x.safetensors' },
            }],
        },
    }, MODEL_FILE_INPUTS, ''), null);
});

// ── the root: the app knew those weights were absent ──────────────────────────

/** The user's disk on 2026-08-05: commonDeps + the i2v operation, no t2v pair. */
function i2vOnlyStatus(installedIds) {
    const on = new Set(installedIds);
    return (depId) => on.has(depId);
}

/** wan-22 as it shipped BEFORE MPI-470 dropped t2v_ms — the shape this bug needed. */
const T2V_DEPS = ['wan-22-t2v-high', 'wan-22-t2v-low'];
function wanWithT2V(wan) {
    return {
        ...wan,
        supportedOps: ['t2v_ms', ...wan.supportedOps],
        operations: { t2v_ms: { deps: T2V_DEPS }, ...wan.operations },
    };
}

test('deriveInstalledOps already answers the question the dispatcher never asked', async () => {
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    const { deriveInstalledOps } = await import('../js/data/modelConstants/resolveModelDeps.js');

    const shipped = MODELS.find(m => m.id === 'wan-22');
    // MPI-470: the real card is i2v-only now. Deprecation must be COMPLETE — a leftover
    // t2v_ms in either list would still be offered, and its graph is deleted.
    assert.deepEqual(shipped.supportedOps, ['i2v_ms'], 'wan-22 t2v_ms is deprecated (MPI-470)');
    assert.equal(shipped.operations.t2v_ms, undefined, 'and its dep group went with it');
    assert.equal(shipped.workflows.t2v_ms, undefined, 'and its workflow file is deleted');

    const wan = wanWithT2V(shipped);
    assert.ok(wan.operations.t2v_ms && wan.operations.i2v_ms, 'the two-op shape under test');

    const installed = [...wan.commonDeps, ...wan.operations.i2v_ms.deps];
    const { installedOps, fullyInstalled } = deriveInstalledOps(wan, i2vOnlyStatus(installed), 'local');

    assert.deepEqual(installedOps, ['i2v_ms'], 't2v_ms was never installed — the app knew');
    assert.equal(fullyInstalled, true, 'a partial install is still a usable model');
    // supportedOps[0] is exactly what the old fallback seeded, and it is the op that blew up.
    assert.equal(wan.supportedOps[0], 't2v_ms');
    assert.ok(!installedOps.includes(wan.supportedOps[0]),
        'seeding from supportedOps[0] lands on an uninstalled op — the reported bug');
});

test('the rejected filenames ARE the deps t2v_ms declares — the log and the dep registry agree', async () => {
    const { DEPS } = await import('../js/data/modelConstants/dependencies.js');

    // MPI-470 keeps these two entries after deprecating the op: `_orphanedDepIds`
    // iterates DEPS, so they are what lets the uninstall sweep reclaim 27.1GB from
    // users who already downloaded them. Deleting them blinds the sweep.
    for (const id of T2V_DEPS) {
        assert.ok(DEPS[id], `${id} must stay in DEPS for the orphan sweep (MPI-470)`);
    }
    const files = T2V_DEPS.map(id => DEPS[id].filename.split('/').pop());
    assert.deepEqual(files.sort(), ['Wan_22_t2v_High.safetensors', 'Wan_22_t2v_Low.safetensors']);

    const rejected = Object.values(LOCAL_400.node_errors)
        .map(n => n.errors[0].extra_info.received_value).sort();
    assert.deepEqual(rejected, files, 'ComfyUI rejected exactly the operation the user did not install');
});

test('an uninstalled op is not offered, and an installed one still is', async () => {
    const { getAvailableCommands } = await import('../js/data/commandRegistry.js');
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    const wan = wanWithT2V(MODELS.find(m => m.id === 'wan-22'));

    const offered = getAvailableCommands('video', wan, { installedOps: ['i2v_ms'] }).map(c => c.key);
    assert.deepEqual(offered, ['i2v_ms'], 't2v_ms must not reach the op strip');

    // NULL is unknown, not empty: with no dep-status yet the static list stands, or
    // a model would go op-less on every cold boot.
    assert.deepEqual(
        getAvailableCommands('video', wan, { installedOps: null }).map(c => c.key),
        ['t2v_ms', 'i2v_ms']);
});

test('installedOpsForContext fails OPEN on an unseeded dep-status cache', async () => {
    const { installedOpsForContext, firstInstalledOp, getModelById } =
        await import('../js/data/modelRegistry.js');

    // Nothing has called /comfy/models/check in this process, so the cache is empty.
    assert.equal(installedOpsForContext('wan-22'), null,
        'unknown must stay unknown — returning [] would hide every op');
    assert.equal(installedOpsForContext(getModelById('krea2')), null, 'a model with no per-op deps never applies');
    // And the fallback still names a real op rather than null.
    assert.ok(getModelById('wan-22').supportedOps.includes(firstInstalledOp('wan-22')));
    assert.equal(firstInstalledOp(null), null);
});

/**
 * The end-to-end read, through the SHIPPED path rather than a mirror of it:
 * stub `/comfy/models/check` with the user's actual disk (commonDeps + the i2v
 * operation), run the real `syncModelInstalled`, then ask the three predicates
 * every op-picking surface now consults.
 *
 * Keep this LAST — it seeds the module-level dep-status cache the test above
 * requires to be empty.
 */
test('after the real dep-status sync, every op-picking predicate refuses t2v', async () => {
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    const wan = MODELS.find(m => m.id === 'wan-22');
    const onDisk = new Set([...wan.commonDeps, ...wan.operations.i2v_ms.deps]);

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (_path, opts) => {
        const { models } = JSON.parse(opts.body);
        const results = {};
        for (const m of models) {
            results[m.id] = {
                installed: m.deps.every(d => onDisk.has(d.id)),
                deps: m.deps.map(d => ({ id: d.id, installed: onDisk.has(d.id) })),
            };
        }
        return { ok: true, json: async () => ({ results, bakedDrift: [] }) };
    };
    try {
        const reg = await import('../js/data/modelRegistry.js');
        assert.equal(await reg.syncModelInstalled(), true);

        assert.equal(reg.isOperationInstalled('wan-22', 't2v_ms'), false, 'the generate-time gate blocks it');
        assert.equal(reg.isOperationInstalled('wan-22', 'i2v_ms'), true, 'and lets the installed op through');
        assert.equal(reg.firstInstalledOp('wan-22'), 'i2v_ms', 'the seed lands on i2v, not supportedOps[0]');
        assert.deepEqual(reg.installedOpsForContext('wan-22'), ['i2v_ms'], 'the strip is offered i2v only');
        assert.equal(reg.isModelUsable('wan-22'), true, 'a partial install must stay in the model picker (MPI-122)');
    } finally {
        globalThis.fetch = realFetch;
    }
});
