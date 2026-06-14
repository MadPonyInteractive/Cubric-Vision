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

module.exports = { muxAudioIntoVideo };
