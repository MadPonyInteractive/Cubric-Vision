'use strict';

/**
 * routes/videoConcat.js — server-side video concat endpoints.
 *
 * Routes:
 *   GET  /concat/events/stream — SSE channel; emits `concat:progress` +
 *                                 `concat:done` + `concat:error` events
 *   POST /combine-videos       — concat N items, writes combined_NNN.mp4
 *   POST /extend-video         — concat source + freshly-generated mp4,
 *                                 writes extended_NNN.mp4, sidecar links
 *                                 back via `extendedFrom`
 *
 * Sidecar IDs are resolved from `<projectFolder>/Media/.meta/<id>.json`.
 * Output sidecars follow the same shape as save-generation + videoCrop.
 *
 * Progress streams to the SSE channel keyed by `jobId` (client-supplied or
 * server-generated). The frontend bridge in js/services/concatProgress.js
 * forwards to StatusBar.progress.*.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs-extra');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { concatVideos } = require('../services/videoConcat');
const { probeVideo }   = require('../services/ffprobeVideo');
const { extractVideoThumb } = require('../services/ffmpegThumb');

// ── SSE channel ──────────────────────────────────────────────────────────────
const _clients = new Set();

function _broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of _clients) {
        try { client.write(payload); } catch (_) { /* dropped */ }
    }
}

