'use strict';

/**
 * ffmpegThumb.js — Extract a single JPG thumbnail from a video, or downscale
 * an image to a gallery-sized WebP thumbnail.
 *
 * Uses bundled ffmpeg (see ffmpegBinary.js). A video's poster is one frame at the
 * given timestamp (default 0s) and rides the same ladder as an image (MPI-689) —
 * it was a 256-wide JPG until then, which is why videos read as soft until hover.
 * Thumbs come in TWO sizes (MPI-633) — see IMAGE_RENDITION_PX below. 512 was the
 * only one until then, and its claim to be "sharp enough at the biggest gallery
 * card" was measured in some window and is false on a wide one: at slider level 4
 * a card paints ~775-1250px from that 512px source.
 *
 * Image thumbs are WebP, NOT JPG (MPI-627): JPG carries no alpha, and a
 * background-removed PNG keeps its ORIGINAL RGB under the transparent pixels
 * (the cut-out lives only in the alpha channel). Flattening that to JPG did not
 * merely paint a white backdrop — it restored the untouched source image,
 * backdrop and drop-shadow included. WebP keeps alpha, so the gallery card
 * composites over the app surface, and it is SMALLER than the JPG it replaces
 * at this size (512px, measured on real project media — a `gallery_*.png` room
 * photo 30 KB vs 44 KB, a cut-out 16.8 KB vs 17.5 KB; the repo carries no photo
 * fixture to re-measure against, so treat these as recorded, not reproducible).
 *
 * Returns the path ACTUALLY written on success — an image thumb always lands at
 * `.webp` whatever extension the caller asked for, so callers MUST use the
 * return value, not the path they passed. null on failure (logs warning).
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { ffmpegPath } = require('./ffmpegBinary');
const logger = require('../routes/logger');

// windowsHide on EVERY execFileP call below: the forked server.js owns no console,
// so a console-subsystem ffmpeg/ffprobe gets its own conhost - a terminal that flashes
// open on the user's desktop. /backfill-media-derivatives fires one per missing
// rendition, so a project open popped ~20 of them (MPI-651, the tail of MPI-637).
const execFileP = promisify(execFile);

/**
 * A video's poster frame, on the SAME rendition ladder as an image (MPI-689).
 *
 * It was a 256-wide JPG until then, sized for a gallery card that no longer exists:
 * a card paints ~775-1250 device px, so every video read as soft and only came good
 * on hover, which mounts the 720p proxy instead. The poster is not a brief flash
 * either — it is what a card shows before promotion, and what EVERY video card falls
 * back to for the whole of a generation (`_releaseMedia('generation')`, MPI-631).
 *
 * Same widths, same WebP, same `.thumb.webp` / `.thumb.1280.webp` names as the image
 * ladder, so `pickImageRendition` and the sidecar GC need no video-shaped special case.
 */
