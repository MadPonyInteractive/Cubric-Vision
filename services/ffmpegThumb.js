'use strict';

/**
 * ffmpegThumb.js — Extract a single JPG thumbnail from a video.
 *
 * Uses bundled ffmpeg (see ffmpegBinary.js). Writes a 256-wide JPG
 * (height auto, preserves aspect) at the given timestamp (default 0s).
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

module.exports = { extractVideoThumb };
