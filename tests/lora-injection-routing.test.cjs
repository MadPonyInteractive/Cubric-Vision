'use strict';

// MPI-219 — LoRA-object injection must recognize BOTH the bare key (Lora_1,
// Lora_High_1) and the tier-2 alias the MPI-127 pass emits (Input_Lora_1,
// Input_Lora_High_1). Flat-lora workflows (Chroma, LTX) and staged ones (WAN)
// title their nodes Input_Lora_*, so ONLY the aliased key finds a node. If the
// regex rejects the alias, injection falls to the generic writer which dumps the
// whole {lora_name,strength_model,strength_clip} object into node.inputs.lora_name
// → ComfyUI 400 "Value not in list: lora_name: {dict}".
//
// This pins the routing contract (the regex) + the field-by-field write, mirroring
// the block in js/services/comfyController.js ~L1116. Keep in sync if that changes.

const assert = require('node:assert/strict');
const test = require('node:test');

// The regex under test — copy of the source predicate.
const LORA_KEY = /^(?:Input_)?Lora_(?:[A-Za-z]+_)?\d+$/i;

// Minimal replica of the inject loop's LoRA vs _inject routing + field write.
function injectOne(key, val, nodeInputs) {
    if (LORA_KEY.test(key) && typeof val === 'object' && val !== null &&
        'lora_name' in val && 'strength_model' in val && 'strength_clip' in val) {
        if ('lora_name' in nodeInputs) nodeInputs.lora_name = val.lora_name;
        if ('strength_model' in nodeInputs) nodeInputs.strength_model = parseFloat(val.strength_model);
        if ('strength_clip' in nodeInputs) nodeInputs.strength_clip = parseFloat(val.strength_clip);
        return 'lora';
    }
    // generic _inject: writes the raw val into any matching target field
    if ('lora_name' in nodeInputs) nodeInputs.lora_name = val;
    return 'generic';
}

test('LoRA keys route to the field-by-field writer (bare + Input_ alias, flat + staged)', () => {
    for (const key of ['Lora_1', 'Input_Lora_1', 'Lora_High_1', 'Input_Lora_High_1', 'Lora_Low_6', 'Input_Lora_Low_6']) {
        assert.equal(LORA_KEY.test(key), true, `${key} must match the LoRA regex`);
    }
});

test('non-LoRA keys do NOT route to the LoRA writer', () => {
    for (const key of ['Input_Image', 'Seed', 'Positive', 'Upscale_Model', 'Input_Video_Latent']) {
        assert.equal(LORA_KEY.test(key), false, `${key} must NOT match the LoRA regex`);
    }
});

test('aliased Input_Lora_1 writes the lora_name STRING, not the object (the MPI-219 bug)', () => {
    const val = { lora_name: 'Sofia-Ds6.safetensors', strength_model: 0.75, strength_clip: 1 };
    const node = { lora_name: 'None', strength_model: 1 }; // 3-input MpiLoraModel, no strength_clip
    const branch = injectOne('Input_Lora_1', val, node);
    assert.equal(branch, 'lora');
    assert.equal(node.lora_name, 'Sofia-Ds6.safetensors'); // string, NOT the dict
    assert.equal(node.strength_model, 0.75);               // real value, not template 1/None
});
