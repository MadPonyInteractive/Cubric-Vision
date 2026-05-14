'use strict';

/**
 * services/videoConcat.js — concatenate multiple video files into one.
 *
 * Audio-aware (matters for LTX which produces audio, and for imported
 * videos with audio):
 *   - All inputs silent  → output silent (`-an`).
 *   - Any input has audio → output has audio; silent inputs get a
 *     synthesized AAC stereo 48kHz `anullsrc` track of matching duration.
 *   - All inputs match codec_name + pix_fmt + width + height + r_frame_rate
 *     AND audio shape (all silent, OR all sharing codec/sample_rate/channels)
 *     → concat-demuxer fast path (`-c copy`, no re-encode).
 *   - Otherwise → concat-filter path (re-encodes video + audio).
 *
 * Exports:
 *   concatVideos(inputPaths, outputPath, { onProgress, inputRanges } = {}) -> Promise<{
 *     method: 'demuxer' | 'filter',
 *     hasAudio: boolean,
 *     totalDurationSec: number,
 *   }>
 *
 *   onProgress(ratio) is called with ratio in [0, 1] as ffmpeg reports it.
 *   inputRanges (optional) is an array same length as inputPaths; each entry
 *   is `{ in, out }` (seconds) or null. When any entry is set, the demuxer
 *   fast-path is bypassed and the filter path slices each input via input-
 *   seek (`-ss <in> -to <out>` before `-i`).
 *
 *   Throws on failure. Caller cleans up partial output.
 */

const fs   = require('fs-extra');
const os   = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ffmpegPath } = require('./ffmpegBinary');
const { probeVideo } = require('./ffprobeVideo');
const logger = require('../routes/logger');

const SILENT_SAMPLE_RATE = 48000;
const SILENT_CHANNELS    = 2;
const SILENT_CHANNEL_LAYOUT = 'stereo';

