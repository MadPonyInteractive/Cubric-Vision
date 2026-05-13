'use strict';

/**
 * services/ffprobeVideo.js — probe video files with bundled ffprobe.
 *
 * Exports:
 *   probeVideo(inputPath) -> {
 *     fps, duration, frameCount, hasAudio, width, height,
 *     codecName, pixFmt, rFrameRate,
 *     audioCodecName, audioSampleRate, audioChannels, audioChannelLayout,
 *   }
 *     Returns null on failure (caller decides fallback).
 *
 *   codecName/pixFmt/rFrameRate let concat callers decide between the fast
 *   concat-demuxer (-c copy) and the slower concat-filter re-encode path.
 *   audio* fields cover audio-aware concat (silent track padding for mixed
 *   audio/no-audio sets, future LTX audio output).
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
            codecName:  vStream.codec_name || '',
            pixFmt:     vStream.pix_fmt    || '',
            rFrameRate: vStream.r_frame_rate || '',
            audioCodecName:     aStream?.codec_name     || '',
            audioSampleRate:    Number(aStream?.sample_rate) || 0,
            audioChannels:      Number(aStream?.channels)    || 0,
            audioChannelLayout: aStream?.channel_layout      || '',
        };
    } catch (err) {
        logger.warn('project', `ffprobe failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { probeVideo };
