'use strict';

/**
 * services/ffprobeVideo.js — probe video files with bundled ffprobe.
 *
 * Exports:
 *   probeVideo(inputPath) -> { fps, duration, frameCount, hasAudio, width, height }
 *     Returns null on failure (caller decides fallback).
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { ffprobePath } = require('./ffmpegBinary');
const logger = require('../routes/logger');

const execFileP = promisify(execFile);

async function probeVideo(inputPath) {
    try {
        const args = [
            '-v', 'error',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            inputPath,
        ];
        const { stdout } = await execFileP(ffprobePath, args, { maxBuffer: 4 * 1024 * 1024 });
        const data = JSON.parse(stdout);

        const vStream = (data.streams || []).find(s => s.codec_type === 'video');
        const aStream = (data.streams || []).find(s => s.codec_type === 'audio');
        if (!vStream) return null;

        // fps: r_frame_rate is "num/den"
        let fps = 0;
        if (vStream.r_frame_rate && vStream.r_frame_rate.includes('/')) {
            const [n, d] = vStream.r_frame_rate.split('/').map(Number);
            if (d) fps = n / d;
        }

        const duration = Number(vStream.duration || data.format?.duration || 0) || 0;
        let frameCount = Number(vStream.nb_frames || 0);
        if (!frameCount && fps && duration) frameCount = Math.round(fps * duration);

        return {
            fps:        Number.isFinite(fps) ? Number(fps.toFixed(3)) : 0,
            duration:   Number(duration.toFixed(3)),
            frameCount,
            hasAudio:   !!aStream,
            width:      vStream.width  || 0,
            height:     vStream.height || 0,
        };
    } catch (err) {
        logger.warn('project', `ffprobe failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { probeVideo };
