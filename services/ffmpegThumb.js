'use strict';

/**
 * ffmpegThumb.js — Extract a single JPG thumbnail from a video, or downscale
 * an image to a gallery-sized WebP thumbnail.
 *
 * Uses bundled ffmpeg (see ffmpegBinary.js). Video thumbs are 256-wide JPGs
 * (height auto, preserves aspect) at the given timestamp (default 0s). Image
 * thumbs are 512-wide (sharp enough at the biggest gallery card, ~50x cheaper
 * to decode than a raw 4K PNG — the whole point of MPI-319).
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

const { execFile } = require('child_process');
const { promisify } = require('util');
const { ffmpegPath } = require('./ffmpegBinary');
const logger = require('../routes/logger');

const execFileP = promisify(execFile);

async function extractVideoThumb(inputPath, outPath, { atSeconds = 0 } = {}) {
    try {
        const args = [
            '-y',
            '-ss', String(atSeconds),
            '-i', inputPath,
            '-frames:v', '1',
            '-vf', 'scale=256:-2',
            '-q:v', '4',
            outPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024 });
        return outPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `thumb extract failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

/** `<id>.thumb.jpg` → `<id>.thumb.webp`. The one place the swap is spelled. */
function imageThumbPath(outPath) {
    return String(outPath).replace(/\.jpe?g$/i, '.webp');
}

async function extractImageThumb(inputPath, outPath, { width = 512 } = {}) {
    const webpPath = imageThumbPath(outPath);
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
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024 });
        return webpPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `image thumb failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { extractVideoThumb, extractImageThumb, imageThumbPath };
