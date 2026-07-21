'use strict';

/**
 * routes/videoCrop.js — POST /api/video/crop
 *
 * Body: {
 *   folderPath:  string  (project folder path),
 *   sourcePath:  string  (absolute file path OR /project-file?path=... URL),
 *   cropRect:    { x, y, width, height } — normalized 0..1 relative to source frame,
 *   absoluteCropPx: { x, y, w, h } — optional, absolute pixel rect already rounded
 *                   by the caller (MPI-261 divisible-by). When present it is used
 *                   directly and the normalized→even-snap path is skipped (the
 *                   caller's multiples of 16 are already even for libx264).
 *   outFileName: string  (optional, default "video_crop_<timestamp>.mp4"),
 *   groupId:     string  (optional — for caller context, echoed back),
 *   itemId:      string  (optional — source item id, echoed back),
 *   trimIn:      number  (optional — slice source starting at this offset, seconds),
 *   trimOut:     number  (optional — slice source ending at this offset, seconds)
 * }
 *
 * Spawns ffmpeg with -vf crop and h264+aac encode (audio copied if present).
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
const { nextSequence } = require('./projects');

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

router.post('/api/video/crop', async (req, res) => {
    let outputPath = '';
    try {
        const { folderPath, sourcePath, cropRect, absoluteCropPx, outFileName, groupId, itemId, trimIn, trimOut } = req.body || {};
        if (!folderPath || !sourcePath || !cropRect) {
            return res.status(400).json({ success: false, error: 'folderPath, sourcePath, cropRect required' });
        }
        const { x, y, width, height } = cropRect;
        if (![x, y, width, height].every(n => Number.isFinite(n))) {
            return res.status(400).json({ success: false, error: 'cropRect must be { x, y, width, height } numbers' });
        }

        const inputPath = _resolveInput(sourcePath);
        if (!(await fs.pathExists(inputPath))) {
            return res.status(404).json({ success: false, error: 'source file not found: ' + inputPath });
        }

        // 1. Probe source for dimensions + audio presence
        const srcMeta = await probeVideo(inputPath);
        if (!srcMeta || !srcMeta.width || !srcMeta.height) {
            return res.status(500).json({ success: false, error: 'could not probe source dimensions' });
        }

        // 2. Determine the pixel crop rect. If the caller supplied an
        // already-rounded absolute rect (MPI-261 divisible-by), use it directly
        // and clamp to the source — its multiples of 16 are already even, so no
        // snapEven. Otherwise map the normalized rect and snap to even (libx264).
        let cropW, cropH, cropX, cropY;
        const absOk = absoluteCropPx
            && [absoluteCropPx.x, absoluteCropPx.y, absoluteCropPx.w, absoluteCropPx.h].every(n => Number.isFinite(n));
        if (absOk) {
            cropX = Math.max(0, Math.min(Math.floor(absoluteCropPx.x), srcMeta.width  - 2));
            cropY = Math.max(0, Math.min(Math.floor(absoluteCropPx.y), srcMeta.height - 2));
            cropW = Math.max(2, Math.min(Math.floor(absoluteCropPx.w), srcMeta.width  - cropX));
            cropH = Math.max(2, Math.min(Math.floor(absoluteCropPx.h), srcMeta.height - cropY));
        } else {
            const snapEven = n => Math.max(2, Math.floor(n / 2) * 2);
            cropW = snapEven(width  * srcMeta.width);
            cropH = snapEven(height * srcMeta.height);
            cropX = Math.max(0, Math.floor(x * srcMeta.width));
            cropY = Math.max(0, Math.floor(y * srcMeta.height));
        }

        // 3. Prepare output path — sequenced "video_crop_NNN.mp4" like image crop
        const mediaDir = path.join(folderPath, 'Media');
        await fs.ensureDir(mediaDir);

        let finalName;
        if (outFileName && /\.(mp4|mov|webm)$/i.test(outFileName)) {
            finalName = outFileName;
        } else {
            finalName = await nextSequence(folderPath, mediaDir, 'video_crop', 'mp4');
        }
        outputPath = path.join(mediaDir, finalName);

        // 4. Run ffmpeg. Apply optional temporal trim via input-seek
        // (`-ss <in> -to <out>` before `-i`) — fast + keyframe-accurate; the
        // re-encode below produces clean GOPs regardless.
        const tIn  = Number(trimIn);
        const tOut = Number(trimOut);
        const hasTrim = Number.isFinite(tIn) && Number.isFinite(tOut) && tOut > tIn;

        const args = ['-y'];
        if (hasTrim) args.push('-ss', String(tIn), '-to', String(tOut));
        args.push(
            '-i', inputPath,
            '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
        );
        if (srcMeta.hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
        else                  args.push('-an');
        args.push(outputPath);

        logger.info('project', `video-crop ffmpeg: ${ffmpegPath} ${args.join(' ')}`);
        await execFileP(ffmpegPath, args, { maxBuffer: 8 * 1024 * 1024 });

        // 5. Probe output for meta
        const outMeta = await probeVideo(outputPath) || {};

        // 6. Write .meta/<uuid>.json sidecar
        const newId = uuidv4();
        const metaDir = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);
        // Cache-bust on mtime so a re-run overwriting a reused name plays fresh bytes.
        const _mtime = (await fs.stat(outputPath).catch(() => null))?.mtimeMs || 0;
        const filePathUrl = `/project-file?path=${encodeURIComponent(outputPath)}&v=${Math.round(_mtime)}`;
        const sidecar = {
            id:         newId,
            type:       'video',
            filePath:   filePathUrl,
            operation:  'crop',
            displayName: finalName.replace(/\.[^.]+$/, ''),
            prompt:     '',
            negativePrompt: '',
            seed:       -1,
            modelId:    null,
            createdAt:  new Date().toISOString(),
            name:       null,
            uploaded:   false,
            pixelDimensions: { w: cropW, h: cropH },
            cropRect:   { x, y, w: width, h: height },
            fps:        outMeta.fps        || srcMeta.fps,
            duration:   outMeta.duration   || 0,
            frameCount: outMeta.frameCount || 0,
            hasAudio:   !!outMeta.hasAudio,
            sourceItemId: itemId  || null,
            sourceGroupId: groupId || null,
        };
        // Extract first-frame thumbnail alongside sidecar
        const thumbAbs = path.join(metaDir, `${newId}.thumb.jpg`);
        const thumbed = await extractVideoThumb(outputPath, thumbAbs);
        if (thumbed) sidecar.thumbPath = `/project-file?path=${encodeURIComponent(thumbAbs)}`;

        await fs.writeJson(path.join(metaDir, `${newId}.json`), sidecar, { spaces: 2 });

        // 7. Build item + group payload for frontend addGroup()
        const item  = { ...sidecar };
        const group = {
            id:         uuidv4(),
            type:       'video',
            operation:  'crop',
            createdAt:  new Date().toISOString(),
            fps:        sidecar.fps,
            duration:   sidecar.duration,
            items:      [item],
        };

        res.json({ success: true, item, group });
    } catch (err) {
        logger.error('project', 'video-crop failed', err);
        // Cleanup partial file
        if (outputPath) { try { await fs.remove(outputPath); } catch {} }
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
