/**
 * imageCrop.js — crop an image to a rect that may fall OUTSIDE it (MPI-383).
 *
 * Sharp's `.extract` throws on an out-of-bounds rect, so anything the crop box
 * selects beyond the source has to exist first: pad the image by exactly the
 * overhang with the fill colour, then extract from the padded image with the
 * rect shifted by the left/top pad. RESOLUTION-family crops resample after.
 *
 * Used by POST /project/crop-media.
 */

const sharp = require('sharp');

const HEX_RE = /^#?([a-f0-9]{6})$/i;

/**
 * Parse '#rrggbb' (or an {r,g,b} object) into a Sharp background.
 * Anything unparseable falls back to opaque black — the fill is cosmetic and
 * must never fail a crop.
 */
function parseFill(value) {
    if (value && typeof value === 'object') {
        const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
        return { r: clamp(value.r), g: clamp(value.g), b: clamp(value.b), alpha: 1 };
    }
    const match = String(value || '').trim().match(HEX_RE);
    if (!match) return { r: 0, g: 0, b: 0, alpha: 1 };
    const hex = match[1].toLowerCase();
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        alpha: 1,
    };
}

/**
 * Work out the pad + extract pair for a (possibly out-of-bounds) crop rect.
 * Pure maths — no Sharp, no IO.
 *
 * @param {{srcW:number,srcH:number,x:number,y:number,w:number,h:number}} r
 * @returns {{extend:{top:number,bottom:number,left:number,right:number},
 *            extract:{left:number,top:number,width:number,height:number},
 *            extends:boolean}}
 */
function planExtendedCrop({ srcW, srcH, x, y, w, h }) {
    const left   = Math.max(0, -x);
    const top    = Math.max(0, -y);
    const right  = Math.max(0, (x + w) - srcW);
    const bottom = Math.max(0, (y + h) - srcH);

    return {
        extend: { top, bottom, left, right },
        // Coordinates inside the PADDED image: the pad pushed the source right
        // and down by left/top, so the rect moves with it.
        extract: { left: x + left, top: y + top, width: w, height: h },
        extends: (top + bottom + left + right) > 0,
    };
}

/**
 * Crop `inputPath` to the rect and write `outPath`.
 *
 * @param {string} inputPath
 * @param {string} outPath
 * @param {object} opts
 * @param {number} opts.x - rect origin, may be negative
 * @param {number} opts.y
 * @param {number} opts.w
 * @param {number} opts.h
 * @param {string|object} [opts.fill] - colour for pixels outside the source
 * @param {number|null} [opts.outW] - resample target (RESOLUTION family only)
 * @param {number|null} [opts.outH]
 * @returns {Promise<{width:number,height:number}>} written pixel size
 */
async function cropExtended(inputPath, outPath, { x, y, w, h, fill, outW, outH }) {
    const meta = await sharp(inputPath).metadata();
    const plan = planExtendedCrop({
        srcW: meta.width,
        srcH: meta.height,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
    });

    // TWO passes, deliberately. Sharp applies `extend` AFTER extraction no
    // matter what order they are called in, so chaining them extracts from the
    // unpadded image and throws "extract_area: bad extract area". Materialising
    // the padded image first is the only way round it.
    let pipeline;
    if (plan.extends) {
        const padded = await sharp(inputPath)
            .extend({ ...plan.extend, background: parseFill(fill) })
            .toBuffer();
        pipeline = sharp(padded).extract(plan.extract);
    } else {
        pipeline = sharp(inputPath).extract(plan.extract);
    }

    const resample = outW > 0 && outH > 0
        && (Math.round(outW) !== plan.extract.width || Math.round(outH) !== plan.extract.height);
    if (resample) {
        pipeline = pipeline.resize(Math.round(outW), Math.round(outH), { fit: 'fill' });
    }

    await pipeline.toFile(outPath);

    return resample
        ? { width: Math.round(outW), height: Math.round(outH) }
        : { width: plan.extract.width, height: plan.extract.height };
}

module.exports = { cropExtended, planExtendedCrop, parseFill };
