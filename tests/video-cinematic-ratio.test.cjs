// 21:9 cinematic entries on the video ratio tables (MPI-551).
//
// Two failure modes this locks down, both of which bit during implementation and
// neither of which any existing test caught:
//
//   1. A tier silently getting two 21:9 entries (or none) while the table total
//      still looks right — `low` is a SUBSTRING of `very_low`, so a naive key
//      search lands in the wrong array.
//   2. A value drifting off the model's grid. Each model quantises differently
//      (LTX /64 because its 2-stage pipeline FLOORS the halved size; H3 /64 for
//      exactly the same reason since it went two-pass; the 5B /32; WAN 14B /16),
//      and an off-grid value does not error — it silently renders at a size that
//      mismatches the label the user picked.
//
// H3 WAS /32 HERE UNTIL MPI-687 and that was stale, not a judgement: it became a
// 2-stage FLOORing pipeline on 2026-09-03 and the constant did not move with it.
// A /32 H3 value renders 32px short of its label, which is what shipped.
//
// Also guards the H3 2k/4k "Experimental - High VRAM" note, which must sit on
// EVERY ratio in those tiers, not just the cinematic one.

const test = require('node:test');
const assert = require('node:assert');

const RATIOS = 'file:///' + require('node:path')
    .resolve(__dirname, '../js/utils/ratios.js').replace(/\\/g, '/');

// grid divisor per table — the constraint each model's pipeline actually enforces
const GRID = { WAN_RATIOS: 16, WAN_5B_RATIOS: 32, LTX_RATIOS: 64, MINIMAX_H3_RATIOS: 64 };

test('every video tier has exactly one 21:9 entry', async () => {
    const mod = await import(RATIOS);
    for (const name of Object.keys(GRID)) {
        for (const [tier, arr] of Object.entries(mod[name])) {
            const hits = arr.filter(r => r.label === '21:9');
            assert.strictEqual(hits.length, 1,
                `${name}.${tier} has ${hits.length} 21:9 entries, expected exactly 1`);
        }
    }
});

test('every 21:9 entry is on its model grid', async () => {
    const mod = await import(RATIOS);
    for (const [name, g] of Object.entries(GRID)) {
        for (const [tier, arr] of Object.entries(mod[name])) {
            const r = arr.find(x => x.label === '21:9');
            assert.strictEqual(r.w % g, 0, `${name}.${tier} width ${r.w} not /${g}`);
            assert.strictEqual(r.h % g, 0, `${name}.${tier} height ${r.h} not /${g}`);
        }
    }
});

test('21:9 is wider than the same tier 16:9, and lands near scope', async () => {
    const mod = await import(RATIOS);
    for (const name of Object.keys(GRID)) {
        for (const [tier, arr] of Object.entries(mod[name])) {
            const c = arr.find(x => x.label === '21:9');
            const w = arr.find(x => x.label === '16:9');
            const ratio = c.w / c.h;
            assert.ok(ratio > w.w / w.h,
                `${name}.${tier} 21:9 (${ratio.toFixed(2)}) not wider than its 16:9`);
            // Grid quantisation makes pixel-exact 21:9 impossible at small sizes;
            // the band matches the spread the 16:9 tiers already ship with.
            assert.ok(ratio >= 2.25 && ratio <= 2.55,
                `${name}.${tier} 21:9 ratio ${ratio.toFixed(2)} outside 2.25-2.55`);
        }
    }
});

test('21:9 megapixels rise monotonically across tiers', async () => {
    const mod = await import(RATIOS);
    const ORDER = ['very_low', 'low', 'medium', 'high', 'very_high', '2k', '4k'];
    for (const name of Object.keys(GRID)) {
        let prev = 0, prevTier = null;
        for (const tier of ORDER) {
            const arr = mod[name][tier];
            if (!arr) continue;
            const r = arr.find(x => x.label === '21:9');
            const mp = r.w * r.h;
            assert.ok(mp > prev,
                `${name}.${tier} (${mp}px) is not larger than ${prevTier} (${prev}px)`);
            prev = mp; prevTier = tier;
        }
    }
});

// The 2K/4K tier hint is PER MODEL. The shared default describes LTX's measured
// res/motion tradeoff; H3's 2K/4K problem is VRAM, not motion (MPI-549), so the
// two must not share a string. This is the check that would have caught H3
// showing "detail-focused, low motion" — a claim about a different model.
test('H3 2k/4k show the high-VRAM hint, not LTX motion text', async () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').resolve(
        __dirname, '../js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js'), 'utf8');

    const block = src.slice(src.indexOf('const QUALITY_TIER_HINT'));
    const h3 = block.slice(block.indexOf('h3:'), block.indexOf('};'));
    for (const tier of ["'2k'", "'4k'"]) {
        assert.ok(h3.includes(tier), `H3 hint map is missing ${tier}`);
    }
    assert.ok(h3.includes('Experimental - High VRAM'),
        'H3 tiers must show the high-VRAM caveat');
    assert.ok(!/motion/i.test(h3),
        'H3 must not carry the motion hint — that is LTX research');

    // ASCII: the hint lands in an HTML data-info attribute.
    for (const m of block.matchAll(/'([^']*High VRAM[^']*)'/g)) {
        assert.ok(!/[^\x20-\x7E]/.test(m[1]), `hint is not ASCII: ${m[1]}`);
    }
});

test('the tier hint is looked up per model, not from a flat map', async () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').resolve(
        __dirname, '../js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js'), 'utf8');
    // A flat map is what leaked LTX's motion text onto every other model.
    assert.ok(/_tierHint\(modelType, t\)/.test(src),
        'the quality option builder must resolve the hint through modelType');
    assert.ok(/QUALITY_TIER_HINT\[modelType\] \|\| QUALITY_TIER_HINT\._default/.test(src),
        'the lookup must fall back to _default for models with no entry');
});