function _parseTimeToSeconds(s) {
    // "HH:MM:SS.MS" → seconds
    const m = String(s || '').match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function _canFastPath(probes) {
    if (probes.length < 2) return false;
    const first = probes[0];
    for (let i = 1; i < probes.length; i++) {
        const p = probes[i];
        if (p.codecName  !== first.codecName)  return false;
        if (p.pixFmt     !== first.pixFmt)     return false;
        if (p.width      !== first.width)      return false;
        if (p.height     !== first.height)     return false;
        if (p.rFrameRate !== first.rFrameRate) return false;
        if (!!p.hasAudio !== !!first.hasAudio) return false;
        if (p.hasAudio) {
            if (p.audioCodecName  !== first.audioCodecName)  return false;
            if (p.audioSampleRate !== first.audioSampleRate) return false;
            if (p.audioChannels   !== first.audioChannels)   return false;
        }
    }
    return true;
}

async function _runFfmpeg(args, { totalDurationSec, onProgress, stdinInput }) {
    return new Promise((resolve, reject) => {
        logger.info('project', `ffmpeg concat: ${ffmpegPath} ${args.join(' ')}`);
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let stderrBuf = '';

        if (stdinInput) {
            proc.stdin.write(stdinInput);
            proc.stdin.end();
        }

        proc.stderr.on('data', chunk => {
            const text = chunk.toString();
            stderrBuf += text;
            if (stderrBuf.length > 16 * 1024) stderrBuf = stderrBuf.slice(-8 * 1024);

            if (!onProgress || !totalDurationSec) return;
            // ffmpeg writes "time=HH:MM:SS.MS" repeatedly on stderr
            const matches = text.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/g);
            if (!matches) return;
            const last = matches[matches.length - 1];
            const m = last.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/);
            if (!m) return;
            const elapsed = _parseTimeToSeconds(m[1]);
            const ratio = Math.max(0, Math.min(1, elapsed / totalDurationSec));
            try { onProgress(ratio); } catch (_) { /* swallow */ }
        });

        proc.on('error', err => reject(err));
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}\n${stderrBuf.slice(-2000)}`));
        });
    });
}

async function _runDemuxerPath(inputPaths, outputPath, opts) {
    // Write a tmp concat list — UTF-8, "file '<abs>'" per line, single-quote
    // any embedded single-quotes via ffmpeg's escape: ' → '\''
    const listLines = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    const listPath  = path.join(os.tmpdir(), `mpi-concat-${process.pid}-${Date.now()}.txt`);
    await fs.writeFile(listPath, listLines, 'utf8');
    try {
        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            outputPath,
        ];
        await _runFfmpeg(args, opts);
    } finally {
        try { await fs.remove(listPath); } catch (_) { /* non-fatal */ }
    }
}

async function _runFilterPath(probes, inputPaths, outputPath, opts) {
    const anyAudio   = probes.some(p => p.hasAudio);
    const inputArgs  = [];
    const filterSegs = [];
    const concatTags = [];
    const ranges     = Array.isArray(opts.inputRanges) ? opts.inputRanges : [];

    // Real inputs first (indices 0..n-1). When a per-input range is provided,
    // prepend `-ss <in> -to <out>` for input-seek (fast + keyframe-accurate).
    for (let i = 0; i < inputPaths.length; i++) {
        const r = ranges[i];
        if (r && Number.isFinite(+r.in) && Number.isFinite(+r.out) && +r.out > +r.in) {
            inputArgs.push('-ss', String(+r.in), '-to', String(+r.out));
        }
        inputArgs.push('-i', inputPaths[i]);
    }

    // Concat filter rejects mismatched dimensions. Snap each input to the
    // FIRST input's resolution: scale to fit, then pad with black bars to
    // preserve aspect ratio. Snap dims to even numbers (libx264 yuv420p req.).
    const _snapEven = n => Math.max(2, Math.floor(n / 2) * 2);
    const _targetW = _snapEven(probes[0].width  || 0);
    const _targetH = _snapEven(probes[0].height || 0);
    const _targetFps = Number(probes[0].fps) > 0 ? Number(probes[0].fps) : 24;

    // For each input, build [vN] and [aN] labels. When the input lacks audio
    // but the output needs audio, generate silence via anullsrc, trimmed to
    // the source duration. ffmpeg accepts `lavfi` extra inputs alongside file
    // inputs, but the cleanest filter-only approach is to use anullsrc nodes
    // *inside* filter_complex, which works without extra -f lavfi entries.
    for (let i = 0; i < probes.length; i++) {
        const p = probes[i];
        const vLabel = `v${i}`;
        const aLabel = `a${i}`;
        // Video: scale-fit + black-bar pad to target dims; reset SAR; reset
        // timestamps so each segment starts at 0. yuv420p so libx264 + dumb
        // players (Chromium) play the output reliably.
        const vChain = (
            `[${i}:v:0]` +
            `scale=${_targetW}:${_targetH}:force_original_aspect_ratio=increase,` +
            `crop=${_targetW}:${_targetH},` +
            `setsar=1,fps=${_targetFps},format=yuv420p,setpts=PTS-STARTPTS` +
            `[${vLabel}]`
        );
        filterSegs.push(vChain);
        if (anyAudio) {
            if (p.hasAudio) {
                filterSegs.push(
                    `[${i}:a:0]asetpts=PTS-STARTPTS,aresample=${SILENT_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=${SILENT_CHANNEL_LAYOUT}[${aLabel}]`
                );
            } else {
                const r = ranges[i];
                const sliced = (r && Number.isFinite(+r.in) && Number.isFinite(+r.out) && +r.out > +r.in)
                    ? (+r.out - +r.in)
                    : Number(p.duration) || 0;
                const dur = Math.max(0.001, sliced);
                filterSegs.push(
                    `anullsrc=channel_layout=${SILENT_CHANNEL_LAYOUT}:sample_rate=${SILENT_SAMPLE_RATE},atrim=duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[${aLabel}]`
                );
            }
            concatTags.push(`[${vLabel}][${aLabel}]`);
        } else {
            concatTags.push(`[${vLabel}]`);
        }
    }

    const n = probes.length;
    const concatExpr = anyAudio
        ? `${concatTags.join('')}concat=n=${n}:v=1:a=1[vout][aout]`
        : `${concatTags.join('')}concat=n=${n}:v=1:a=0[vout]`;

    const filterComplex = [...filterSegs, concatExpr].join(';');

    const args = [
        '-y',
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
    ];
    if (anyAudio) args.push('-map', '[aout]');

    // Encoder choices: libx264 yuv420p (broad compatibility); aac 192k.
    args.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
    );
    if (anyAudio) {
        args.push('-c:a', 'aac', '-b:a', '192k');
    }
    args.push(outputPath);

    await _runFfmpeg(args, opts);
}

async function concatVideos(inputPaths, outputPath, { onProgress, inputRanges } = {}) {
    if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
        throw new Error('concatVideos requires at least 2 input paths');
    }
    for (const p of inputPaths) {
        if (!(await fs.pathExists(p))) {
            throw new Error(`concatVideos input missing: ${p}`);
        }
    }

    const probes = [];
    for (const p of inputPaths) {
        const probe = await probeVideo(p);
        if (!probe) throw new Error(`concatVideos could not probe: ${p}`);
        probes.push(probe);
    }

    const ranges = Array.isArray(inputRanges) ? inputRanges : [];
    const hasAnyRange = ranges.some(r =>
        r && Number.isFinite(+r.in) && Number.isFinite(+r.out) && +r.out > +r.in);

    const _effectiveDuration = (i) => {
        const r = ranges[i];
        if (r && Number.isFinite(+r.in) && Number.isFinite(+r.out) && +r.out > +r.in) {
            return +r.out - +r.in;
        }
        return Number(probes[i].duration) || 0;
    };

    const totalDurationSec = probes.reduce((s, _p, i) => s + _effectiveDuration(i), 0);
    const anyAudio = probes.some(p => p.hasAudio);
    const opts = { totalDurationSec, onProgress, inputRanges: ranges };

    await fs.ensureDir(path.dirname(outputPath));

    // Per-input slicing requires re-encoding; demuxer copy cannot honor it.
    if (!hasAnyRange && _canFastPath(probes)) {
        logger.info('project', `concat fast-path (demuxer copy) for ${inputPaths.length} inputs`);
        try {
            await _runDemuxerPath(inputPaths, outputPath, opts);
            return { method: 'demuxer', hasAudio: anyAudio, totalDurationSec };
        } catch (err) {
            logger.warn('project', `concat demuxer failed, falling back to filter: ${err.message}`);
            // Fall through to filter path
        }
    }

    logger.info('project', `concat filter-path for ${inputPaths.length} inputs (anyAudio=${anyAudio}, sliced=${hasAnyRange})`);
    await _runFilterPath(probes, inputPaths, outputPath, opts);
    return { method: 'filter', hasAudio: anyAudio, totalDurationSec };
}

module.exports = { concatVideos };
