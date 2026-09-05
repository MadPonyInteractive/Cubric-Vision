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
 * The honesty half. Before MPI-687 six values here could not be delivered at their labelled
 * size — 352, 608, 480, 864, 1376, 800, every one an odd multiple of 32, which is exactly
 * what a /64 output grid cannot represent. They rendered 32px short while the status bar
 * showed the label, and that is the bug the user reported. The table was moved DOWN onto
 * /64 (down, so no render changed size or cost — only the label stopped lying).
 *
 * Keep this green by editing the TABLE. A dimension that fails here is not deliverable, and
 * loosening the halving to make it fit is the mistake the file header describes.
 */
test('every shipped H3 dimension is delivered at its labelled size', () => {
    const short = [];
    for (const { label, w, h } of readRatios()) {
        for (const [axis, px] of [['w', w], ['h', h]]) {
            if (halve(px) * 2 !== px) short.push(`${label} ${axis}=${px} -> ${halve(px) * 2}`);
        }
    }
    assert.deepStrictEqual(short, [], `these tier dimensions render short of their label:\n  ${short.join('\n  ')}`);
});
