'use strict';

/**
 * ffmpegThumb.js — Extract a single JPG thumbnail from a video, or downscale
 * an image to a gallery-sized JPG thumbnail.
 *
 * Uses bundled ffmpeg (see ffmpegBinary.js). Video posters and image thumbs are
 * both 512-wide JPGs (height auto, preserves aspect); a video's frame is taken at
 * the given timestamp (default 0s). 512 is sharp enough at the biggest gallery card
 * and ~50x cheaper to decode than a raw 4K PNG — the whole point of MPI-319. Video
 * posters were 256 until MPI-689, which is why they read soft beside images.
 *
 * Returns outPath on success, null on failure (logs warning).
 */

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
 * A video's poster frame, at the SAME width as an image thumb (MPI-689).
 *
 * It was 256 until 2026-09-07, sized for a gallery card that no longer exists, so
 * every video read as soft next to an image on the same row — and the poster is not
 * a brief flash, it is what a video card shows for the whole of a generation.
 *
 * This is the CHEAP half of MPI-689. The full fix puts video posters on the image
 * rendition ladder (small + a 1280 proxy) and needs MPI-633's ladder, which is not on
 * this branch — that pair lands in 2.0. Matching the image width is the part that can
 * ship here, and it is a strict improvement: same encoder, same quality setting, one
 * number.
 */
async function extractVideoThumb(inputPath, outPath, { atSeconds = 0, width = 512 } = {}) {
    try {
        const args = [
            '-y',
            '-ss', String(atSeconds),
            '-i', inputPath,
            '-frames:v', '1',
            // Downscale only — never upscale a small source; -2 keeps height even.
            '-vf', `scale='min(${width},iw)':-2`,
            '-q:v', '4',
            outPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        return outPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `thumb extract failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

async function extractImageThumb(inputPath, outPath, { width = 512 } = {}) {
    try {
        const args = [
            '-y',
            '-i', inputPath,
            // Downscale only — never upscale a small source ('force_original...'
            // guards the min); -2 keeps height even for yuv420 JPG encoding.
            '-vf', `scale='min(${width},iw)':-2`,
            '-frames:v', '1',
            '-q:v', '4',
            outPath,
        ];
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        return outPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `image thumb failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { extractVideoThumb, extractImageThumb };
