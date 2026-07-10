// RATIO_MODES had TWO values for years, so every consumer wrote a binary test:
// `mode === 'quality'` with an implicit else, or `?? 'orientation'`. MPI-242 added
// a third ('quality-orientation', krea2), and each of those binaries silently
// mis-branched: the sidecar wrote orientation:null, Reuse Prompt dropped the
// framing, the orientation toggle vanished, and 2K was unreachable.
//
// Two invariants keep a fourth mode from repeating that:
//   1. Consumers ask usesOrientation()/usesQualityTier(), never `=== 'quality'`.
//   2. Every mode in RATIO_MODES resolves a real ratio table on both axes.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

// Files that branch on a model's ratio mode. ratios.js itself is exempt — it
// DEFINES the modes and the predicates.
const CONSUMERS = [
    'js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js',
    'js/components/Organisms/MpiPromptBox/PromptBoxControls.js',
    'js/components/Organisms/MpiPromptBox/MpiPromptBox.js',
    'js/services/generationService.js',
    'js/utils/promptReuse.js',
];

test('no consumer compares a ratio mode to a string literal', () => {
    // Only RATIO mode words. Other controls have their own `mode` locals
    // (audioMode's 'reference'/'original'), which this must not flag.
    const RATIO_MODE_WORDS = /'(orientation|quality|quality-orientation)'/;
    const offenders = [];
    for (const rel of CONSUMERS) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        src.split('\n').forEach((line, i) => {
            if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
            // `mode === 'quality'`, `RATIO_MODES[x] === 'orientation'`, `?? 'orientation'`
            const compares = /\b(mode|RATIO_MODES\[[^\]]+\])\s*([!=]==|\?\?)\s*['"]/.test(line);
            if (compares && RATIO_MODE_WORDS.test(line)) {
                offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
            }
        });
    }
    assert.deepStrictEqual(
        offenders, [],
        'Ratio mode compared to a string literal. RATIO_MODES has three values and a '
        + 'binary test silently mis-branches the third. Use usesOrientation(type) / '
        + `usesQualityTier(type) from js/utils/ratios.js instead:\n  ${offenders.join('\n  ')}`,
    );
});

test('every RATIO_MODES value resolves real ratios on both axes', async () => {
    const { RATIO_MODES, getModelRatios, qualityTiersFor, usesOrientation, usesQualityTier } =
        await import('../js/utils/ratios.js');

    const seen = new Set();
    for (const [type, mode] of Object.entries(RATIO_MODES)) {
        seen.add(mode);
        for (const tier of qualityTiersFor(type)) {
            for (const orientation of ['portrait', 'landscape']) {
                const ratios = getModelRatios(type, orientation, tier);
                assert.ok(Array.isArray(ratios) && ratios.length > 0,
                    `${type} (${mode}) @ ${tier}/${orientation} resolved no ratios`);
                for (const r of ratios) {
                    assert.ok(r.label, `${type} @ ${tier}/${orientation}: ratio without a label`);
                    // SOCIAL_RATIOS carries `ratio` instead of w/h; generation tables carry w/h.
                    assert.ok((r.w && r.h) || r.ratio,
                        `${type} @ ${tier}/${orientation}: ${r.label} has neither w/h nor ratio`);
                }
            }
        }
        // A tier-keyed model must actually vary by tier; an orientation-keyed one by orientation.
        if (usesQualityTier(type)) {
            const tiers = qualityTiersFor(type);
            assert.ok(tiers.length > 1, `${type} is tier-keyed but declares ${tiers.length} tier(s)`);
        }
        if (usesOrientation(type)) {
            const p = getModelRatios(type, 'portrait');
            const l = getModelRatios(type, 'landscape');
            assert.notDeepStrictEqual(p, l,
                `${type} is orientation-keyed but portrait === landscape`);
        }
    }

    // Guards the predicates themselves: each known mode must be classified.
    for (const mode of seen) {
        assert.ok(['orientation', 'quality', 'quality-orientation'].includes(mode),
            `unknown ratio mode "${mode}" — teach usesOrientation/usesQualityTier about it, `
            + 'then add it here');
    }
});

