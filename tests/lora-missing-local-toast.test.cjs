'use strict';

// A LoRA whose folder was removed from Settings made a local generation die with the
// GitHub bug-reporter dialog instead of the missing-LoRA toast, and left the Cue
// panel stuck on a RUNNING card whose STOP button did nothing.
//
// Three independent defects, one repro. Each is pinned here:
//   1. comfyController.ensureServerRunning() returned early (already-running engine)
//      WITHOUT emitting `comfy:ready`, so shell.js never ran loadAssets() and
//      `state.availableLoras` stayed [] — which makes _findMissingModel fail OPEN.
//   2. The /prompt 400 parser only read the REMOTE wrapper's `detail.comfy_body`.
//      Local ComfyUI answers `{error, node_errors}` (server.py:1126) and the filename
//      lives in node_errors[id].errors[].extra_info.received_value — unread, so the
//      error was never tagged as a missing LoRA.
//   3. cancelRunningCueJob() looked the job up in `activeGenerations`, but exec.onError
//      had already deleted that entry, while the panel still rendered RUNNING from
//      `_lanes[lane].active` → STOP hard-returned false and no-oped.

const assert = require('node:assert/strict');
const test = require('node:test');

// ── 1. the guard fails open on an empty list ─────────────────────────────────
// Mirrors _findMissingModel + _pathKey in js/services/commandExecutor.js.
const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

function findMissingModel(params, availableLoras) {
    const loras = availableLoras;
    const resolvable = (name) => {
        if (!Array.isArray(loras) || !loras.length) return true; // <- fails OPEN
        return loras.some(f => _pathKey(f) === _pathKey(name));
    };
    for (const value of Object.values(params || {})) {
        if (value && typeof value === 'object' && value.lora_name) {
            if (!resolvable(value.lora_name)) return value.lora_name;
        }
    }
    return null;
}

const GONE = { lora_name: 'SDXL\\Models\\Liora_Lustify7_V1_E21.safetensors' };
const PRESENT_LIST = ['sdxl\\dmd2_sdxl_4step_lora.safetensors'];

test('guard fails OPEN when availableLoras is empty — the root of the raw 400', () => {
    // This is why the toast never fired: with no asset list the guard waves it through.
    assert.equal(findMissingModel({ Lora_1: GONE }, []), null);
    // Once the list is loaded, the same params are correctly blocked.
    assert.equal(findMissingModel({ Lora_1: GONE }, PRESENT_LIST), GONE.lora_name);
});

// ── 2. the local 400 body carries the name only in node_errors ───────────────
// Mirrors _findNodeErrorLora in js/services/comfyController.js.
function findNodeErrorLora(nodeErrors) {
    if (!nodeErrors || typeof nodeErrors !== 'object') return null;
    for (const node of Object.values(nodeErrors)) {
        for (const e of (node?.errors || [])) {
            if (e?.type !== 'value_not_in_list') continue;
            if (e?.extra_info?.input_name !== 'lora_name') continue;
            const got = e.extra_info.received_value;
            if (typeof got === 'string' && got) return got;
        }
    }
    return null;
}

// Verbatim shape from ComfyUI execution.py:1063 + server.py:1126. Note `details: ''`
// on the top-level error — exactly what the user's terminal log showed.
const LOCAL_400 = {
    error: {
        type: 'prompt_outputs_failed_validation',
        message: 'Prompt outputs failed validation',
        details: '',
        extra_info: {},
    },
    node_errors: {
        1535: {
            class_type: 'MpiLoraModelClip',
            errors: [{
                type: 'value_not_in_list',
                message: 'Value not in list',
                details: "lora_name: 'SDXL\\Models\\Liora_Lustify7_V1_E21.safetensors' not in [...]",
                extra_info: {
                    input_name: 'lora_name',
                    received_value: 'SDXL\\Models\\Liora_Lustify7_V1_E21.safetensors',
                },
            }],
        },
    },
};

// The old regex only ever saw `comfy_body || errMsg`.
const LEGACY_REGEX = /value not in list:\s*lora_name:\s*'([^']+)'/i;

test('the legacy regex cannot see the local 400 — nothing to match against', () => {
    const errMsg = LOCAL_400.error.message;        // 'Prompt outputs failed validation'
    const comfyBody = null;                        // local reply has no wrapper detail
    assert.equal(LEGACY_REGEX.exec(comfyBody || errMsg), null);
});

