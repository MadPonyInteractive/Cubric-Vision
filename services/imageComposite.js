/**
 * imageComposite.js — blend two images through a mask (Sharp).
 *
 * General purpose: any base, any overlay, any white-on-black mask. The mask's
 * WHITE pixels are the region taken from the overlay; black keeps the base.
 * Overlay and mask are stretched to the base's pixel size, matching the stretch
 * semantics the mask copy/paste path already has, so a 2x-upscaled entry and its
 * source compose without the caller pre-resizing anything.
 *
 * Used by POST /project/composite-media (MPI-362). Its sibling below,
 * compositeOverlay, flattens an RGBA layer that carries its own alpha and needs
 * no mask at all — POST /project/apply-paint (MPI-375).
 */

const sharp = require('sharp');

/** Feather sigma when the caller doesn't pick one: ~2.5px at 1024px. */
function defaultFeather(width, height) {
    return Math.max(1, Math.round(Math.min(width, height) / 400));
}

/**
 * Fill enclosed holes in a binary-ish mask, in place. **OPT-IN since MPI-437.**
 *
 * It used to run by default here, justified by the app's mask consumers doing the
 * same — `MaskDetailerPipe` with `contour_fill: true`. **MPI-431 removed that
 * justification**: it turned `mask_fill_holes` OFF in every raw template and
 * `contour_fill` with it, because the graph was silently refilling an edge band
 * into a disc before the sampler saw it, and ruled that the APP is now the only
 * thing that closes a hole — through the Fill button, where the user can see it.
 * This route kept a private copy of the old behaviour and no caller ever passed
 * the flag, so a ring mask composited as a disc (user-reported 2026-08-04).
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
 * @param {boolean} [o.fillHoles=false] — OPT IN to filling areas enclosed by paint.
 *   Off by default since MPI-437: the route composites the mask it was handed, and
 *   closing a hole is the app's job (the Fill button). See fillMaskHoles.
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
    // sides of a painted outline. OPT-IN (MPI-437): `!== false` meant "on unless
    // someone says otherwise", and no caller ever said otherwise — so an edge-band
    // mask composited as a solid disc, which is the same defect MPI-431 removed
    // from the graph. An explicit `true` is now required.
    if (fillHoles === true) fillMaskHoles(maskRaw, width, height);

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
    // COVER, centred (MPI-373) — NOT `fill`. The composite tool draws its underlay
    // the same way (`CompositeManager.drawUnderlayCover`), and the preview is the
    // whole point of that card: `fill` here would stretch a mismatched pair on disk
    // while the canvas showed a centre-crop, so the user would approve one image and
    // receive another. Identical to `fill` whenever the aspects already match, which
    // is every pair the retired MPI-362 modal was used on.
    const overlay = await sharp(overlayPath)
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .flatten({ background: '#000000' })
        .joinChannel(maskFinal, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();

    await sharp(basePath).composite([{ input: overlay }]).toFile(outPath);
    return { width, height };
}

/**
 * Flatten an RGBA overlay onto a base image by the overlay's OWN alpha (MPI-375).
 *
 * The paint layer carries its alpha with it, so there is no mask, no feather and
 * no hole fill here — that is why this is a sibling of compositeThroughMask
 * rather than a flag on it. The overlay is stretched to the base's pixel size,
 * matching the stretch semantics the mask path already has.
 *
 * @param {Object} o
 * @param {string} o.basePath      — image painted onto
 * @param {Buffer} o.overlayBuffer — RGBA image; transparent pixels keep the base
 * @param {string} o.outPath       — file to write; format follows its extension
 * @param {number} [o.opacity=1]   — 0..1 scale applied to the overlay's alpha
 * @returns {Promise<{width: number, height: number}>} the written image's dimensions
 */
async function compositeOverlay({ basePath, overlayBuffer, outPath, opacity = 1 }) {
    const { width, height } = await sharp(basePath).metadata();
    if (!width || !height) throw new Error('Could not read base image dimensions');

    let overlay = await sharp(overlayBuffer)
        .resize(width, height, { fit: 'fill' })
        .ensureAlpha()
        .png()
        .toBuffer();

    // Scale the whole layer's alpha to match what the canvas DISPLAYS (MPI-375).
    // `dest-in` against a uniform tile multiplies the destination's alpha, which is
    // the same maths as the canvas drawing the layer at globalAlpha — so a slider at
    // 75% bakes at 75%. It is applied to the flattened LAYER, not per dab, so
    // overlapping dabs inside one stroke cannot build up darker than the rest.
    const a = Math.max(0, Math.min(1, Number(opacity)));
    if (a < 1) {
        overlay = await sharp(overlay)
            .composite([{
                input: Buffer.from([255, 255, 255, Math.round(a * 255)]),
                raw: { width: 1, height: 1, channels: 4 },
                tile: true,
                blend: 'dest-in',
            }])
            .png()
            .toBuffer();
    }

    await sharp(basePath).composite([{ input: overlay }]).toFile(outPath);
    return { width, height };
}

module.exports = { compositeThroughMask, compositeOverlay, defaultFeather, fillMaskHoles };