test('krea2 is keyed by BOTH tier and orientation', async () => {
    const { getModelRatios, usesOrientation, usesQualityTier, KREA2_RATIOS, FLUX_RATIOS } =
        await import('../js/utils/ratios.js');

    assert.ok(usesOrientation('krea2'), 'krea2 must have an orientation axis');
    assert.ok(usesQualityTier('krea2'), 'krea2 must have a quality axis');

    // The two axes are independent: changing either changes the pixels.
    const p1k = getModelRatios('krea2', 'portrait', '1k');
    const l1k = getModelRatios('krea2', 'landscape', '1k');
    const p2k = getModelRatios('krea2', 'portrait', '2k');

    assert.notDeepStrictEqual(p1k, l1k, 'orientation must change the ratio set');
    assert.notDeepStrictEqual(p1k, p2k, 'tier must change the ratio set');

    // 1:1 is orientation-free and appears in both lists, at the tier's own size.
    assert.strictEqual(p1k.find(r => r.label === '1:1').w, 1024);
    assert.strictEqual(l1k.find(r => r.label === '1:1').w, 1024);
    assert.strictEqual(p2k.find(r => r.label === '1:1').w, 1472);

    // Same label, different pixels across tiers — this is what lets a reused
    // framing survive a tier change (MPI-242 design decision).
    for (const label of ['3:4', '4:5', '5:8', '9:16']) {
        const a = p1k.find(r => r.label === label);
        const b = p2k.find(r => r.label === label);
        assert.ok(a && b, `both tiers must offer ${label} in portrait`);
        assert.notStrictEqual(a.w, b.w, `${label} must differ in width across tiers`);
    }

    // Every landscape entry is the exact transpose of a portrait twin.
    for (const tier of ['1k', '2k']) {
        const port = getModelRatios('krea2', 'portrait', tier);
        for (const l of getModelRatios('krea2', 'landscape', tier)) {
            if (l.w === l.h) continue; // square is orientation-free
            assert.ok(port.some(p => p.w === l.h && p.h === l.w),
                `${tier} landscape ${l.label} (${l.w}x${l.h}) has no portrait transpose`);
        }
    }

    // The 1k tier IS FLUX_RATIOS — shared by reference so the two cannot drift.
    assert.strictEqual(KREA2_RATIOS['1k'], FLUX_RATIOS,
        'krea2 1k must BE FLUX_RATIOS (same object), not a copy');

    // All dims /16-clean: an off-multiple edge silently circular-pads in the model.
    for (const tier of ['1k', '2k']) {
        for (const o of ['portrait', 'landscape']) {
            for (const r of getModelRatios('krea2', o, tier)) {
                assert.strictEqual(r.w % 16, 0, `${tier}/${o} ${r.label}: w=${r.w} not /16`);
                assert.strictEqual(r.h % 16, 0, `${tier}/${o} ${r.label}: h=${r.h} not /16`);
            }
        }
    }
});

test('ratio tables are deep-frozen (krea2 1k aliases FLUX_RATIOS)', async () => {
    const { KREA2_RATIOS, FLUX_RATIOS, SDXL_RATIOS, LTX_RATIOS } = await import('../js/utils/ratios.js');
    for (const [name, t] of [['KREA2', KREA2_RATIOS], ['FLUX', FLUX_RATIOS],
        ['SDXL', SDXL_RATIOS], ['LTX', LTX_RATIOS]]) {
        assert.ok(Object.isFrozen(t), `${name}_RATIOS must be frozen`);
        for (const v of Object.values(t)) {
            assert.ok(Object.isFrozen(v), `${name}_RATIOS sub-table must be frozen`);
        }
    }
    // The aliasing hazard: mutating FLUX must not rewrite KREA2's 1k tier.
    assert.throws(() => FLUX_RATIOS.portrait.push({ label: 'X' }), TypeError);
    assert.strictEqual(KREA2_RATIOS['1k'].portrait.length, 5);
});

test('a foreign tier never silently downgrades quality', async () => {
    const { getModelRatios } = await import('../js/utils/ratios.js');
    // ltx has no '1k' tier. Falling back to its FIRST tier would hand back
    // very_low (384px); it must land on 'medium' (512px) as it always did.
    assert.strictEqual(getModelRatios('ltx', undefined, '1k')[0].w, 512);
    assert.strictEqual(getModelRatios('ltx', undefined, undefined)[0].w, 512);
    // krea2 has no 'medium'; it has no 'medium' to fall back to either, so it
    // uses its own first tier (1k) rather than a hardcoded name.
    assert.strictEqual(getModelRatios('krea2', 'portrait', 'medium')[0].w, 1024);
    // wan keeps its long-standing medium default.
    assert.strictEqual(getModelRatios('wan', undefined, 'medium')[0].w, 624);
});
