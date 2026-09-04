/**
 * The two-pass H3 dimension contract, asserted on every tier dimension we ship.
 *
 * Both H3 runtimes render stage 1 at half the canvas and let the latent upscaler double
 * it back. Core's `patchify_video` (comfy/ldm/minimax/model.py:47) reshapes the latent in
 * 2x2 spatial blocks, so the STAGE-1 LATENT MUST BE EVEN on both axes. The latent is
 * stage-1 pixels / 16, which makes the real constraint `stage1 % 32 === 0`.
 *
 * MPI-687 got this backwards once, in a way no offline gate could see: the halving node
 * was changed to `floor(a / 32) * 16` on the theory that /16 was all the latent grid
 * needed. It is not. `very_low` 352x608 then produced an 11x19 latent and core raised
 *   RuntimeError: shape '[1, 24, 1, 1, 5, 2, 9, 2]' is invalid for input of size 5016
 * (5016 = 24*11*19; the reshape wanted 10x18), and `low` 480x864 gave 15x27 against a
 * wanted 14x26. Graph validation passed both. Only an executing run failed, which is why
 * this check asserts the ARITHMETIC rather than the graph.
 *
 * The consequence of the correct halving is that output = floor(canvas / 64) * 64, so a
 * dimension that is not /64 cannot be delivered at its labelled size. That is a fact
 * about the two-pass architecture, not a bug to fix in the halving node.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');

/** The halving node's expression, kept in one place so a drift shows up as a test edit. */
const HALVE_EXPR = 'floor(a / 64) * 32';
const halve = (a) => Math.floor(a / 64) * 32;

/** Every graph that runs the two-pass shape, runtime + raw + generator source. */
const TWO_PASS_FILES = [
    'comfy_workflows/minimax_h3_fl2va.json',
    'comfy_workflows/minimax_h3_r2va.json',
    'comfy_workflows/raw/minimax_h3_fl2va_template.json',
    'comfy_workflows/raw/minimax_h3_r2va_template.json',
    'comfy_workflows/scripts/workflow_generation/minimax_h3_fl2va_template.json',
    'comfy_workflows/scripts/workflow_generation/minimax_h3_r2va_template.json',
];

/** Read MINIMAX_H3_RATIOS out of the ESM source without importing it (it pulls in DOM). */
function readRatios() {
    const src = fs.readFileSync(path.join(REPO, 'js/utils/ratios.js'), 'utf8');
    const start = src.indexOf('export const MINIMAX_H3_RATIOS');
    assert.ok(start >= 0, 'MINIMAX_H3_RATIOS not found in js/utils/ratios.js');
    const body = src.slice(start, src.indexOf('\n};', start));
    const dims = [];
    for (const m of body.matchAll(/\{\s*label:\s*"([^"]+)",\s*w:\s*(\d+),\s*h:\s*(\d+)/g)) {
        dims.push({ label: m[1], w: Number(m[2]), h: Number(m[3]) });
    }
    assert.ok(dims.length >= 21, `expected the full tier ladder, parsed ${dims.length}`);
    return dims;
}

test('every two-pass graph halves onto a /32 grid', () => {
    for (const rel of TWO_PASS_FILES) {
        const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
        assert.ok(src.includes(HALVE_EXPR), `${rel}: missing ${HALVE_EXPR}`);
        assert.ok(
            !/floor\(a \/ 32\) \* 16/.test(src),
            `${rel}: halves onto /16 — the stage-1 latent goes odd and patchify_video raises`,
        );
    }
});

test('every shipped H3 dimension yields an EVEN stage-1 latent', () => {
    for (const { label, w, h } of readRatios()) {
        for (const [axis, px] of [['w', w], ['h', h]]) {
            const stage1 = halve(px);
            assert.strictEqual(
                stage1 % 32, 0,
                `${label} ${axis}=${px}: stage 1 is ${stage1}, not /32`,
            );
            assert.strictEqual(
                (stage1 / 16) % 2, 0,
                `${label} ${axis}=${px}: stage-1 latent ${stage1 / 16} is odd — patchify_video will raise`,
            );
        }
    }
});

/**
 * The honesty half. A non-/64 dimension runs fine and silently delivers 32px short, which
 * is the bug the user reported as "the card does not match the status bar". This test does
 * not enforce /64 — it PINS the six that lie, so making the table honest is a deliberate
 * edit here rather than a silent drift.
 */
test('the dimensions that cannot be delivered at their labelled size are the known six', () => {
    const short = [];
    for (const { label, w, h } of readRatios()) {
        for (const [axis, px] of [['w', w], ['h', h]]) {
            if (halve(px) * 2 !== px) short.push(`${label} ${axis}=${px}->${halve(px) * 2}`);
        }
    }
    assert.deepStrictEqual(short.sort(), [
        // Six distinct values lie, across sixteen cells: 352, 608 (very_low),
        // 480, 864 (low), 1376 (medium), 800 (very_high). Every one is an ODD
        // multiple of 32, which is exactly what /64 rounding cannot represent.
        '16:9 h=352->320', '16:9 h=480->448', '16:9 w=608->576', '16:9 w=864->832',
        '1:1 h=352->320', '1:1 h=480->448', '1:1 w=352->320', '1:1 w=480->448',
        '21:9 h=352->320', '21:9 h=480->448', '21:9 h=800->768', '21:9 w=1376->1344',
        '9:16 h=608->576', '9:16 h=864->832', '9:16 w=352->320', '9:16 w=480->448',
    ].sort());
});