router.get('/concat/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();
    _clients.add(res);
    res.write(`event: connected\ndata: {}\n\n`);
    req.on('close', () => { _clients.delete(res); });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function _decodeProjectFilePath(value) {
    if (!value) return null;
    if (value.includes('project-file?path=')) {
        try {
            const u = new URL(value, 'http://localhost');
            return decodeURIComponent(u.searchParams.get('path') || '');
        } catch (_) { return null; }
    }
    return value;
}

async function _readSidecar(metaDir, itemId) {
    const p = path.join(metaDir, `${itemId}.json`);
    if (!(await fs.pathExists(p))) return null;
    try { return await fs.readJson(p); }
    catch (_) { return null; }
}

async function _resolveItemPath(metaDir, itemId) {
    const sidecar = await _readSidecar(metaDir, itemId);
    if (!sidecar) return { abs: null, sidecar: null };
    const abs = _decodeProjectFilePath(sidecar.filePath);
    return { abs, sidecar };
}

async function _nextSequencedName(mediaDir, prefix, ext = 'mp4') {
    const entries = await fs.readdir(mediaDir);
    const re = new RegExp(`^${prefix}_(\\d+)\\.`, 'i');
    let maxNum = 0;
    for (const f of entries) {
        const m = f.match(re);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }
    const seq = String(maxNum + 1).padStart(3, '0');
    return `${prefix}_${seq}.${ext}`;
}

function _makeProgressEmitter(jobId) {
    let last = -1;
    return ratio => {
        // Throttle: only emit when ratio changes by ≥ 0.01 (1%)
        if (ratio - last < 0.01 && ratio < 0.999) return;
        last = ratio;
        _broadcast('concat:progress', { jobId, ratio });
    };
}

async function _writeOutputSidecar({ mediaDir, metaDir, outputPath, finalName, operation, extraFields = {} }) {
    const outMeta = await probeVideo(outputPath) || {};
    const newId   = uuidv4();
    const filePathUrl = `/project-file?path=${encodeURIComponent(outputPath)}`;
    const sidecar = {
        id:         newId,
        type:       'video',
        filePath:   filePathUrl,
        operation,
        displayName: finalName.replace(/\.[^.]+$/, ''),
        prompt:     '',
        negativePrompt: '',
        seed:       -1,
        modelId:    null,
        createdAt:  new Date().toISOString(),
        name:       null,
        uploaded:   false,
        pixelDimensions: { w: outMeta.width || 0, h: outMeta.height || 0 },
        fps:        outMeta.fps        || 0,
        duration:   outMeta.duration   || 0,
        frameCount: outMeta.frameCount || 0,
        hasAudio:   !!outMeta.hasAudio,
        videoMeta:  {
            fps:        outMeta.fps        || 0,
            duration:   outMeta.duration   || 0,
            frameCount: outMeta.frameCount || 0,
            hasAudio:   !!outMeta.hasAudio,
        },
        ...extraFields,
    };
    const thumbAbs = path.join(metaDir, `${newId}.thumb.jpg`);
    const thumbed = await extractVideoThumb(outputPath, thumbAbs);
    if (thumbed) sidecar.thumbPath = `/project-file?path=${encodeURIComponent(thumbAbs)}`;
    await fs.writeJson(path.join(metaDir, `${newId}.json`), sidecar, { spaces: 2 });
    return sidecar;
}

// ── POST /combine-videos ─────────────────────────────────────────────────────
/**
 * Body: {
 *   folderPath: string,       // absolute project folder
 *   itemIds:    string[],     // ≥2 item UUIDs in chronological order
 *   jobId?:     string,       // optional client-supplied id (echoed in SSE)
 * }
 * Response: { success, item, group, method }
 */
router.post('/combine-videos', async (req, res) => {
    const { folderPath, itemIds, jobId: clientJobId } = req.body || {};
    const jobId = clientJobId || `combine-${Date.now()}`;
    let outputPath = '';

    try {
        if (!folderPath) {
            return res.status(400).json({ success: false, error: 'folderPath required' });
        }
        if (!Array.isArray(itemIds) || itemIds.length < 2) {
            return res.status(400).json({ success: false, error: 'itemIds[] with ≥2 entries required' });
        }

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        if (!(await fs.pathExists(metaDir))) {
            return res.status(404).json({ success: false, error: '.meta directory missing' });
        }

        // Resolve all source paths
        const inputs = [];
        for (const id of itemIds) {
            const { abs, sidecar } = await _resolveItemPath(metaDir, id);
            if (!abs || !(await fs.pathExists(abs))) {
                return res.status(404).json({ success: false, error: `source file missing for item ${id}` });
            }
            if (sidecar.type !== 'video') {
                return res.status(400).json({ success: false, error: `item ${id} is not a video` });
            }
            inputs.push(abs);
        }

        const finalName = await _nextSequencedName(mediaDir, 'combined', 'mp4');
        outputPath = path.join(mediaDir, finalName);

        _broadcast('concat:progress', { jobId, ratio: 0 });
        const onProgress = _makeProgressEmitter(jobId);
        const result = await concatVideos(inputs, outputPath, { onProgress });

        const sidecar = await _writeOutputSidecar({
            mediaDir, metaDir, outputPath, finalName, operation: 'combine',
        });

        const item = { ...sidecar };
        const group = {
            id:         uuidv4(),
            type:       'video',
            operation:  'combine',
            createdAt:  new Date().toISOString(),
            fps:        sidecar.fps,
            duration:   sidecar.duration,
            items:      [item],
        };

        _broadcast('concat:done', { jobId, item, group, method: result.method });
        res.json({ success: true, item, group, method: result.method, jobId });
    } catch (err) {
        logger.error('project', 'combine-videos failed', err);
        if (outputPath) { try { await fs.remove(outputPath); } catch {} }
        const _shortErr = String(err.message || 'unknown').split('\n')[0].slice(0, 200);
        _broadcast('concat:error', { jobId, error: _shortErr });
        res.status(500).json({ success: false, error: _shortErr, jobId });
    }
});

// ── POST /extend-video ───────────────────────────────────────────────────────
/**
 * Body: {
 *   folderPath:          string,   // absolute project folder
 *   sourceItemId:        string,   // existing video item to extend
 *   generatedFilePath:   string,   // absolute path to fresh I2V output (will be deleted on success)
 *   jobId?:              string,
 *   modelId?:            string,
 *   prompt?:             string,
 *   negativePrompt?:     string,
 *   seed?:               number,
 *   frozenParams?:       object,   // echoed into sidecar (advisory)
 *   op?:                 string,   // operation key from caller (advisory)
 *   trimIn?:             number,   // optional; slice source video starting at this offset (s)
 *   trimOut?:            number,   // optional; slice source video ending at this offset (s)
 * }
 * Response: { success, item, method }
 */
router.post('/extend-video', async (req, res) => {
    const {
        folderPath, sourceItemId, generatedFilePath,
        jobId: clientJobId,
        modelId, prompt, negativePrompt, seed,
        frozenParams, op,
        trimIn, trimOut,
    } = req.body || {};
    const jobId = clientJobId || `extend-${Date.now()}`;
    let outputPath = '';
    let resolvedGenPath = '';

    try {
        if (!folderPath || !sourceItemId || !generatedFilePath) {
            return res.status(400).json({
                success: false,
                error: 'folderPath, sourceItemId, generatedFilePath required',
            });
        }

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        if (!(await fs.pathExists(metaDir))) {
            return res.status(404).json({ success: false, error: '.meta directory missing' });
        }

        const { abs: sourcePath, sidecar: sourceSidecar } = await _resolveItemPath(metaDir, sourceItemId);
        if (!sourcePath || !(await fs.pathExists(sourcePath))) {
            return res.status(404).json({ success: false, error: `source file missing for ${sourceItemId}` });
        }
        if (sourceSidecar.type !== 'video') {
            return res.status(400).json({ success: false, error: 'source is not a video' });
        }

        resolvedGenPath = _decodeProjectFilePath(generatedFilePath) || generatedFilePath;
        if (!(await fs.pathExists(resolvedGenPath))) {
            return res.status(404).json({ success: false, error: `generated file missing: ${resolvedGenPath}` });
        }

        const finalName = await _nextSequencedName(mediaDir, 'extended', 'mp4');
        outputPath = path.join(mediaDir, finalName);

        _broadcast('concat:progress', { jobId, ratio: 0 });
        const onProgress = _makeProgressEmitter(jobId);

        // Build per-input range list. Source is index 0; only it carries trim.
        const inputRanges = [null, null];
        const tIn  = Number(trimIn);
        const tOut = Number(trimOut);
        if (Number.isFinite(tIn) && Number.isFinite(tOut) && tOut > tIn) {
            inputRanges[0] = { in: tIn, out: tOut };
        }

        const result = await concatVideos(
            [sourcePath, resolvedGenPath],
            outputPath,
            { onProgress, inputRanges },
        );

        const displayName = sourceSidecar.displayName || sourceSidecar.name || sourceItemId.slice(0, 8);
        const extraFields = {
            extendedFrom: { id: sourceItemId, displayName },
        };
        if (modelId)        extraFields.modelId        = modelId;
        if (prompt)         extraFields.prompt         = prompt;
        if (negativePrompt) extraFields.negativePrompt = negativePrompt;
        if (Number.isFinite(seed)) extraFields.seed    = seed;
        if (frozenParams)   extraFields.frozenParams   = frozenParams;
        if (op)             extraFields.sourceOperation = op;

        const sidecar = await _writeOutputSidecar({
            mediaDir, metaDir, outputPath, finalName, operation: 'extend',
            extraFields,
        });

        // Delete the intermediate generated file (caller passed it in; disk hygiene).
        // Belt+suspenders: never delete the source. Probe path equality first.
        try {
            if (path.normalize(resolvedGenPath) !== path.normalize(sourcePath) &&
                path.normalize(resolvedGenPath) !== path.normalize(outputPath)) {
                await fs.remove(resolvedGenPath);
                // Companion sidecar/thumb for the intermediate file may already
                // have been written by save-generation — leave that cleanup to
                // the caller (it knows the itemId).
            }
        } catch (rmErr) {
            logger.warn('project', `extend: intermediate cleanup failed: ${rmErr.message}`);
        }

        const item = { ...sidecar };
        _broadcast('concat:done', { jobId, item, method: result.method });
        res.json({ success: true, item, method: result.method, jobId });
    } catch (err) {
        logger.error('project', 'extend-video failed', err);
        if (outputPath) { try { await fs.remove(outputPath); } catch {} }
        const _shortErr = String(err.message || 'unknown').split('\n')[0].slice(0, 200);
        _broadcast('concat:error', { jobId, error: _shortErr });
        res.status(500).json({ success: false, error: _shortErr, jobId });
    }
});

module.exports = router;
