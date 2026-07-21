'use strict';

/**
 * ffmpegThumb.js — Extract a single JPG thumbnail from a video, or downscale
 * an image to a gallery-sized JPG thumbnail.
 *
 * Uses bundled ffmpeg (see ffmpegBinary.js). Video thumbs are 256-wide JPGs
 * (height auto, preserves aspect) at the given timestamp (default 0s). Image
 * thumbs are 512-wide (sharp enough at the biggest gallery card, ~50x cheaper
 * to decode than a raw 4K PNG — the whole point of MPI-319).
 *
 * Returns outPath on success, null on failure (logs warning).
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
        await execFileP(ffmpegPath, args, { maxBuffer: 4 * 1024 * 1024 });
        return outPath;
    } catch (err) {
        logger.warn('ffmpegThumb', `image thumb failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { extractVideoThumb, extractImageThumb };
