// MPI-311. History cards label pixel dimensions with the nearest NAMED aspect
// ratio (768×1280 → "5:8"), so a card echoes the ratio vocabulary the picker
// speaks instead of an arbitrary reduced fraction.
//
// The invariant worth guarding is that this is NEAREST-WINS, not a fixed
// tolerance. A fixed one cannot work: the named entries are unevenly spaced
// (9:21↔2.39:1 are 1.2% apart, 4:5↔1:1 are 11.1% apart), so any single
// threshold loose enough for 768×1280 — 4.17% off its true nearest — would
// also let the two cinema ratios swallow each other. Regressing this to a
// tolerance breaks one end or the other, and the 768×1280 case below is the
// one that motivated the feature.

const assert = require('node:assert');
const test = require('node:test');

test('nearest named ratio resolves to the label the picker speaks', async () => {
    const { nearestNamedRatio } = await import('../js/utils/ratios.js');

    // The motivating case: 0.6 sits between 9:16 (0.5625) and 5:8 (0.625),
    // nearer 5:8 by 4.17% vs 6.25%. A 3% tolerance regressed this to "3:5".
    assert.strictEqual(nearestNamedRatio(768, 1280), '5:8');

    // Exact table hits, both orientations.
    assert.strictEqual(nearestNamedRatio(1024, 1024), '1:1');
    assert.strictEqual(nearestNamedRatio(1920, 1080), '16:9');
    assert.strictEqual(nearestNamedRatio(1080, 1920), '9:16');
    assert.strictEqual(nearestNamedRatio(1936, 1088), '16:9');

    // Imported image (user-reported): 1792×2400 = 0.7467, 0.4% off 3:4.
    assert.strictEqual(nearestNamedRatio(1792, 2400), '3:4');

    // Off-grid model output. 1280×704 = 1.8182 is genuinely nearer 1.85:1
    // (1.7%) than 16:9 (2.3%). Correct arithmetic, and the consequence of
    // keeping cinema ratios in the same table — asserted so it stays deliberate.
    assert.strictEqual(nearestNamedRatio(1280, 704), '1.85:1');

    // The two crowded cinema entries must not swallow each other.
    assert.strictEqual(nearestNamedRatio(2390, 1000), '2.39:1');
    assert.strictEqual(nearestNamedRatio(2333, 1000), '21:9');
});

test('unnamed shapes fall back to a reduced fraction rather than a wrong label', async () => {
    const { nearestNamedRatio } = await import('../js/utils/ratios.js');

    // 0.9 sits in the 4:5 <-> 1:1 void, >11% from both — nothing named is
    // plausible, so say what it actually is.
    assert.strictEqual(nearestNamedRatio(900, 1000), '9:10');

    // Extreme panorama, far past 2.39:1 — never clamped to a named entry.
    assert.strictEqual(nearestNamedRatio(4000, 500), '8:1');

    // Near-square IS 1:1 under nearest-wins (0.1% off), not a fallback.
    assert.strictEqual(nearestNamedRatio(1000, 999), '1:1');
});

test('missing dimensions return null instead of dividing by zero', async () => {
    const { nearestNamedRatio } = await import('../js/utils/ratios.js');

    // projectModel.js defaults pixelDimensions to {w:0,h:0}, and history cards
    // already render "?×?" for that case — 0 means absent, never a divisor.
    assert.strictEqual(nearestNamedRatio(0, 0), null);
    assert.strictEqual(nearestNamedRatio(768, 0), null);
    assert.strictEqual(nearestNamedRatio(undefined, undefined), null);
    assert.strictEqual(nearestNamedRatio(NaN, 100), null);
    assert.strictEqual(nearestNamedRatio(-768, 1280), null);
});

// The mask paste-warning gate (MpiGroupHistoryBlock): a pasted mask layer is
// STRETCHED to the target canvas, so only a differing ASPECT distorts it —
// a pure resolution change is a clean scale and must not warn.
function _distorts(src, dst) {
    const known = !!(src?.w && src?.h && dst?.w && dst?.h);
    return known
        && Math.abs((src.w / src.h) - (dst.w / dst.h)) / (dst.w / dst.h) > 0.01;
}

test('paste warning fires on aspect change, not on a clean rescale', () => {
    // Pure 2x upscale — same shape, no warning. This is the case that made
    // resolution-equality the wrong check.
    assert.strictEqual(_distorts({ w: 1024, h: 1024 }, { w: 2048, h: 2048 }), false);
    assert.strictEqual(_distorts({ w: 768, h: 1280 }, { w: 1536, h: 2560 }), false);

    // Real shape change — warn.
    assert.strictEqual(_distorts({ w: 768, h: 1280 }, { w: 1024, h: 1024 }), true);
    assert.strictEqual(_distorts({ w: 1920, h: 1080 }, { w: 1080, h: 1920 }), true);

    // Off-grid pair that is the same shape in practice (0.4% apart) — the 1%
    // slack must absorb it rather than nagging on every near-16:9 paste.
    assert.strictEqual(_distorts({ w: 1920, h: 1080 }, { w: 1936, h: 1088 }), false);

    // Unknown dims on either side are NOT "no distortion" — the caller warns
    // on !known, so this predicate must not report a confident false.
    assert.strictEqual(_distorts({ w: 0, h: 0 }, { w: 1024, h: 1024 }), false);
    assert.strictEqual(_distorts(null, { w: 1024, h: 1024 }), false);
});

test('every named ratio round-trips from its own canonical pixel size', async () => {
    const { CROP_RATIOS, nearestNamedRatio } = await import('../js/utils/ratios.js');

    // Synthesise exact pixels for each entry and confirm it labels itself.
    // Catches a table edit that makes two entries collide.
    for (const r of [...CROP_RATIOS.portrait, ...CROP_RATIOS.landscape]) {
        const h = 1000;
        const w = Math.round(r.ratio * h);
        assert.strictEqual(
            nearestNamedRatio(w, h), r.label,
            `${r.label} (${w}×${h}) must label itself, not a neighbour`,
        );
    }
});
