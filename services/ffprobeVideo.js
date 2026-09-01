'use strict';

/**
 * services/ffprobeVideo.js — probe video files with bundled ffprobe.
 *
 * Exports:
 *   probeVideo(inputPath) -> {
 *     fps, duration, frameCount, hasAudio, width, height, rotation,
 *     codecName, pixFmt, rFrameRate,
 *     audioCodecName, audioSampleRate, audioChannels, audioChannelLayout,
 *   }
 *     Returns null on failure (caller decides fallback).
 *
 *   width/height are DISPLAY dimensions, swapped when the stream carries a
 *   quarter-turn display matrix — a phone clip coded 3840x2160 with
 *   rotation:-90 is reported 2160x3840, because that is what it looks like and
 *   what every ffmpeg filter downstream already sees (a `scale=-2:'min(720,ih)'`
 *   proxy of that clip comes out 406x720, not 1280x720). Before MPI-670 this
 *   returned the coded pair, so a portrait phone clip landed in its sidecar as
 *   landscape whenever the renderer could not measure it — which is exactly the
 *   HEVC case, since a renderer that cannot decode returns {0,0} and the coded
 *   pair then wins.
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

// windowsHide on EVERY execFileP call below: the forked server.js owns no console,
// so a console-subsystem ffmpeg/ffprobe gets its own conhost - a terminal that flashes
// open on the user's desktop. /backfill-media-derivatives fires one per missing
// rendition, so a project open popped ~20 of them (MPI-651, the tail of MPI-637).
const execFileP = promisify(execFile);

/**
 * Display rotation in degrees, normalised to 0/90/180/270. ffprobe reports it two
 * ways depending on the file and the build — a `displaymatrix` side-data entry
 * carrying `rotation` (negative for a clockwise turn), and the legacy `rotate`
 * container tag. Read both; a file can carry either.
 */
function _rotationOf(vStream) {
    const sideData = (vStream.side_data_list || []).find(s => s.rotation !== undefined);
    const raw = Number(sideData?.rotation ?? vStream.tags?.rotate ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return ((Math.round(raw) % 360) + 360) % 360;
}

async function probeVideo(inputPath) {
    try {
        const args = [
            '-v', 'error',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            inputPath,
        ];
        const { stdout } = await execFileP(ffprobePath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
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

        // A quarter turn swaps what the viewer sees; a half turn does not.
        const rotation = _rotationOf(vStream);
        const quarterTurn = rotation === 90 || rotation === 270;
        const codedW = vStream.width  || 0;
        const codedH = vStream.height || 0;

        return {
            fps:        Number.isFinite(fps) ? Number(fps.toFixed(3)) : 0,
            duration:   Number(duration.toFixed(3)),
            frameCount,
            hasAudio:   !!aStream,
            width:      quarterTurn ? codedH : codedW,
            height:     quarterTurn ? codedW : codedH,
            rotation,
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

/**
 * Probe an AUDIO file. Separate from probeVideo because that one returns null
 * whenever there is no video stream — correct for its callers, and the reason an
 * audio card had no length to show until now (MPI-573).
 *
 * @param {string} inputPath
 * @returns {Promise<{duration:number, sampleRate:number, channels:number, codecName:string}|null>}
 *          null on failure, so the caller decides the fallback.
 */
async function probeAudio(inputPath) {
    try {
        const args = [
            '-v', 'error',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            inputPath,
        ];
        const { stdout } = await execFileP(ffprobePath, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        const data = JSON.parse(stdout);

        const aStream = (data.streams || []).find(s => s.codec_type === 'audio');
        if (!aStream) return null;

        // The stream's own duration is missing on some containers (a raw WAV among
        // them reports it only at format level), so fall back rather than read 0.
        const duration = Number(aStream.duration || data.format?.duration || 0) || 0;

        return {
            duration:   Number(duration.toFixed(3)),
            sampleRate: Number(aStream.sample_rate) || 0,
            channels:   Number(aStream.channels)    || 0,
            codecName:  aStream.codec_name || '',
        };
    } catch (err) {
        logger.warn('project', `ffprobe (audio) failed for ${inputPath}: ${err.message}`);
        return null;
    }
}

module.exports = { probeVideo, probeAudio };
