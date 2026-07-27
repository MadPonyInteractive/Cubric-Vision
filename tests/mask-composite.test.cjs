// MPI-362. Mask composite blends two history entries through one mask: the
// masked (white) region comes from the overlay, everything else keeps the base.
// Add and Subtract are the SAME call with base/overlay swapped, so the guard
// worth having is that the polarity never flips — a reversed mask silently
// produces the exact opposite of what the user asked for, and both results look
// plausible on screen.

const assert = require('node:assert');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');

const { compositeThroughMask } = require('../services/imageComposite');

const W = 100;
const H = 100;
const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };

const solid = (bg) => sharp({ create: { width: W, height: H, channels: 3, background: bg } }).png().toBuffer();

/** Mask with the RIGHT half white (masked) and the left half black. */
async function rightHalfMask() {
    const white = await sharp({ create: { width: W / 2, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    return sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite([{ input: white, left: W / 2, top: 0 }])
        .png()
        .toBuffer();
}

async function pixel(file, x, y) {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

test('mask composite takes the masked region from the overlay, the rest from the base', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-composite-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const basePath = path.join(dir, 'base.png');
    const overlayPath = path.join(dir, 'overlay.png');
    fs.writeFileSync(basePath, await solid(RED));
    fs.writeFileSync(overlayPath, await solid(BLUE));
    const maskBuffer = await rightHalfMask();

    // "Add": base = the masked entry, overlay = the other one.
    const out = path.join(dir, 'add.png');
    const dims = await compositeThroughMask({ basePath, overlayPath, maskBuffer, outPath: out, feather: 0 });
    assert.deepStrictEqual(dims, { width: W, height: H });

    assert.deepStrictEqual(await pixel(out, 10, 50), RED, 'outside the mask must keep the base');
    assert.deepStrictEqual(await pixel(out, 90, 50), BLUE, 'inside the mask must come from the overlay');

    // "Subtract" is the same call with the two sources swapped — same mask,
    // opposite result. If polarity ever flips, these two assertions swap and
    // the feature silently does the reverse of what the dialog promised.
    const inv = path.join(dir, 'subtract.png');
    await compositeThroughMask({ basePath: overlayPath, overlayPath: basePath, maskBuffer, outPath: inv, feather: 0 });
    assert.deepStrictEqual(await pixel(inv, 10, 50), BLUE);
    assert.deepStrictEqual(await pixel(inv, 90, 50), RED);
});

// A painted RING is the normal way to mark a subject — the app's own consumers
// fill it (MaskDetailerPipe runs contour_fill: true), so a composite that only
// swapped the outline would contradict every other mask surface in the app.
test('an outline mask is filled, so the enclosed area composites too', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-composite-fill-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const basePath = path.join(dir, 'base.png');
    const overlayPath = path.join(dir, 'overlay.png');
    fs.writeFileSync(basePath, await solid(RED));
    fs.writeFileSync(overlayPath, await solid(BLUE));

    // 40×40 white square outline (4px thick) centred at (50,50), hollow inside.
    const outer = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const inner = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const ring = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite([{ input: outer, left: 30, top: 30 }, { input: inner, left: 34, top: 34 }])
        .png()
        .toBuffer();

    const out = path.join(dir, 'filled.png');
    await compositeThroughMask({ basePath, overlayPath, maskBuffer: ring, outPath: out, feather: 0 });
    assert.deepStrictEqual(await pixel(out, 50, 50), BLUE, 'inside the outline must be treated as masked');
    assert.deepStrictEqual(await pixel(out, 5, 5), RED, 'outside the outline must stay the base');

    // Opt out and the hollow centre stays the base — the ring alone composites.
    const hollow = path.join(dir, 'hollow.png');
    await compositeThroughMask({ basePath, overlayPath, maskBuffer: ring, outPath: hollow, feather: 0, fillHoles: false });
    assert.deepStrictEqual(await pixel(hollow, 50, 50), RED);
    assert.deepStrictEqual(await pixel(hollow, 31, 50), BLUE, 'the painted ring itself still composites');
});

test('feather softens the seam and only the seam', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-composite-feather-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const basePath = path.join(dir, 'base.png');
    const overlayPath = path.join(dir, 'overlay.png');
    fs.writeFileSync(basePath, await solid(RED));
    fs.writeFileSync(overlayPath, await solid(BLUE));

    const out = path.join(dir, 'feathered.png');
    await compositeThroughMask({ basePath, overlayPath, maskBuffer: await rightHalfMask(), outPath: out, feather: 4 });

    const seam = await pixel(out, 50, 50);
    assert.ok(seam.r > 0 && seam.b > 0, `seam should blend both sources, got ${JSON.stringify(seam)}`);
    assert.deepStrictEqual(await pixel(out, 5, 50), RED, 'feather must not bleed across the image');
    assert.deepStrictEqual(await pixel(out, 95, 50), BLUE);
});