async function extractVideoThumb(inputPath, outPath, { atSeconds = 0, width = IMAGE_RENDITION_PX.small } = {}) {
    const webpPath = imageThumbPath(outPath, { width });
    try {
        const args = [
            '-y',
            '-ss', String(atSeconds),
            '-i', inputPath,
            '-frames:v', '1',
            '-vf', `scale='min(${width},iw)':-2`,
            '-c:v', 'libwebp',
            '-quality', '82',
            webpPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        return webpPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `thumb extract failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

/**
 * The two image renditions a gallery card can mount (MPI-633). A card picks the
 * smallest one whose pixels cover its RENDERED BOX and falls back to the original
 * `filePath` when neither does — srcset behaviour, keyed off the box the justified
 * packer already computes rather than off items-per-row (three PORTRAIT cards per
 * row are narrow but tall, so a column count does not say how many pixels a card
 * paints).
 *
 * `large` is the top of the ladder and nothing sits above it: a card wider than
 * 1280 upscales this rendition rather than mounting a 4K original, because the
 * viewer is where full resolution belongs. Measured at the largest slider level
 * (MPI-633 validation.md, M2): four visible 1280px cards rest at 23.7 MB of VRAM
 * against 12 MB for today's 512px source — and at 238 MB for the same ladder
 * WITHOUT the scroll-out demote MpiGalleryGrid pairs with it.
 */
const IMAGE_RENDITION_PX = { small: 512, large: 1280 };

/**
 * `<id>.thumb.jpg` → `<id>.thumb.webp` (small) or `<id>.thumb.1280.webp` (large).
 * The one place the swap is spelled. Both keep the `.thumb.` infix, which is what
 * the sidecar delete/GC paths match on.
 */
function imageThumbPath(outPath, { width = IMAGE_RENDITION_PX.small } = {}) {
    const webp = String(outPath).replace(/\.jpe?g$/i, '.webp');
    return width === IMAGE_RENDITION_PX.small
        ? webp
        : webp.replace(/\.webp$/i, `.${width}.webp`);
}

async function extractImageThumb(inputPath, outPath, { width = IMAGE_RENDITION_PX.small } = {}) {
    const webpPath = imageThumbPath(outPath, { width });
    try {
        const args = [
            '-y',
            '-i', inputPath,
            // Downscale only — never upscale a small source ('force_original...'
            // guards the min); -2 keeps height even for the yuva420p chroma
            // subsampling libwebp uses.
            '-vf', `scale='min(${width},iw)':-2`,
            '-frames:v', '1',
            '-c:v', 'libwebp',
            '-quality', '82',
            webpPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        return webpPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `image thumb failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

/**
 * Gallery hover playback height (MPI-633). A `<video>` decoder works at the clip's
 * NATIVE resolution however small the card is — measured: the same 3000x1280 clip
 * costs 81.2 MB per promoted card in a 64x80 box and 82.4 MB in a 134x167 one, across
 * 4.4x the painted area. So the only lever is the file, and cost tracks pixels at
 * ~20 MB per megapixel per promoted card: 65-81 MB for 3000x1280 against 11-21 MB at
 * 720p, a 6x cut. 480p buys perhaps 10 MB/video more and is visibly soft on a 775px
 * card. The viewer still opens the full-res master.
 */
const VIDEO_PROXY_HEIGHT = 720;

/** `<id>.thumb.jpg` → `<id>.proxy.mp4`. */
function videoProxyPath(outPath) {
    return String(outPath).replace(/\.thumb\.[^.]+$/i, '.proxy.mp4');
}

/**
 * Downscale a video to the gallery hover proxy. Returns the path written, or null —
 * including when the source is already at or under the proxy height, because then the
 * master IS the proxy and a re-encode would cost disk and quality for nothing. Pass
 * the probed `sourceHeight`; an unknown height encodes (ffmpeg's `min` can only ever
 * downscale, so the worst case is a same-size copy, never an upscale).
 *
 * ponytail: awaited inline where the poster is extracted, like every other derivative
 * here. A minutes-long 4K import therefore waits on its proxy encode; if that shows up
 * as an import-latency complaint, the fix is to run this after the response and patch
 * the sidecar through a queued writer — not to skip long clips, which are exactly the
 * ones whose decoders cost the most.
 */
async function extractVideoProxy(inputPath, outPath, { sourceHeight } = {}) {
    if (sourceHeight > 0 && sourceHeight <= VIDEO_PROXY_HEIGHT) return null;
    const proxyPath = videoProxyPath(outPath);
    try {
        const args = [
            '-y',
            '-i', inputPath,
            '-vf', `scale=-2:'min(${VIDEO_PROXY_HEIGHT},ih)'`,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '26',
            '-pix_fmt', 'yuv420p',
            // Hovering a gallery card plays sound (MPI-132), so the proxy carries the
            // audio too — a silent proxy would make the volume slider a lie.
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            proxyPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        return proxyPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `video proxy failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

/**
 * Write both of a video's gallery derivatives — the poster and the hover proxy — and
 * hand back the `/project-file?path=` URLs a sidecar stores. Five routes (import,
 * save-generation, concat, crop, reverse) had grown the same three lines around
 * `extractVideoThumb`; the proxy would have made it five copies of six, and a route
 * that missed the update would quietly keep costing 6x the VRAM per card.
 *
 * `proxyPath` is null when the source is already at or under the proxy height — the
 * master IS the proxy then — so null here is the normal case for a 720p clip.
 *
 * The large POSTER tier is gated differently from an image's (MPI-689): an image at or
 * under 1280 needs none because the card mounts `filePath` for that tier, and a video's
 * `filePath` is a video — an `<img>` pointed at it paints a missing card. So a clip is
 * owed a large poster whenever it is wider than the SMALL tier, and `min(1280,iw)` caps
 * it at the source. Unknown width writes it, same reasoning as the image path.
 */
async function writeVideoDerivatives(inputPath, metaDir, id, { sourceWidth, sourceHeight } = {}) {
    const base = path.join(metaDir, `${id}.thumb.jpg`);
    const url = (p) => `/project-file?path=${encodeURIComponent(p)}`;
    const thumb = await extractVideoThumb(inputPath, base);
    const large = (!(sourceWidth > 0) || sourceWidth > IMAGE_RENDITION_PX.small)
        ? await extractVideoThumb(inputPath, base, { width: IMAGE_RENDITION_PX.large })
        : null;
    const proxy = await extractVideoProxy(inputPath, base, { sourceHeight });
    return {
        thumbPath: thumb ? url(thumb) : null,
        thumbPathLg: large ? url(large) : null,
        proxyPath: proxy ? url(proxy) : null,
    };
}

module.exports = {
    extractVideoThumb,
    extractImageThumb,
    extractVideoProxy,
    writeVideoDerivatives,
    imageThumbPath,
    videoProxyPath,
    IMAGE_RENDITION_PX,
    VIDEO_PROXY_HEIGHT,
};
