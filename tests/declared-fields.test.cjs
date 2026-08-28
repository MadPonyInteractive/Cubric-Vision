// MPI-580 — the declared-field vocabulary is now shared by the flow frame and by a
// plugin's controls in the History Upscale dropdown. Two things must hold or a
// control lies about what it sends:
//   1. `mapTo` maps the UI range onto the graph range (a slider reading 0-1 over
//      sigmas 0.50-0.85 must send 0.675 at UI 0.5, not 0.5).
//   2. the `Input_` prefix routes a value into injectionParams, everything else
//      reaches the op as a top-level run input.
// The renderer itself is DOM and is verified in the app; this is the arithmetic and
// the routing law, which are what silently produce a wrong generation.
const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const { mapDeclaredValue, splitDeclaredValues, isInjectionParam } =
        await imp('js/utils/declaredFields.js');

    const denoise = { id: 'Input_Denoise', type: 'slider', min: 0, max: 1, mapTo: [0.50, 0.85] };
    const cfg     = { id: 'Input_Cfg',     type: 'slider', min: 0, max: 1, mapTo: [1, 3] };

    // The mid point and both ends. 0.675 is the sigma default MPI-568 measured.
    assert.strictEqual(mapDeclaredValue(denoise, 0.5), 0.675);
    assert.strictEqual(mapDeclaredValue(denoise, 0), 0.50);
    assert.strictEqual(mapDeclaredValue(denoise, 1), 0.85);
    // cfg defaults to the NO-GUIDANCE end on purpose (Fabio, MPI-568) — UI 0 is cfg 1.
    assert.strictEqual(mapDeclaredValue(cfg, 0), 1);
    assert.strictEqual(mapDeclaredValue(cfg, 1), 3);

    // Out of range clamps rather than extrapolating: a stored value from an older
    // declaration must never push the graph past what the model survives.
    assert.strictEqual(mapDeclaredValue(denoise, 5), 0.85);
    assert.strictEqual(mapDeclaredValue(denoise, -3), 0.50);

    // No mapping declared = value untouched. This is the common case and must not
    // silently become a number.
    assert.strictEqual(mapDeclaredValue({ id: 'positive' }, 'a cat'), 'a cat');
    assert.strictEqual(mapDeclaredValue({ id: 'x', mapTo: [0, 1] }, 'not a number'), 'not a number');

    // MPI-645 — an UNMAPPED numeric field is still clamped to its declared range,
    // because the widget only clamps what the user drags. A value below the floor
    // reaches here from a persisted card or a Reuse made before the floor moved
    // (drama-box's `Input_Duration` went 1 -> 4), and the slider would render the new
    // floor while the run sent the old number.
    const dur = { id: 'Input_Duration', type: 'slider', min: 4, max: 30, step: 1, default: 5 };
    assert.strictEqual(mapDeclaredValue(dur, 1), 4);
    assert.strictEqual(mapDeclaredValue(dur, 99), 30);
    assert.strictEqual(mapDeclaredValue(dur, 7), 7);
    // A non-numeric field with a `min` is NOT a numeric field — no coercion.
    assert.strictEqual(mapDeclaredValue({ id: 'positive', type: 'text', min: 3 }, 'hi'), 'hi');

    // The routing law.
    assert.ok(isInjectionParam('Input_Denoise'));
    assert.ok(isInjectionParam('input_denoise'));
    assert.ok(!isInjectionParam('positive'));

    const { inputs, injectionParams } = splitDeclaredValues(
        [denoise, cfg, { id: 'positive', type: 'text' }],
        { Input_Denoise: 0.5, Input_Cfg: 0.5, positive: 'sharp detail' },
    );
    assert.deepStrictEqual(inputs, { positive: 'sharp detail' });
    assert.deepStrictEqual(injectionParams, { Input_Denoise: 0.675, Input_Cfg: 2 });

    // A value with no matching declaration still routes by its id — the law is the
    // prefix, not the declaration list.
    const stray = splitDeclaredValues([], { Input_Seed: 42, negative: 'blur' });
    assert.deepStrictEqual(stray.injectionParams, { Input_Seed: 42 });
    assert.deepStrictEqual(stray.inputs, { negative: 'blur' });

    console.log('ok — declared fields: hidden mapping + Input_ routing');
})();
