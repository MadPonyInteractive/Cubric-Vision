'use strict';

/**
 * routes/imageBake.js — POST /api/image/bake
 *
 * Accepts multipart FormData:
 *   image      — Blob (GPU-rendered PNG from rawGpuPipeline.renderFullRes())
 *   imagePath  — string (source entry filePath, stored in sidecar as sourceFile)
 *   folderPath — string (project folder path)
 *   groupId    — string (optional)
 *   itemId     — string (optional)
 *
 * Saves blob to Media/raw_NNN.png, writes .meta/<uuid>.json,
 * returns { success, item } matching imageAdjust.js full-res shape.
 */

const express  = require('express');
const router   = express.Router();
const fs       = require('fs-extra');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const multer   = require('multer');
const logger   = require('./logger');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/api/image/bake', upload.single('image'), async (req, res) => {
    try {
        const { imagePath, folderPath, groupId, itemId } = req.body || {};

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'image blob required' });
        }
        if (!folderPath) {
            return res.status(400).json({ success: false, error: 'folderPath required' });
        }

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);

        // Sequenced filename matching imageAdjust.js convention: raw_001.png, raw_002.png, ...
        const existing = await fs.readdir(mediaDir);
        let maxNum = 0;
        const re = /^raw_(\d+)\./i;
        for (const f of existing) {
            const m = f.match(re);
            if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
        }
        const seq      = String(maxNum + 1).padStart(3, '0');
        const filename = `raw_${seq}.png`;
        const outputPath = path.join(mediaDir, filename);

        await fs.writeFile(outputPath, req.file.buffer);

        // Pixel dimensions from PNG header (IHDR at byte 16: 4B width, 4B height)
        let pw = 0, ph = 0;
        const buf = req.file.buffer;
        if (buf.length >= 24) {
            pw = buf.readUInt32BE(16);
            ph = buf.readUInt32BE(20);
        }

        const newId      = uuidv4();
        const filePathUrl = `/project-file?path=${encodeURIComponent(outputPath)}`;
        const displayName = filename.replace(/\.[^.]+$/, '');

        const sidecar = {
            id:              newId,
            type:            'image',
            filePath:        filePathUrl,
            operation:       displayName,
            prompt:          '',
            negativePrompt:  '',
            seed:            -1,
            modelId:         null,
            createdAt:       new Date().toISOString(),
            name:            null,
            uploaded:        false,
            pixelDimensions: { w: pw, h: ph },
            sourceFile:      imagePath || '',
        };

        await fs.writeJson(path.join(metaDir, `${newId}.json`), sidecar, { spaces: 2 });

        logger.info('project', `image-bake saved ${filename} (${pw}×${ph})`);
        return res.json({ success: true, item: { ...sidecar } });

    } catch (err) {
        logger.error('project', 'image-bake failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
