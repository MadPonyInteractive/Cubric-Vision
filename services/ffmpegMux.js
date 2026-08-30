'use strict';

/**
 * services/ffmpegMux.js — combine a separately-rendered video + audio into one
 * file (MPI-64 B3 split video/audio output).
 *
 * ComfyUI's native `SaveVideo` cannot reliably encode on every GPU (the
 * VHS_VideoCombine `nvenc_h264` path fails on the Blackwell Pod container), and
 * `SaveVideo`/`SaveAudio` throw when handed empty audio. The chosen design is to
 * save VIDEO (no audio) and AUDIO as two separate files, then mux them here with
 * a stream-COPY video pass (no re-encode → encoder/GPU-agnostic, instant) and a
 * transcoded audio pass into the container's native codec. Video is the master
 * track: its duration wins, audio is cut/ended at the video length.
 *
 * Single source for the mux recipe — every video workflow's combine goes through
 * here; do not inline ffmpeg mux args elsewhere.
 */

const { spawn } = require('child_process');
const { ffmpegPath } = require('./ffmpegBinary');
const logger = require('../routes/logger');

/**
 * Mux an audio file into a video file (video stream copied, audio transcoded to
 * AAC) and write the combined result to `outPath`. Video is master — `-shortest`
 * ends output at whichever stream is shorter so a slightly-longer audio tail
 * never extends past the video; for matched-length generation output this is a
 * no-op. The video stream is copied verbatim (no nvenc, no re-encode).
 *
 * @param {string} videoPath  Source video (no/ignored audio).
 * @param {string} audioPath  Source audio to attach.
 * @param {string} outPath    Destination combined file.
 * @returns {Promise<void>}   Resolves on success; rejects with the ffmpeg stderr tail.
 */
function muxAudioIntoVideo(videoPath, audioPath, outPath) {
    const args = [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        outPath,
    ];
    return new Promise((resolve, reject) => {
        logger.info('project', `ffmpeg mux: ${ffmpegPath} ${args.join(' ')}`);
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let stderrBuf = '';
        proc.stderr.on('data', (d) => { stderrBuf += d.toString(); if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000); });
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
            if (code === 0) return resolve();
            reject(new Error(`ffmpeg mux exited ${code}: ${stderrBuf.slice(-600)}`));
        });
    });
}

/**
 * Sum N audio files into one, sample for sample, and write it to `outPath`.
 *
 * MPI-663 (Stems, "Combine into one file") — the separator splits a track into stems
 * that ADD back to the original, so putting a subset back together is a sum, not a
 * crossfade or a concat.
 *
 * 🔴 `normalize=0` IS THE WHOLE RECIPE. `amix` normalizes by default, dividing every
 * input by N — mixing drums + vocals would come back at half the level they had in the
 * track, and mixing all four at a quarter. The sum cannot clip beyond the original
 * either, because these stems came OUT of one file. `dropout_transition=0` stops amix
 * ducking the remaining inputs when a shorter stem ends.
 *
 * FLAC in, FLAC out, and the codec is named rather than inferred: `outPath` is written
 * before the caller renames it into place, so ffmpeg must not pick a container's default
 * lossy encoder. Lossless throughout is the point — the source is already lossy from the
 * music model, and re-encoding on the way to a DAW stacks artifacts.
 *
 * @param {string[]} inputPaths  two or more source audio files
 * @param {string} outPath       destination
 * @returns {Promise<void>}      resolves on success; rejects with the ffmpeg stderr tail
 */
async function mixAudioFiles(inputPaths, outPath) {
    if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
        throw new Error('mixAudioFiles needs at least two inputs');
    }
    const mix = `amix=inputs=${inputPaths.length}:normalize=0:dropout_transition=0`;

    // PASS 1 — how far past full scale does the sum go? Measured in FLOAT, where the
    // value can exceed 0; volumedetect reads the clamped integer and would report a
    // tidy 0.0 dB for a sum that is being destroyed.
    //
    // 🔴 A SUBSET SUM REALLY DOES CLIP, and the first instinct — "these stems came out
    // of one file, so they cannot exceed it" — is wrong. It holds only for ALL of them.
    // Drop one and you remove whatever was pulling the waveform DOWN at some peaks:
    // measured on a real MiniMax track (mastered to 0 dBFS, as they all are), drums+vocals
    // overshot by +0.63 dB. Hard-clipped samples in a file whose entire purpose is to be
    // opened in a DAW is the one outcome this flow cannot ship.
    const over = await _peakOverFullScaleDb(inputPaths, mix);

    // PASS 2 — write it, trimmed by exactly the overshoot when there is one. A single
    // static gain, so the waveform and the balance between stems are untouched; it is
    // the difference between "quieter by half a dB" and "clipped", and for material on
    // its way to a mix, headroom is the right side of that trade. No limiter: this flow
    // hands over material to be processed, and dynamics are the user's to decide.
    const filter = over > 0 ? `${mix},volume=${(-over).toFixed(3)}dB` : mix;
    const args = ['-y'];
    inputPaths.forEach(p => args.push('-i', p));
    args.push('-filter_complex', filter, '-c:a', 'flac', outPath);

    if (over > 0) {
        logger.info('project', `ffmpeg mix: sum peaks +${over.toFixed(2)}dB over full scale, trimming to fit`);
    }
    return _spawnFfmpeg(args, 'mix');
}

/**
 * Peak of the summed inputs in dB relative to full scale, as a POSITIVE number when the
 * sum overshoots and 0 when it does not. `astats` after `aformat=fltp` is what makes the
 * overshoot visible at all.
 *
 * Deliberately fails OPEN: if the measurement cannot be parsed, return 0 and write the
 * mix untrimmed. A missing trim is a file that might clip; a failed measurement treated
 * as fatal is no file at all.
 */
async function _peakOverFullScaleDb(inputPaths, mix) {
    const args = [];
    inputPaths.forEach(p => args.push('-i', p));
    args.push(
        '-filter_complex', `${mix},aformat=sample_fmts=fltp,astats=metadata=1:reset=0`,
        '-f', 'null', '-',
    );
    try {
        const stderr = await _spawnFfmpeg(args, 'mix-measure', { capture: true });
        // One `Peak level dB` per channel plus an Overall block; the largest is the one
        // that decides whether anything clips.
        const peaks = [...stderr.matchAll(/Peak level dB:\s*(-?[\d.]+|inf)/g)]
            .map(m => Number(m[1]))
            .filter(Number.isFinite);
        if (!peaks.length) return 0;
        return Math.max(0, Math.max(...peaks));
    } catch (err) {
        logger.warn('project', `ffmpeg mix: peak measurement failed (${err.message}) — writing untrimmed`);
        return 0;
    }
}

/** Run ffmpeg, rejecting with the stderr tail. Resolves with stderr when `capture`. */
function _spawnFfmpeg(args, label, { capture = false } = {}) {
    return new Promise((resolve, reject) => {
        logger.info('project', `ffmpeg ${label}: ${ffmpegPath} ${args.join(' ')}`);
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let stderrBuf = '';
        proc.stderr.on('data', (d) => {
            stderrBuf += d.toString();
            // astats prints per-channel blocks; keep enough to hold them all.
            if (stderrBuf.length > 64000) stderrBuf = stderrBuf.slice(-64000);
        });
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
            if (code === 0) return resolve(capture ? stderrBuf : undefined);
            reject(new Error(`ffmpeg ${label} exited ${code}: ${stderrBuf.slice(-600)}`));
        });
    });
}

module.exports = { muxAudioIntoVideo, mixAudioFiles };
