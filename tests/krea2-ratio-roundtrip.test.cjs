// Krea2 is the first 'quality-orientation' model: its ratio set is keyed by tier
// AND orientation. Before MPI-242's sweep, the two persistence paths each dropped
// one axis:
//
//   generationService  wrote `orientation: null` into the sidecar's controlState
//                      (it treated every tier-keyed model as pure-quality, which
//                      has no orientation concept). The reuse fast path replays
//                      controlState verbatim, so the null propagated.
//   promptReuse        the LEGACY derive path (pre-controlState sidecars) recovered
//                      qualityTier but never orientation, and searched a hardcoded
//                      ['very_low'...'very_high'] list containing neither '1k' nor
//                      '2k' — so the tier was lost too. That list also has no '4k',
//                      so LTX 4K clips already lost their tier before Krea2 existed.
//
// Result: reusing a 2K landscape Krea2 image restored a 1K portrait one, silently.
// This exercises the real buildPromptReuseSettings against the real ratio tables.

const assert = require('node:assert');
const test = require('node:test');

const KREA2 = { id: 'krea2-turbo', type: 'krea2', mediaType: 'image' };
const LTX = { id: 'ltx', type: 'ltx', mediaType: 'video' };
const SDXL = { id: 'sdxl-realistic', type: 'sdxl', mediaType: 'image' };

/** A LEGACY sidecar (no controlState) — forces the reverse-derive path. */
function legacy({ w, h, label, operation = 't2i' }) {
    return {
        item: { pixelDimensions: { w, h }, ratioLabel: label },
        injectionParams: { Width: w, Height: h, Ratio_Label: label },
        operation,
    };
}

const rsOf = (out) => out.sharedUpdates?.ratioSelector;

test('a 2K landscape Krea2 image round-trips both axes', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');

    // 16:9 @ 2k landscape — the case that used to come back as 1k portrait.
    const rs = rsOf(buildPromptReuseSettings(legacy({ w: 1936, h: 1088, label: '16:9' }), KREA2));

    assert.ok(rs, 'reuse must produce a ratioSelector');
    assert.strictEqual(rs.selectedRatio, '16:9', 'framing label must survive');
    assert.strictEqual(rs.orientation, 'landscape',
        'orientation must survive — it used to be dropped for tier-keyed models');
    assert.strictEqual(rs.qualityTier, '2k',
        'tier must survive — the old hardcoded tier list had no "2k"');
});

test('tier and orientation are recovered from dimensions alone', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');

    // Same label across tiers/orientations; only the pixels distinguish them.
    const cases = [
        { w: 1024, h: 1024, label: '1:1', tier: '1k', orientation: 'portrait' },
        { w: 1472, h: 1472, label: '1:1', tier: '2k', orientation: 'portrait' },
        { w: 768, h: 1344, label: '9:16', tier: '1k', orientation: 'portrait' },
        { w: 1088, h: 1936, label: '9:16', tier: '2k', orientation: 'portrait' },
        { w: 1344, h: 768, label: '16:9', tier: '1k', orientation: 'landscape' },
        { w: 1936, h: 1088, label: '16:9', tier: '2k', orientation: 'landscape' },
        { w: 1152, h: 896, label: '4:3', tier: '1k', orientation: 'landscape' },
        { w: 1664, h: 1248, label: '4:3', tier: '2k', orientation: 'landscape' },
    ];

    for (const c of cases) {
        const rs = rsOf(buildPromptReuseSettings(legacy(c), KREA2));
        assert.strictEqual(rs.qualityTier, c.tier,
            `${c.w}x${c.h} (${c.label}) should recover tier ${c.tier}, got ${rs.qualityTier}`);
        assert.strictEqual(rs.orientation, c.orientation,
            `${c.w}x${c.h} should recover ${c.orientation}, got ${rs.orientation}`);
        assert.strictEqual(rs.selectedRatio, c.label);
    }
});

test('the reuse fast path replays a sidecar that carries a real orientation', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');

    // What generationService now snapshots for a 2k landscape Krea2 gen. Before the
    // fix `orientation` here was null, and the fast path faithfully replayed the null.
    const withControlState = {
        operation: 't2i',
        generationSettings: {
            controlState: {
                shared: { ratioSelector: { selectedRatio: '16:9', orientation: 'landscape' } },
                model: { qualityTier: '2k' },
            },
        },
    };
    const out = buildPromptReuseSettings(withControlState, KREA2);
    assert.strictEqual(out.sharedUpdates.ratioSelector.orientation, 'landscape');
    assert.strictEqual(out.sharedUpdates.ratioSelector.selectedRatio, '16:9');
    assert.strictEqual(out.modelUpdates.qualityTier, '2k');
});

test('a pure-quality model still gets no orientation', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');
    // ltx very_high 16:9 = 1920x1088.
    const rs = rsOf(buildPromptReuseSettings(
        legacy({ w: 1920, h: 1088, label: '16:9', operation: 't2v' }), LTX));

    assert.strictEqual(rs.qualityTier, 'very_high');
    assert.ok(!rs.orientation, 'a pure-quality model must not gain an orientation');
});

test('an orientation model still gets no tier', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');
    const rs = rsOf(buildPromptReuseSettings(legacy({ w: 1152, h: 896, label: '4:3' }), SDXL));

    assert.strictEqual(rs.orientation, 'landscape');
    assert.ok(!rs.qualityTier, 'an orientation-only model must not gain a tier');
});

test('ltx 4K recovers its tier (the old hardcoded list stopped at very_high)', async () => {
    const { buildPromptReuseSettings } = await import('../js/utils/promptReuse.js');
    // 4k 16:9 = 3840x2176. The pre-existing QUALITY_TIERS list had no '4k', so this
    // fell through and lost the tier. Fixed by searching qualityTiersFor(type).
    const rs = rsOf(buildPromptReuseSettings(
        legacy({ w: 3840, h: 2176, label: '16:9', operation: 't2v' }), LTX));

    assert.strictEqual(rs.qualityTier, '4k', 'ltx 4k must be recoverable');
});
