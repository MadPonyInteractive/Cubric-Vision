/**
 * imageComposite.js — blend two images through a mask (Sharp).
 *
 * General purpose: any base, any overlay, any white-on-black mask. The mask's
 * WHITE pixels are the region taken from the overlay; black keeps the base.
 * Overlay and mask are stretched to the base's pixel size, matching the stretch
 * semantics the mask copy/paste path already has, so a 2x-upscaled entry and its
 * source compose without the caller pre-resizing anything.
 *
 * Used by POST /project/composite-media (MPI-362).
 */

const sharp = require('sharp');

/** Feather sigma when the caller doesn't pick one: ~2.5px at 1024px. */
function defaultFeather(width, height) {
    return Math.max(1, Math.round(Math.min(width, height) / 400));
}

/**
 * Fill enclosed holes in a binary-ish mask, in place.
 *
 * The app's mask consumers already do this — MaskDetailerPipe runs with
 * `contour_fill: true` — so a user who paints a ring around a subject expects
 * the inside to be masked. Without it a composite would swap the outline only.
 *
 * Flood-fills the BACKGROUND inwards from the borders; any dark pixel the flood
 * never reaches is enclosed by paint, so it becomes mask.
 *
 * ponytail: one Int32Array stack sized to the frame (~133MB transient at 33MP,
 * freed on return). Switch to a scanline flood fill if masks ever outgrow that.
 *
 * @param {Uint8Array|Buffer} data - single-channel mask, 0 = unmasked, 255 = masked
 */
function fillMaskHoles(data, width, height, threshold = 128) {
    const n = width * height;
    const outside = new Uint8Array(n);
    const stack = new Int32Array(n);
    let top = 0;

    const push = (i) => {
        if (outside[i] || data[i] >= threshold) return;
        outside[i] = 1;
        stack[top++] = i;
    };

    for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }

    while (top > 0) {
        const i = stack[--top];
        const x = i % width;
        if (x > 0)          push(i - 1);
        if (x < width - 1)  push(i + 1);
        if (i >= width)     push(i - width);
        if (i + width < n)  push(i + width);
    }

    for (let i = 0; i < n; i++) {
        if (!outside[i] && data[i] < threshold) data[i] = 255;
    }
}

/**
 * @param {Object}  o
 * @param {string}  o.basePath     — image kept outside the mask
 * @param {string}  o.overlayPath  — image taken inside the mask
 * @param {Buffer}  o.maskBuffer   — mask image (white = overlay, black = base)
 * @param {string}  o.outPath      — file to write; format follows its extension
 * @param {number}  [o.feather]    — blur sigma in px; 0 disables, omit for the default
 * @param {boolean} [o.fillHoles=true] — fill areas enclosed by paint (see fillMaskHoles)
 * @returns {Promise<{width: number, height: number}>} the written image's dimensions
 */
async function compositeThroughMask({ basePath, overlayPath, maskBuffer, outPath, feather, fillHoles }) {
    const { width, height } = await sharp(basePath).metadata();
    if (!width || !height) throw new Error('Could not read base image dimensions');

    const sigma = Number.isFinite(feather) ? feather : defaultFeather(width, height);

    // Mask → a single 8-bit channel the size of the base. flatten() first: a
    // mask layer may carry alpha (transparent = unmasked), and greyscale() would
    // keep it as a second channel, which joinChannel below would reject.
    const maskRaw = await sharp(maskBuffer)
        .resize(width, height, { fit: 'fill' })
        .flatten({ background: '#000000' })
        .greyscale()
        .toColourspace('b-w')
        .raw()
        .toBuffer();

    // Fill BEFORE feathering, so the blur softens the real edge instead of both
    // sides of a painted outline.
    if (fillHoles !== false) fillMaskHoles(maskRaw, width, height);

    // Sharp rejects sigma < 0.3; anything at or below that is "no feather".
    // toColourspace('b-w') on the way OUT as well: sharp reads a 1-channel raw
    // buffer as greyscale but writes it back as 3-channel sRGB, and joinChannel
    // would then read the 3x buffer as a garbage-sized alpha plane.
    const maskFinal = sigma >= 0.3
        ? await sharp(maskRaw, { raw: { width, height, channels: 1 } })
            .blur(sigma)
            .toColourspace('b-w')
            .raw()
            .toBuffer()
        : maskRaw;

    // Overlay with the feathered mask AS its alpha channel. flatten(), not
    // removeAlpha(): joinChannel is silently DROPPED after removeAlpha (sharp
    // 0.34 / libvips 8.17 — the output stays 3-channel and the composite below
    // then pastes the overlay over the whole frame). flatten() guarantees the
    // same 3 channels and joins correctly.
    const overlay = await sharp(overlayPath)
        .resize(width, height, { fit: 'fill' })
        .flatten({ background: '#000000' })
        .joinChannel(maskFinal, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();

    await sharp(basePath).composite([{ input: overlay }]).toFile(outPath);
    return { width, height };
}

module.exports = { compositeThroughMask, defaultFeather, fillMaskHoles };
