'use strict';

// MPI-229 UX safety net — a LoRA genuinely absent on the remote Pod makes ComfyUI
// return value_not_in_list on lora_name. After the basename-rewrite in
// _uploadRemoteModels the only remaining cause is a not-uploaded LoRA, which is
// user-actionable → a warning toast, not the GitHub bug-report dialog. This pins
// the detection regex + basename extraction used in comfyController.js ~L1320.

const assert = require('node:assert/strict');
const test = require('node:test');

// Replica of the source detection.
function detect(comfyBody) {
    const m = /value not in list:\s*lora_name:\s*'([^']+)'/i.exec(comfyBody || '');
    if (!m) return null;
    return { code: 'lora_missing_remote', loraName: m[1].split(/[\\/]/).pop() };
}

test('subfoldered missing LoRA → code + basename', () => {
    const body = "* MpiLoraModel 2596:\n  - Value not in list: lora_name: 'CHROMA/Rossifi-Ds5-E309.safetensors' not in (list of length 223)";
    const r = detect(body);
    assert.equal(r.code, 'lora_missing_remote');
    assert.equal(r.loraName, 'Rossifi-Ds5-E309.safetensors');
});

test('backslash path also yields the basename', () => {
    const r = detect("Value not in list: lora_name: 'CHROMA\\\\Liora-Ds1.safetensors' not in (...)");
    assert.equal(r.loraName, 'Liora-Ds1.safetensors');
});

test('top-level (no subfolder) name passes through', () => {
    const r = detect("Value not in list: lora_name: 'Sofia-Ds6.safetensors' not in (...)");
    assert.equal(r.loraName, 'Sofia-Ds6.safetensors');
});

test('an unrelated validation error does NOT trigger the LoRA toast', () => {
    assert.equal(detect("Value not in list: ckpt_name: 'foo.safetensors' not in (...)"), null);
    assert.equal(detect('Prompt outputs failed validation'), null);
    assert.equal(detect(null), null);
});
