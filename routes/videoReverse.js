'use strict';

/**
 * routes/videoReverse.js — POST /api/video/reverse
 *
 * Body: {
 *   folderPath:  string  (project folder path),
 *   sourcePath:  string  (absolute file path OR /project-file?path=... URL),
 *   outFileName: string  (optional, default "video_reverse_NNN.mp4"),
 *   groupId:     string  (optional — for caller context, echoed back),
 *   itemId:      string  (optional — source item id, echoed back),
 *   trimIn:      number  (optional — slice source starting at this offset, seconds),
 *   trimOut:     number  (optional — slice source ending at this offset, seconds)
 * }
 *
 * Spawns ffmpeg with -vf reverse (and -af areverse when source has audio).
 * Writes output to project Media/, writes .meta/<uuid>.json sidecar with probe data,
 * returns { success, item, group } shaped for projectService.addGroup().
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs-extra');
const path    = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { ffmpegPath } = require('../services/ffmpegBinary');
const { probeVideo } = require('../services/ffprobeVideo');
const { extractVideoThumb } = require('../services/ffmpegThumb');

const execFileP = promisify(execFile);

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

router.post('/api/video/reverse', async (req, res) => {
    let outputPath = '';
    try {
        const { folderPath, sourcePath, outFileName, groupId, itemId, trimIn, trimOut } = req.body || {};
        if (!folderPath || !sourcePath) {
            return res.status(400).json({ success: false, error: 'folderPath, sourcePath required' });
        }

        const inputPath = _resolveInput(sourcePath);
        if (!(await fs.pathExists(inputPath))) {
            return res.status(404).json({ success: false, error: 'source file not found: ' + inputPath });
        }

        const srcMeta = await probeVideo(inputPath);
        if (!srcMeta || !srcMeta.width || !srcMeta.height) {
            return res.status(500).json({ success: false, error: 'could not probe source dimensions' });
        }

        const mediaDir = path.join(folderPath, 'Media');
        await fs.ensureDir(mediaDir);

        let finalName;
        if (outFileName && /\.(mp4|mov|webm)$/i.test(outFileName)) {
            finalName = outFileName;
        } else {
            const existing = await fs.readdir(mediaDir);
            const re = /^video_reverse_(\d+)\./i;
            let maxNum = 0;
            for (const f of existing) {
                const m = f.match(re);
                if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
            }
            const seq = String(maxNum + 1).padStart(3, '0');
            finalName = `video_reverse_${seq}.mp4`;
        }
        outputPath = path.join(mediaDir, finalName);

        const tIn  = Number(trimIn);
        const tOut = Number(trimOut);
        const hasTrim = Number.isFinite(tIn) && Number.isFinite(tOut) && tOut > tIn;

        // Trim BEFORE -i for fast input-seek; `reverse`/`areverse` buffer the
        // whole stream so trimming first keeps memory bounded on long clips.
        const args = ['-y'];
        if (hasTrim) args.push('-ss', String(tIn), '-to', String(tOut));
        args.push(
            '-i', inputPath,
            '-vf', 'reverse',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
        );
        if (srcMeta.hasAudio) args.push('-af', 'areverse', '-c:a', 'aac', '-b:a', '192k');
        else                  args.push('-an');
        args.push(outputPath);

        logger.info('project', `video-reverse ffmpeg: ${ffmpegPath} ${args.join(' ')}`);
        await execFileP(ffmpegPath, args, { maxBuffer: 8 * 1024 * 1024 });

        const outMeta = await probeVideo(outputPath) || {};

        const newId = uuidv4();
        const metaDir = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);
        const filePathUrl = `/project-file?path=${encodeURIComponent(outputPath)}`;
        const sidecar = {
            id:         newId,
            type:       'video',
            filePath:   filePathUrl,
            operation:  'reverse',
            displayName: finalName.replace(/\.[^.]+$/, ''),
            prompt:     '',
            negativePrompt: '',
            seed:       -1,
            modelId:    null,
            createdAt:  new Date().toISOString(),
            name:       null,
            uploaded:   false,
            pixelDimensions: { w: srcMeta.width, h: srcMeta.height },
            fps:        outMeta.fps        || srcMeta.fps,
            duration:   outMeta.duration   || 0,
            frameCount: outMeta.frameCount || 0,
            hasAudio:   !!outMeta.hasAudio,
            sourceItemId: itemId  || null,
            sourceGroupId: groupId || null,
        };
        const thumbAbs = path.join(metaDir, `${newId}.thumb.jpg`);
        const thumbed = await extractVideoThumb(outputPath, thumbAbs);
        if (thumbed) sidecar.thumbPath = `/project-file?path=${encodeURIComponent(thumbAbs)}`;

        await fs.writeJson(path.join(metaDir, `${newId}.json`), sidecar, { spaces: 2 });

        const item  = { ...sidecar };
        const group = {
            id:         uuidv4(),
            type:       'video',
            operation:  'reverse',
            createdAt:  new Date().toISOString(),
            fps:        sidecar.fps,
            duration:   sidecar.duration,
            items:      [item],
        };

        res.json({ success: true, item, group });
    } catch (err) {
        logger.error('project', 'video-reverse failed', err);
        if (outputPath) { try { await fs.remove(outputPath); } catch {} }
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
