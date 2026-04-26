'use strict';

/**
 * routes/imageAdjust.js — POST /api/image/adjust
 *
 * Body: {
 *   imagePath:   string  (absolute path OR /project-file?path=... URL),
 *   folderPath:  string  (project folder path — required for full-res save),
 *   params:      AdjustParams,
 *   preview?:    boolean (default false),
 *   autoWB?:     boolean (compute grey-world WB, return { whiteBalance }),
 *   groupId?:    string,
 *   itemId?:     string,
 * }
 *
 * preview: true  → resize ≤800px, return { success, previewBase64 }
 * preview: false → full-res Sharp pipeline, save Media/<uuid>.jpg,
 *                  write .meta/<uuid>.json, return { success, item }
 * autoWB: true   → grey-world analysis only, return { success, whiteBalance }
 *
 * AdjustParams: {
 *   exposure, shadows, saturation, dehaze, grain, curve,
 *   noiseReduction, sharpening, whiteBalance,
 *   hueR, hueG, hueB, hueC, hueM, hueY,
 *   satR, satG, satB, satC, satM, satY,
 * }
 *
 * Sharp pipeline order:
 *   linear (exposure) → tint (WB) → modulate (saturation) → dehaze →
 *   per-color HSL → gamma (curve) → sharpen → blur (NR) → grain composite
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs-extra');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const logger  = require('./logger');

// ─── helpers ────────────────────────────────────────────────────────────────

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

function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── Sharp pipeline steps ────────────────────────────────────────────────────

function applyExposure(pipeline, ev) {
    if (ev === 0) return pipeline;
    return pipeline.linear(Math.pow(2, ev), 0);
}

function applyShadows(pipeline, v) {
    // Lift-only: adds offset to lift shadows without blowing highlights
    if (v === 0) return pipeline;
    const offset = (v / 100) * 30;
    return pipeline.linear(1, offset);
}

function applyWhiteBalance(pipeline, v) {
    if (v === 0) return pipeline;
    const t = v / 100;
    const rScale = 1 + t * 0.2;
    const bScale = 1 - t * 0.2;
    return pipeline.recomb([
        [rScale, 0, 0],
        [0, 1, 0],
        [0, 0, bScale],
    ]);
}

function applySaturation(pipeline, v) {
    if (v === 0) return pipeline;
    return pipeline.modulate({ saturation: _clamp(1 + v / 100, 0, 4) });
}

function applyCurve(pipeline, v) {
    if (v === 0) return pipeline;
    // Sharp .gamma() accepts 1.0–3.0 only. Use .linear() for values outside that range.
    const g = 1 / (1 + v / 100);
    if (g >= 1.0 && g <= 3.0) {
        return pipeline.gamma(g);
    }
    // For gamma < 1 (lighten): approximate with linear brightness boost
    const multiplier = 1 / g;
    return pipeline.linear(multiplier, 0);
}

function applySharpening(pipeline, v) {
    if (v === 0) return pipeline;
    return pipeline.sharpen({ sigma: 0.5 + (v / 100) * 2 });
}

function applyNoiseReduction(pipeline, v) {
    if (v === 0) return pipeline;
    return pipeline.blur(_clamp(v / 100 * 2, 0.3, 2));
}

// Dehaze via dark channel prior — operates on raw pixel buffer
async function applyDehaze(pipeline, strength) {
    if (strength === 0) return pipeline;

    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const s = strength / 100;
    const patchR = Math.max(1, Math.round(Math.min(width, height) * 0.015));
    const buf = Buffer.from(data);

    // Build dark channel
    const dark = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * channels;
            dark[y * width + x] = Math.min(buf[i] / 255, buf[i + 1] / 255, buf[i + 2] / 255);
        }
    }

    // Min-filter over patch
    const darkFiltered = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let minVal = 1;
            for (let dy = -patchR; dy <= patchR; dy++) {
                const ny = _clamp(y + dy, 0, height - 1);
                for (let dx = -patchR; dx <= patchR; dx++) {
                    const nx = _clamp(x + dx, 0, width - 1);
                    const v = dark[ny * width + nx];
                    if (v < minVal) minVal = v;
                }
            }
            darkFiltered[y * width + x] = minVal;
        }
    }

    // Estimate atmospheric light from top-0.1% brightest dark-channel pixels
    const sortedDark = Float32Array.from(darkFiltered).sort().reverse();
    const topCount = Math.max(1, Math.floor(width * height * 0.001));
    let A = 0;
    for (let k = 0; k < topCount; k++) A += sortedDark[k];
    A = A / topCount;
    A = _clamp(A, 0.3, 1.0);

    // Remove haze: J(x) = (I(x) - A) / max(t(x), 0.1) + A  where t(x) = 1 - omega * dark(x)/A
    const omega = s * 0.95;
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < width * height; i++) {
        const t = Math.max(0.1, 1 - omega * (darkFiltered[i] / A));
        for (let c = 0; c < 3; c++) {
            const norm = buf[i * channels + c] / 255;
            const dehazed = (norm - A) / t + A;
            out[i * channels + c] = _clamp(Math.round(dehazed * 255), 0, 255);
        }
        if (channels === 4) out[i * channels + 3] = buf[i * channels + 3];
    }

    const sharp = require('sharp');
    return sharp(out, { raw: { width, height, channels } });
}

// Grain via noise buffer composite
async function applyGrain(pipeline, strength, width, height) {
    if (strength === 0) return pipeline;

    const sharp = require('sharp');
    const opacity = _clamp(strength / 100 * 0.25, 0, 0.25);
    const noiseLen = width * height * 3;
    const noiseBuf = Buffer.alloc(noiseLen);
    for (let i = 0; i < noiseLen; i++) {
        noiseBuf[i] = Math.round(Math.random() * 255);
    }
    const noiseImg = await sharp(noiseBuf, { raw: { width, height, channels: 3 } })
        .jpeg({ quality: 95 })
        .toBuffer();

    return pipeline.composite([{ input: noiseImg, blend: 'overlay' }]);
}

// Per-color HSL calibration
// Hue ranges: R=0±30, G=120±30, B=240±30, C=180±30, M=300±30, Y=60±30
const HSL_RANGES = {
    R: 0, G: 120, B: 240, C: 180, M: 300, Y: 60,
};

async function applyHSLCalibration(pipeline, params) {
    const keys = ['R', 'G', 'B', 'C', 'M', 'Y'];
    const active = keys.filter(k => (params[`hue${k}`] || 0) !== 0 || (params[`sat${k}`] || 0) !== 0);
    if (active.length === 0) return pipeline;

    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const buf = Buffer.from(data);
    const out = Buffer.from(buf);

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else                h = (r - g) / d + 4;
        return [h * 60, s, l];
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60)       { r=c; g=x; b=0; }
        else if (h < 120) { r=x; g=c; b=0; }
        else if (h < 180) { r=0; g=c; b=x; }
        else if (h < 240) { r=0; g=x; b=c; }
        else if (h < 300) { r=x; g=0; b=c; }
        else              { r=c; g=0; b=x; }
        return [
            _clamp(Math.round((r + m) * 255), 0, 255),
            _clamp(Math.round((g + m) * 255), 0, 255),
            _clamp(Math.round((b + m) * 255), 0, 255),
        ];
    }

    function hueDist(a, b) {
        const d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

    for (let i = 0; i < width * height; i++) {
        const pi = i * channels;
        const [h, s, l] = rgbToHsl(buf[pi], buf[pi + 1], buf[pi + 2]);

        let dh = 0, ds = 0;
        for (const k of active) {
            const center = HSL_RANGES[k];
            const dist = hueDist(h, center);
            if (dist > 30) continue;
            const weight = (30 - dist) / 30;
            dh += (params[`hue${k}`] || 0) * weight;
            ds += (params[`sat${k}`] || 0) / 100 * weight;
        }

        if (dh === 0 && ds === 0) continue;
        const newH = h + dh;
        const newS = _clamp(s + ds, 0, 1);
        const [nr, ng, nb] = hslToRgb(newH, newS, l);
        out[pi]     = nr;
        out[pi + 1] = ng;
        out[pi + 2] = nb;
        if (channels === 4) out[pi + 3] = buf[pi + 3];
    }

    const sharp = require('sharp');
    return sharp(out, { raw: { width, height, channels } });
}

// Grey-world auto white balance — returns WB value in -100..+100 range
async function computeAutoWB(imagePath) {
    const sharp = require('sharp');
    const { data, info } = await sharp(imagePath)
        .resize(200, 200, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { channels } = info;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += channels) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
    }
    const rAvg = rSum / count;
    const bAvg = bSum / count;
    // Return correction: negate measured imbalance so applyWhiteBalance corrects it
    const diff = rAvg - bAvg;
    return _clamp(Math.round(-diff / 2.55 * 0.5), -100, 100);
}

// ─── Build Sharp pipeline from params ───────────────────────────────────────

async function buildPipeline(inputPath, params, forPreview) {
    const sharp = require('sharp');

    // Resolve effective dimensions upfront (needed for grain buffer)
    const srcMeta = await sharp(inputPath).metadata();
    let effectiveW = srcMeta.width;
    let effectiveH = srcMeta.height;
    if (forPreview && (effectiveW > 800 || effectiveH > 800)) {
        const scale = Math.min(800 / effectiveW, 800 / effectiveH);
        effectiveW = Math.round(effectiveW * scale);
        effectiveH = Math.round(effectiveH * scale);
    }

    let pipeline = sharp(inputPath);

    if (forPreview) {
        pipeline = pipeline.resize(800, 800, { fit: 'inside', withoutEnlargement: true });
    }

    // 1. Exposure
    pipeline = applyExposure(pipeline, params.exposure || 0);

    // 2. Shadows
    pipeline = applyShadows(pipeline, params.shadows || 0);

    // 3. White Balance
    pipeline = applyWhiteBalance(pipeline, params.whiteBalance || 0);

    // 4. Saturation
    pipeline = applySaturation(pipeline, params.saturation || 0);

    // 5. Dehaze (requires raw pixel access — reassigns pipeline)
    pipeline = await applyDehaze(pipeline, params.dehaze || 0);

    // 6. Per-color HSL calibration (requires raw pixel access — reassigns pipeline)
    pipeline = await applyHSLCalibration(pipeline, params);

    // 7. Point curve (gamma)
    pipeline = applyCurve(pipeline, params.curve || 0);

    // 8. Sharpening
    pipeline = applySharpening(pipeline, params.sharpening || 0);

    // 9. Noise reduction
    pipeline = applyNoiseReduction(pipeline, params.noiseReduction || 0);

    // 10. Grain composite
    pipeline = await applyGrain(pipeline, params.grain || 0, effectiveW, effectiveH);

    return pipeline;
}

// ─── Route ──────────────────────────────────────────────────────────────────

router.post('/api/image/adjust', async (req, res) => {
    try {
        const { imagePath, folderPath, params = {}, preview = false, autoWB = false, groupId, itemId } = req.body || {};

        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath required' });
        }

        const inputPath = _resolveInput(imagePath);
        if (!(await fs.pathExists(inputPath))) {
            return res.status(404).json({ success: false, error: 'source file not found: ' + inputPath });
        }

        // Auto white balance analysis only
        if (autoWB) {
            const whiteBalance = await computeAutoWB(inputPath);
            return res.json({ success: true, whiteBalance });
        }

        if (preview) {
            // Fast preview: resize + pipeline → base64 JPEG
            const pipeline = await buildPipeline(inputPath, params, true);
            const buf = await pipeline.jpeg({ quality: 80 }).toBuffer();
            const previewBase64 = 'data:image/jpeg;base64,' + buf.toString('base64');
            return res.json({ success: true, previewBase64 });
        }

        // Full-res save
        if (!folderPath) {
            return res.status(400).json({ success: false, error: 'folderPath required for full-res apply' });
        }

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);

        const newId = uuidv4();

        // Sequenced filename: raw_001.jpg, raw_002.jpg, ...
        const existing = await fs.readdir(mediaDir);
        let maxNum = 0;
        const re = /^raw_(\d+)\./i;
        for (const f of existing) {
            const m = f.match(re);
            if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
        }
        const seq      = String(maxNum + 1).padStart(3, '0');
        const filename = `raw_${seq}.jpg`;
        const outputPath = path.join(mediaDir, filename);

        // Get source dimensions for sidecar
        const sharp = require('sharp');
        const srcMeta = await sharp(inputPath).metadata();

        const pipeline = await buildPipeline(inputPath, params, false);
        await pipeline.jpeg({ quality: 95 }).toFile(outputPath);

        // Get output dimensions
        const outMeta = await sharp(outputPath).metadata();

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
            pixelDimensions: { w: outMeta.width || srcMeta.width || 0, h: outMeta.height || srcMeta.height || 0 },
            sourceFile:      inputPath,
        };

        await fs.writeJson(path.join(metaDir, `${newId}.json`), sidecar, { spaces: 2 });

        const item = { ...sidecar };
        return res.json({ success: true, item });

    } catch (err) {
        logger.error('project', 'image-adjust failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
