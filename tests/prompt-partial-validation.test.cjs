'use strict';

// MPI-495 — a generation could drop its style LoRAs and still report success.
//
// ComfyUI validates a prompt PER OUTPUT NODE and fails the REQUEST only when
// EVERY output is invalid: `validate_prompt` returns `(True, …)` as soon as one
// output survives (execution.py:1247). With one good output left it QUEUES the
// prompt, answers HTTP 200 `{prompt_id, number, node_errors}` (server.py:1132),
// logs "Output will be ignored" and executes the rest of the graph. The Pod
// wrapper forwards that body verbatim (`JSONResponse(r.json())`), so BOTH
// engines carry it.
//
// runWorkflow read only `ack.prompt_id` and dropped `ack.node_errors`, so the
// invalid style-LoRA branch was skipped while a sibling output still rendered —
// an UNSTYLED image resolved as `{success:true}`, with no toast and nothing in
// the app log. That silence is the defect; the separator bug that triggered it
// on the first GPU matrix (MPI-467) is only one of its causes.
//
// Drives the REAL js/services/comfyController.js — it imports in bare Node.

const assert = require('node:assert/strict');
const test = require('node:test');

const CONTROLLER = '../js/services/comfyController.js';

// A `MpiStyleLoras` bank names its slots `lora_1..lora_5` (MPI-359), NOT
// `lora_name` — which is why a fixed ['lora_name'] reader sees none of the
// style LoRAs this card is about.
const styleAck = () => ({
    prompt_id: 'p-495',
    number: 7,
    node_errors: {
        1421: {
            class_type: 'MpiStyleLoras',
            dependent_outputs: ['9'],
            errors: [{
                type: 'value_not_in_list',
                message: 'Value not in list',
                details: "lora_3: 'krea-2/style/krea2_rainywindow.safetensors' not in []",
                extra_info: {
                    input_name: 'lora_3',
                    received_value: 'krea-2/style/krea2_rainywindow.safetensors',
                },
            }],
        },
    },
});

const WORKFLOW = () => ({
    9: { class_type: 'SaveImage', _meta: { title: 'Output' }, inputs: { images: ['8', 0] } },
});

// ── the tagged error ─────────────────────────────────────────────────────────

test('a style-rack slot (lora_N) is recognised as a missing LoRA', async () => {
    const { partialValidationError } = await import(CONTROLLER);
    const err = partialValidationError(styleAck().node_errors, false);
    assert.equal(err.code, 'lora_missing_local');
    assert.equal(err.loraName, 'krea2_rainywindow.safetensors');
});

test('the engine, not the carrier, decides the local/remote tag', async () => {
    const { partialValidationError } = await import(CONTROLLER);
    // A 200 is structured `node_errors` on BOTH engines (the wrapper forwards the
    // body verbatim), so the 400 path's carrier→engine mapping cannot be reused:
    // it would give a remote drop the local "add it in Settings" advice.
    assert.equal(partialValidationError(styleAck().node_errors, true).code, 'lora_missing_remote');
});

test('a classic lora_name rejection stays in the same family', async () => {
    const { partialValidationError } = await import(CONTROLLER);
    const nodeErrors = {
        1535: {
            class_type: 'MpiLoraModelClip',
            errors: [{
                type: 'value_not_in_list',
                extra_info: { input_name: 'lora_name', received_value: 'SDXL/Liora_Lustify7.safetensors' },
            }],
        },
    };
    const err = partialValidationError(nodeErrors, false);
    assert.equal(err.code, 'lora_missing_local');
    assert.equal(err.loraName, 'Liora_Lustify7.safetensors');
});

test('a skipped LOADER node reports as missing weights, not a missing LoRA', async () => {
    const { partialValidationError } = await import(CONTROLLER);
    const nodeErrors = {
        12: {
            class_type: 'UNETLoader',
            errors: [{
                type: 'value_not_in_list',
                extra_info: { input_name: 'unet_name', received_value: 'krea-2/krea2_fp8.safetensors' },
            }],
        },
    };
    const err = partialValidationError(nodeErrors, true);
    assert.equal(err.code, 'weights_missing_remote');
    assert.equal(err.weightName, 'krea2_fp8.safetensors');
});

