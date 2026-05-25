'use strict';

/**
 * routes/videoTrimInput.js - temporary trim prep for ComfyUI video inputs.
 *
 * Body: {
 *   folderPath: string,
 *   sourcePath: string,
 *   trimIn: number,
 *   trimOut: number
 * }
 */

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { ffmpegPath } = require('../services/ffmpegBinary');
const { probeVideo } = require('../services/ffprobeVideo');

const execFileP = promisify(execFile);

function _resolveInput(raw) {
    if (!raw) return '';
    if (raw.includes('project-file?path=')) {
        try {
            const u = new URL(raw, 'http://localhost');
            return decodeURIComponent(u.searchParams.get('path') || '');
        } catch (_) {
            return '';
        }
    }
    return raw;
}

function _safeTempPath(folderPath) {
    return path.join(folderPath, 'data', 'temp', 'comfy-inputs');
}

router.post('/api/video/trim-input', async (req, res) => {
    let outputPath = '';
    try {
        const { folderPath, sourcePath, trimIn, trimOut } = req.body || {};
        if (!folderPath || !sourcePath) {
            return res.status(400).json({ success: false, error: 'folderPath and sourcePath required' });
        }

        const inputPath = _resolveInput(sourcePath);
        if (!(await fs.pathExists(inputPath))) {
            return res.status(404).json({ success: false, error: `source file not found: ${inputPath}` });
        }

        const tIn = Number(trimIn);
        const tOut = Number(trimOut);
        if (!Number.isFinite(tIn) || !Number.isFinite(tOut) || tIn < 0 || tOut <= tIn) {
            return res.status(400).json({ success: false, error: 'trimIn/trimOut must define a positive range' });
        }

        const srcMeta = await probeVideo(inputPath);
        const sourceDuration = Number(srcMeta?.duration) || 0;
        const sourceFps = Number(srcMeta?.fps) || 0;
        const clampedOut = sourceDuration > 0 ? Math.min(tOut, sourceDuration) : tOut;
        const inclusiveFramePad = sourceFps > 0 ? (1 / sourceFps) : 0;
        const duration = (clampedOut - tIn) + inclusiveFramePad;
        if (!(duration > 0)) {
            return res.status(400).json({ success: false, error: 'trim range is outside the source duration' });
        }

        const tempDir = _safeTempPath(folderPath);
        await fs.ensureDir(tempDir);
        const outputName = `comfy_trim_${uuidv4()}.mp4`;
        outputPath = path.join(tempDir, outputName);

        const args = [
            '-y',
            '-i', inputPath,
            '-ss', String(tIn),
            '-t', String(duration),
            '-vf', 'setpts=PTS-STARTPTS',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '16',
            '-pix_fmt', 'yuv420p',
        ];
        if (srcMeta?.hasAudio) args.push('-af', 'asetpts=PTS-STARTPTS', '-c:a', 'aac', '-b:a', '192k');
        else args.push('-an');
        args.push(outputPath);

        logger.info('project', `video-trim-input ffmpeg: ${ffmpegPath} ${args.join(' ')}`);
        await execFileP(ffmpegPath, args, { maxBuffer: 8 * 1024 * 1024 });

        res.json({
            success: true,
            filePath: outputPath,
            url: `/project-file?path=${encodeURIComponent(outputPath)}`,
            trim: { in: tIn, out: clampedOut },
        });
    } catch (err) {
        if (outputPath) {
            try { await fs.remove(outputPath); } catch (_) { /* noop */ }
        }
        logger.error('project', 'video trim input failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/video/trim-input/cleanup', async (req, res) => {
    try {
        const { paths } = req.body || {};
        const removed = [];
        for (const raw of Array.isArray(paths) ? paths : []) {
            if (!raw || typeof raw !== 'string') continue;
            const filePath = _resolveInput(raw);
            if (!filePath) continue;
            if (!path.basename(filePath).startsWith('comfy_trim_')) continue;
            await fs.remove(filePath);
            removed.push(filePath);
        }
        res.json({ success: true, removed });
    } catch (err) {
        logger.warn('project', 'video trim input cleanup failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
