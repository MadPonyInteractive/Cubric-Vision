'use strict';

// MPI-229 — a user LoRA name persisted during a Pod (Linux) session carries a
// FORWARD slash ('CHROMA/Rossifi-Ds5-E309.safetensors'). Reused on the local
// Windows engine, ComfyUI lists that file with a BACKSLASH → value_not_in_list
// 400. MPI-198 healed backslash→slash for non-Windows targets; this pins the
// INVERSE flip ('/'→'\\') for Windows-local so the separator matches the target
// engine regardless of which engine saved the value.
//
// Mirrors the heal block in js/services/comfyController.js ~L1164. Keep in sync.

const assert = require('node:assert/strict');
const test = require('node:test');

const PATH_INPUTS = ['lora_name', 'upscale_model', 'ckpt_name', 'unet_name', 'model_name', 'vae_name', 'clip_name'];
// MpiStyleLoras slots (MPI-359) — matched by shape, not by name.
const PATH_INPUT_RE = /^lora_\d+$/;

// Replica of the source heal loop. healToSlash === _needsPathHeal(alwaysLocal).
function heal(workflow, healToSlash) {
    for (const node of Object.values(workflow)) {
        if (!node || !node.inputs) continue;
        for (const k of Object.keys(node.inputs)) {
            if (!PATH_INPUTS.includes(k) && !PATH_INPUT_RE.test(k)) continue;
            const v = node.inputs[k];
            if (typeof v !== 'string') continue;
            if (healToSlash) {
                if (v.includes('\\')) node.inputs[k] = v.replace(/\\/g, '/');
            } else if (v.includes('/')) {
                node.inputs[k] = v.replace(/\//g, '\\');
            }
        }
    }
    return workflow;
}

test('Windows-local: forward-slash LoRA (saved on Pod) heals to backslash', () => {
    const wf = { '1': { inputs: { lora_name: 'CHROMA/Rossifi-Ds5-E309.safetensors' } } };
    heal(wf, false);
    assert.equal(wf['1'].inputs.lora_name, 'CHROMA\\Rossifi-Ds5-E309.safetensors');
});

test('Linux/remote: backslash LoRA heals to forward-slash (MPI-198 still holds)', () => {
    const wf = { '1': { inputs: { lora_name: 'CHROMA\\Rossifi-Ds5-E309.safetensors' } } };
    heal(wf, true);
    assert.equal(wf['1'].inputs.lora_name, 'CHROMA/Rossifi-Ds5-E309.safetensors');
});

test('Windows-local: native backslash value is left untouched (no over-flip)', () => {
    const wf = { '1': { inputs: { lora_name: 'LTX2.3\\Detailer.safetensors' } } };
    heal(wf, false);
    assert.equal(wf['1'].inputs.lora_name, 'LTX2.3\\Detailer.safetensors');
});

test('Windows-local: top-level (no subfolder) value has no separator to flip', () => {
    const wf = { '1': { inputs: { lora_name: 'Sofia-Ds6.safetensors' } } };
    heal(wf, false);
    assert.equal(wf['1'].inputs.lora_name, 'Sofia-Ds6.safetensors');
});

test('all PATH_INPUTS get the same treatment, not just lora_name', () => {
    const wf = { '1': { inputs: { ckpt_name: 'sub/model.safetensors', upscale_model: 'up/x.pth' } } };
    heal(wf, false);
    assert.equal(wf['1'].inputs.ckpt_name, 'sub\\model.safetensors');
    assert.equal(wf['1'].inputs.upscale_model, 'up\\x.pth');
});

test('MpiStyleLoras slots heal like lora_name (MPI-359)', () => {
    // The style rack bakes subfoldered paths into lora_1..lora_5. Before MPI-359 those
    // same paths sat on a `lora_name` widget and healed; the new node names its slots
    // by index, so a name-list-only heal would ship 'krea-2\\style\\x' to a Linux Pod
    // and 400 with value_not_in_list — a style picker that works on Windows only.
    const wf = { '1': { inputs: {
        lora_1: 'krea-2\\style\\krea2_darkbrush.safetensors',
        lora_5: 'None',
        selector: 3,
        strength_model: 1,
    } } };
    heal(wf, true);
    assert.equal(wf['1'].inputs.lora_1, 'krea-2/style/krea2_darkbrush.safetensors');
    assert.equal(wf['1'].inputs.lora_5, 'None');
    assert.equal(wf['1'].inputs.selector, 3);
});

test('MpiStyleLoras slots flip back on Windows-local', () => {
    const wf = { '1': { inputs: { lora_2: 'qwen/styles/Qwen-Anime-V2.safetensors' } } };
    heal(wf, false);
    assert.equal(wf['1'].inputs.lora_2, 'qwen\\styles\\Qwen-Anime-V2.safetensors');
});

test('non-string / missing inputs do not throw', () => {
    const wf = { '1': { inputs: { lora_name: null } }, '2': {}, '3': { inputs: {} } };
    assert.doesNotThrow(() => heal(wf, false));
});
