'use strict';

/**
 * routes/videoGif.js — POST /api/video/gif
 *
 * Export a video (or a trimmed slice of it) to an animated GIF. This is a pure
 * EXPORT, not a history operation — no project Media/ write, no .meta sidecar,
 * no item/group payload. The output lands in a temp file; the frontend then
 * offers it via `<a download>` (native Save-As). See docs/utils.md § mediaActions.
 *
 * Body: {
 *   sourcePath:  string  (absolute file path OR /project-file?path=... URL),
 *   fps:         number  (optional, default 10),
 *   sizePreset:  string  (optional — 'original' | '480xauto' | '320xauto' |
 *                         'autox480' | 'autox320'; default 'original'),
 *   loop:        number  (optional — GIF loop count; 0 = forever, default 0),
 *   trimIn:      number  (optional — slice start, seconds),
 *   trimOut:     number  (optional — slice end, seconds)
 * }
 *
 * Two-pass palette (palettegen → paletteuse) for quality. Returns
 * { success, url, byteSize, fileName } — url is a /project-file?path=<temp> URL
 * the frontend can preview AND download.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs-extra');
const path    = require('path');
const os      = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { ffmpegPath } = require('../services/ffmpegBinary');

const execFileP = promisify(execFile);

// sizePreset → ffmpeg scale expression. `-2` keeps aspect + forces an even
// dimension. 'original' skips scaling entirely.
const SCALE_FILTERS = {
    original: null,
    '480xauto': 'scale=480:-2:flags=lanczos',
    '320xauto': 'scale=320:-2:flags=lanczos',
    'autox480': 'scale=-2:480:flags=lanczos',
    'autox320': 'scale=-2:320:flags=lanczos',
};

function _resolveInput(raw) {
    if (!raw) return '';
    if (raw.includes('project-file?path=')) {
        try {
            const u = new URL(raw, 'http://localhost');
            return decodeURIComponent(u.searchParams.get('path') || '');
        } catch { return ''; }
    }
    return raw;
}

router.post('/api/video/gif', async (req, res) => {
    let outputPath = '';
    try {
        const { sourcePath, fps, sizePreset, loop, trimIn, trimOut } = req.body || {};
        if (!sourcePath) {
            return res.status(400).json({ success: false, error: 'sourcePath required' });
        }

        const inputPath = _resolveInput(sourcePath);
        if (!(await fs.pathExists(inputPath))) {
            return res.status(404).json({ success: false, error: 'source file not found: ' + inputPath });
        }

        const outFps = Math.max(1, Math.min(60, Math.round(Number(fps) || 10)));
        // ezgif-style loop count → ffmpeg -loop. ffmpeg's -loop is the NETSCAPE
        // "extra repeats" value, NOT total plays: 0 = infinite, N = N+1 plays,
        // -1 = no loop (plays once). The UI field means TOTAL plays (0 = forever,
        // 1 = once, 2 = twice), so remap: 0→0 (forever), 1→-1 (once),
        // N→N-1 (N plays). Without this, loop=1 played twice.
        const totalPlays = Number.isFinite(Number(loop)) ? Math.max(0, Math.round(Number(loop))) : 0;
        const loopArg = totalPlays === 0 ? 0 : (totalPlays === 1 ? -1 : totalPlays - 1);
        const scaleFilter = SCALE_FILTERS[sizePreset] ?? SCALE_FILTERS.original;

        // Temp output — export target, cleaned up by the OS temp sweep. A fresh
        // uuid name avoids collisions across concurrent exports.
        const tmpDir = path.join(os.tmpdir(), 'cubric-gif');
        await fs.ensureDir(tmpDir);
        const fileName = `clip_${uuidv4().slice(0, 8)}.gif`;
        outputPath = path.join(tmpDir, fileName);

        const tIn  = Number(trimIn);
        const tOut = Number(trimOut);
        const hasTrim = Number.isFinite(tIn) && Number.isFinite(tOut) && tOut > tIn;

        // Build the vf chain: fps → optional scale → split for the 2-pass palette.
        // palettegen/paletteuse give far better color than a naive single pass.
        const vfParts = [`fps=${outFps}`];
        if (scaleFilter) vfParts.push(scaleFilter);
        const vfBase = vfParts.join(',');
        const filterComplex =
            `[0:v] ${vfBase},split [a][b];[a] palettegen [p];[b][p] paletteuse`;

        // Trim BEFORE -i for fast input-seek (keyframe-accurate is fine for GIF).
        const args = ['-y'];
        if (hasTrim) args.push('-ss', String(tIn), '-to', String(tOut));
        args.push(
            '-i', inputPath,
            '-filter_complex', filterComplex,
            '-loop', String(loopArg),
            '-an',
            outputPath,
        );

        logger.info('project', `video-gif ffmpeg: ${ffmpegPath} ${args.join(' ')}`);
        await execFileP(ffmpegPath, args, { maxBuffer: 8 * 1024 * 1024 });

        const stat = await fs.stat(outputPath);
        const url = `/project-file?path=${encodeURIComponent(outputPath)}`;
        res.json({ success: true, url, byteSize: stat.size, fileName });
    } catch (err) {
        logger.error('project', 'video-gif failed', err);
        if (outputPath) { try { await fs.remove(outputPath); } catch {} }
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
