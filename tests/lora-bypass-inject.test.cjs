'use strict';

// MPI-223 — Bypass toggle. A bypassed LoRA slot injects at ZERO strength (the node
// stays in the graph → no shape change / model reload) EXCEPT when the file is
// missing, where the slot is skipped entirely so a bypassed-but-gone LoRA never
// trips the missing-LoRA generation block.
//
// This replicates js/services/commandExecutor.js `_loraSlotParam` (that module is
// ESM with heavy deps; the routing test alongside uses the same replica approach).
// Keep in sync if the source helper changes.

const assert = require('node:assert/strict');
const test = require('node:test');

const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

// Replica of _loraSlotParam. `available` stands in for state.availableLoras; the
// resolver here is exact-match (the real one also unique-basename heals, but that
// path is orthogonal to bypass and covered elsewhere).
function loraSlotParam(slot, available) {
    if (!slot || !slot.name) return null;
    const list = available || [];
    const resolved = list.find(f => _pathKey(f) === _pathKey(slot.name)) || slot.name;
    if (slot.bypass) {
        const present = list.some(f => _pathKey(f) === _pathKey(resolved));
        if (!present) return null; // bypassed + gone → inject nothing, don't block
        return { lora_name: resolved, strength_model: 0, strength_clip: 0 };
    }
    return {
        lora_name: resolved,
        strength_model: slot.strengthModel ?? 1.0,
        strength_clip: slot.strengthClip ?? 1.0,
    };
}

const LORAS = ['Sofia-Ds6.safetensors', 'General/lenovo_chroma.safetensors'];

test('empty slot → null', () => {
    assert.equal(loraSlotParam({ name: null }, LORAS), null);
});

test('normal slot → saved strengths', () => {
    const p = loraSlotParam({ name: 'Sofia-Ds6.safetensors', strengthModel: 0.75, strengthClip: 0.8 }, LORAS);
    assert.deepEqual(p, { lora_name: 'Sofia-Ds6.safetensors', strength_model: 0.75, strength_clip: 0.8 });
});

test('bypassed + present file → injected at strength 0 (values NOT the saved 0.75)', () => {
    const p = loraSlotParam({ name: 'Sofia-Ds6.safetensors', strengthModel: 0.75, strengthClip: 0.8, bypass: true }, LORAS);
    assert.equal(p.lora_name, 'Sofia-Ds6.safetensors'); // node stays in graph
    assert.equal(p.strength_model, 0);
    assert.equal(p.strength_clip, 0);
});

test('bypassed + MISSING file → null (skipped, never hits the missing-LoRA block)', () => {
    const p = loraSlotParam({ name: 'Deleted-Lora.safetensors', strengthModel: 0.75, bypass: true }, LORAS);
    assert.equal(p, null);
});

test('missing file WITHOUT bypass → still emitted (so the normal missing-block fires)', () => {
    const p = loraSlotParam({ name: 'Deleted-Lora.safetensors', strengthModel: 0.9 }, LORAS);
    assert.equal(p.lora_name, 'Deleted-Lora.safetensors'); // emitted → _findMissingModel can block it
    assert.equal(p.strength_model, 0.9);
});