test('node_errors yields the offending filename on the local engine', () => {
    assert.equal(findNodeErrorLora(LOCAL_400.node_errors),
        'SDXL\\Models\\Liora_Lustify7_V1_E21.safetensors');
    const base = findNodeErrorLora(LOCAL_400.node_errors).split(/[\\/]/).pop();
    assert.equal(base, 'Liora_Lustify7_V1_E21.safetensors');
});

test('node_errors reader ignores unrelated validation failures', () => {
    assert.equal(findNodeErrorLora(null), null);
    assert.equal(findNodeErrorLora({}), null);
    // a non-lora enum failure (e.g. ckpt_name) must not be reported as a LoRA
    assert.equal(findNodeErrorLora({
        7: { errors: [{ type: 'value_not_in_list', extra_info: { input_name: 'ckpt_name', received_value: 'x.safetensors' } }] },
    }), null);
    // a lora input failing for a different reason is not a missing file
    assert.equal(findNodeErrorLora({
        9: { errors: [{ type: 'required_input_missing', extra_info: { input_name: 'lora_name' } }] },
    }), null);
});

test('errCode must stay a string — local `error` is an OBJECT, not a code', () => {
    // `errCode = errData?.error` would capture the object and break every
    // `errCode === 'comfy_not_ready'` style comparison below it.
    const errCode = typeof LOCAL_400.error === 'string' ? LOCAL_400.error : null;
    assert.equal(errCode, null);
    // the remote wrapper's string form still resolves
    const remote = { error: 'comfy_not_ready', message: 'restarting' };
    assert.equal(typeof remote.error === 'string' ? remote.error : null, 'comfy_not_ready');
});

test('carrier decides the engine tag — node_errors=local, comfy_body=remote', () => {
    const tag = (nodeErrorLora) => (nodeErrorLora ? 'lora_missing_local' : 'lora_missing_remote');
    assert.equal(tag(findNodeErrorLora(LOCAL_400.node_errors)), 'lora_missing_local');
    assert.equal(tag(null), 'lora_missing_remote');
});

// ── 3. STOP no-ops on a job the registry already dropped ─────────────────────
// Mirrors cancelRunningCueJob's lookup against activeGenerations + _lanes.
function makeWorld() {
    return {
        registry: [],                                  // activeGenerations.list()
        lanes: { remote: { active: null }, local: { active: null } },
        drained: [],
    };
}

function cancelRunningCueJob(world, queueJobId, { withFix }) {
    if (!queueJobId) return false;
    const entry = world.registry.find(e => e.queueJobId === queueJobId && e.status === 'running');
    if (!entry) {
        if (!withFix) return false;                    // the bug: silent no-op
        const lane = world.lanes.remote.active?.queueJobId === queueJobId ? 'remote'
            : world.lanes.local.active?.queueJobId === queueJobId ? 'local'
            : null;
        if (!lane) return false;
        world.lanes[lane].active = null;               // _onLaneDrain
        world.drained.push(lane);
        return true;
    }
    return true;
}

// The exact post-400 state: exec.onError deleted the registry entry, the lane
// intent that the panel renders RUNNING from is still set.
function stateAfterFailedPrompt() {
    const w = makeWorld();
    w.lanes.local.active = { queueJobId: 'q1' };       // panel shows this as RUNNING
    w.registry = [];                                   // activeGenerations.end() already ran
    return w;
}

test('STOP silently no-ops on the orphaned card (the reported bug)', () => {
    const w = stateAfterFailedPrompt();
    assert.equal(cancelRunningCueJob(w, 'q1', { withFix: false }), false);
    assert.deepEqual(w.lanes.local.active, { queueJobId: 'q1' }); // card stays forever
});

test('STOP drains the orphaned lane once the fallback exists', () => {
    const w = stateAfterFailedPrompt();
    assert.equal(cancelRunningCueJob(w, 'q1', { withFix: true }), true);
    assert.equal(w.lanes.local.active, null);          // card clears
    assert.deepEqual(w.drained, ['local']);            // and job 2 can promote
});

test('a healthy running job still routes through the registry, not the fallback', () => {
    const w = makeWorld();
    w.lanes.local.active = { queueJobId: 'q1' };
    w.registry = [{ queueJobId: 'q1', status: 'running' }];
    assert.equal(cancelRunningCueJob(w, 'q1', { withFix: true }), true);
    assert.deepEqual(w.drained, []);                   // fallback NOT taken
    assert.deepEqual(w.lanes.local.active, { queueJobId: 'q1' });
});

test('fallback does not fire for an unknown id', () => {
    const w = stateAfterFailedPrompt();
    assert.equal(cancelRunningCueJob(w, 'nope', { withFix: true }), false);
    assert.deepEqual(w.drained, []);
});
