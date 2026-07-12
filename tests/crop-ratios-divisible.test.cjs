// MPI-261. Two invariants for the crop-tool rework:
//   1. CROP_RATIOS is a pure-aspect {portrait,landscape} table — index-mirror,
//      portrait ratios <=1, landscape >=1, 1:1 featured first, every icon key
//      resolves in ICONS (a missing key silently falls back to the 'info' icon).
//   2. The Resize "Divisible by" default is 16 in BOTH the tool component AND the
//      injector — the injector has its OWN DEFAULTS and falls back to it when the
//      param is absent, so a mismatch silently resizes to a multiple of 1.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('CROP_RATIOS is a valid pure-aspect index-mirror table', async () => {
    const { CROP_RATIOS } = await import('../js/utils/ratios.js');
    const { ICONS } = await import('../js/utils/icons.js');
    const { portrait, landscape } = CROP_RATIOS;

    assert.strictEqual(portrait.length, landscape.length, 'orientation lists must be same length (index-mirror)');
    assert.strictEqual(portrait[0].label, '1:1', '1:1 must lead portrait');
    assert.strictEqual(landscape[0].label, '1:1', '1:1 must lead landscape');

    for (const r of portrait) assert.ok(r.ratio <= 1 + 1e-9, `portrait ${r.label} ratio ${r.ratio} must be <= 1`);
    for (const r of landscape) assert.ok(r.ratio >= 1 - 1e-9, `landscape ${r.label} ratio ${r.ratio} must be >= 1`);

    // cinema floats exact
    assert.strictEqual(landscape.find(r => r.label === '2.39:1').ratio, 2.39);
    assert.strictEqual(landscape.find(r => r.label === '21:9').ratio, 21 / 9);

    // every icon key (rect_* -> ratio_*) resolves in ICONS
    for (const r of [...portrait, ...landscape]) {
        const key = r.icon.replace('rect_', 'ratio_');
        assert.ok(ICONS[key], `icon ${key} for ${r.label} missing from ICONS`);
    }

    assert.ok(Object.isFrozen(CROP_RATIOS), 'CROP_RATIOS must be frozen');
});

test('Resize divisible_by default is 16 in both the component and the injector', () => {
    const grabDefault = (rel) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const m = src.match(/divisible_by:\s*(\d+)/);
        assert.ok(m, `divisible_by default not found in ${rel}`);
        return Number(m[1]);
    };
    const component = grabDefault('js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js');
    const injector = grabDefault('js/services/workflowInjectors/resizeInjector.js');
    assert.strictEqual(component, 16, 'component DEFAULTS.divisible_by must be 16');
    assert.strictEqual(injector, 16, 'injector DEFAULTS.divisible_by must be 16');
    assert.strictEqual(component, injector, 'both defaults must agree');
});

test('roundToDivisible rounds up, floors on overflow, respects bounds', async () => {
    const { roundToDivisible } = await import('../js/utils/cropRounding.js');
    assert.strictEqual(roundToDivisible(1020, 16, 1024), 1024);
    assert.strictEqual(roundToDivisible(1024, 16, 1024), 1024);
    assert.strictEqual(roundToDivisible(1030, 16, 1024), 1024); // up 1040 > 1024 -> floor
    assert.strictEqual(roundToDivisible(439, 16, 1024), 448);
    assert.strictEqual(roundToDivisible(237, 16, 439), 240);
    assert.strictEqual(roundToDivisible(10, 16, 8), 8); // max < n -> clamp to span
});