test('any other skipped node stays untagged (a real graph bug) and names itself', async () => {
    const { partialValidationError } = await import(CONTROLLER);
    const err = partialValidationError({
        44: {
            class_type: 'MpiCropStitch',
            errors: [{ type: 'required_input_missing', message: 'Required input is missing', details: 'stitch' }],
        },
    }, false);
    assert.equal(err.code, undefined);          // → bug reporter, which is correct here
    assert.match(err.message, /MpiCropStitch \(44\)/);
    assert.match(err.message, /Required input is missing/);
});

// ── the dispatch guard, driven through the real runWorkflow ──────────────────

// Everything runWorkflow touches around the /prompt POST that needs a live
// engine. `connect` is the WebSocket — left real it dials 127.0.0.1:48188 and
// arms reconnect timers that outlive the test.
function stubEngine(engine, ack, deleted) {
    const saved = {
        ensureServerRunning: engine.ensureServerRunning,
        connect: engine.connect,
        _startHistoryPoll: engine._startHistoryPoll,
        deleteQueueItem: engine.deleteQueueItem,
    };
    const savedFetch = globalThis.fetch;
    engine.ensureServerRunning = async () => true;
    engine.connect = () => {};
    engine._startHistoryPoll = () => {};
    engine.deleteQueueItem = async (id) => { deleted.push(id); return true; };
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ack });
    return () => {
        Object.assign(engine, saved);
        globalThis.fetch = savedFetch;
        engine._promptListeners.clear();
        engine._promptRejectors.clear();
        engine._promptResolvers.clear();
        engine._isRunning = false;
    };
}

test('an accepted prompt whose LoRA node was skipped does NOT report success', async () => {
    const { localEngine } = await import(CONTROLLER);
    const deleted = [];
    const restore = stubEngine(localEngine, styleAck(), deleted);
    try {
        const run = localEngine.runWorkflow(WORKFLOW(), {});
        // Attach the expectation SYNCHRONOUSLY — the guard rejects within the same
        // microtask run, and an unhandled rejection would be charged to whichever
        // test happens to be running.
        const settled = assert.rejects(run, (err) => {
            assert.equal(err.code, 'lora_missing_local');           // → warning toast
            assert.equal(err.loraName, 'krea2_rainywindow.safetensors');
            return true;
        });
        await new Promise(r => setImmediate(r));           // let the ack land
        // Without the guard the prompt registers and the engine goes on to render
        // from the surviving output — this terminal event is what used to resolve
        // `{success:true}` on a picture with none of the requested styles. Firing
        // it here is what makes the test fail on the DEFECT, not on a timeout.
        localEngine._promptListeners.get('p-495')?.({
            type: 'execution_success', data: { prompt_id: 'p-495' },
        });
        await settled;
        // no listener left behind claiming a live generation
        assert.equal(localEngine._promptListeners.size, 0);
        // and the already-queued run is un-queued instead of burning the GPU
        assert.deepEqual(deleted, ['p-495']);
    } finally { restore(); }
});

test('the healthy 200 carries node_errors:{} — it must NOT trip the guard', async () => {
    // server.py ALWAYS includes the key; on a fully valid prompt it is empty. A
    // truthiness-only check here would fail every generation in the app.
    const { localEngine } = await import(CONTROLLER);
    const deleted = [];
    const restore = stubEngine(localEngine, { prompt_id: 'p-ok', number: 1, node_errors: {} }, deleted);
    try {
        const run = localEngine.runWorkflow(WORKFLOW(), {});
        await new Promise(r => setImmediate(r));           // let the ack land
        const listener = localEngine._promptListeners.get('p-ok');
        assert.ok(listener, 'the prompt should be registered and running');
        listener({ type: 'execution_success', data: { prompt_id: 'p-ok' } });
        assert.equal((await run).success, true);
        assert.deepEqual(deleted, []);
    } finally { restore(); }
});
