// A `scope: 'perModel'` prompt-box control emits `settings:model:update` with
// opName: null. projectService only routes such a write when the key is in
// _MODEL_WIDE_KEYS — otherwise it logs a warning and DROPS the value. The two
// lists are declared in different files with nothing tying them together, so a
// new perModel control persists nothing and nobody notices until a reload.
//
// MPI-242 shipped three such controls (styleSelect, stylization, enhancePrompt).
// All three were dropped. This guard makes that failure mode impossible.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const CONTROLS = path.join(ROOT, 'js/components/Organisms/MpiPromptBox/PromptBoxControls.js');
const SERVICE = path.join(ROOT, 'js/services/projectService.js');
const GENSERVICE = path.join(ROOT, 'js/services/generationService.js');

/** Control ids declared with `scope: 'perModel'`, read from the source. */
function perModelKeys(src) {
    const keys = [];
    // Each control is `<id>: {` ... `scope: 'perModel'` before the next control.
    const re = /^\s{4}(\w+):\s*\{$/gm;
    const starts = [...src.matchAll(re)].map(m => ({ id: m[1], at: m.index }));
    for (let i = 0; i < starts.length; i++) {
        const body = src.slice(starts[i].at, starts[i + 1]?.at ?? src.length);
        if (/scope:\s*'perModel'/.test(body)) keys.push(starts[i].id);
    }
    return keys;
}

/** The literal contents of the _MODEL_WIDE_KEYS Set. */
function modelWideKeys(src) {
    const m = src.match(/_MODEL_WIDE_KEYS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(m, '_MODEL_WIDE_KEYS Set literal not found in projectService.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('every perModel control key is allowlisted in _MODEL_WIDE_KEYS', () => {
    const declared = perModelKeys(fs.readFileSync(CONTROLS, 'utf8'));
    const allowed = new Set(modelWideKeys(fs.readFileSync(SERVICE, 'utf8')));

    assert.ok(declared.length > 0, 'parsed zero perModel controls — the regex has drifted');

    const dropped = declared.filter(k => !allowed.has(k));
    assert.deepStrictEqual(
        dropped, [],
        `perModel control(s) ${dropped.map(k => `"${k}"`).join(', ')} are missing from `
        + '_MODEL_WIDE_KEYS in js/services/projectService.js. Their writes are silently '
        + 'discarded (projectService logs "missing opName for non-model-wide key") and the '
        + 'value never reaches project.json or the sidecar. Add them to the Set.',
    );
});

/**
 * Keys generationService copies from modelSettings into `controlState.model`.
 * Two spellings: `if ('x' in _ms) _model.x = ...` and a `for (const _k of [...])`
 * loop. Persisting a key is NOT enough — a key absent here never reaches the
 * sidecar, so Reuse Prompt silently drops it.
 */
function snapshottedKeys(src) {
    const keys = [...src.matchAll(/if \('(\w+)' in _ms\)/g)].map(m => m[1]);
    const loop = src.match(/for \(const _k of \[([^\]]*)\]\)\s*\{\s*if \(_k in _ms\)/);
    if (loop) keys.push(...[...loop[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
    return keys;
}

test('every perModel control key is snapshotted into controlState.model', () => {
    // The sidecar is the ONLY input to Reuse Prompt. MPI-242's styleSelect /
    // stylization / enhancePrompt persisted correctly (guarded above) yet never
    // reached controlState.model, so reuse restored the prompt but silently lost
    // the style, its strength, and the enhancer flag.
    const declared = perModelKeys(fs.readFileSync(CONTROLS, 'utf8'));
    const snapshotted = new Set(snapshottedKeys(fs.readFileSync(GENSERVICE, 'utf8')));

    assert.ok(snapshotted.size > 0, 'parsed zero snapshotted keys — the regex has drifted');

    const dropped = declared.filter(k => !snapshotted.has(k));
    assert.deepStrictEqual(
        dropped, [],
        `perModel control(s) ${dropped.map(k => `"${k}"`).join(', ')} are never copied into `
        + 'controlState.model in js/services/generationService.js. They persist to project.json '
        + 'but never reach the sidecar, so Reuse Prompt silently drops them. Add them to the '
        + 'snapshot beside loras/upscaleModel/qualityTier.',
    );
});

test('the three MPI-242 controls are perModel and allowlisted', () => {
    // Pins the specific regression: if someone re-scopes or removes one, this
    // fails loudly rather than silently changing where the value is stored.
    const declared = new Set(perModelKeys(fs.readFileSync(CONTROLS, 'utf8')));
    const allowed = new Set(modelWideKeys(fs.readFileSync(SERVICE, 'utf8')));
    for (const k of ['styleSelect', 'stylization', 'enhancePrompt']) {
        assert.ok(declared.has(k), `${k} should be scope:'perModel'`);
        assert.ok(allowed.has(k), `${k} must be in _MODEL_WIDE_KEYS`);
    }
});
