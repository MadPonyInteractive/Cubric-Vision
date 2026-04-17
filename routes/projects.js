/**
 * routes/projects.js — Project CRUD and media library routes.
 *
 * Routes exposed:
 *   POST   /choose-folder                           (duplicated here for backward compat — handled by system.js)
 *   POST   /create-project
 *   POST   /list-projects
 *   POST   /get-project
 *   POST   /update-project
 *   POST   /delete-project
 *   GET    /project-media/:projectId
 *   DELETE /project-media/:projectId/:filename
 *   GET    /project-media/:projectId/download/:filename
 *   POST   /project-media/:projectId/update-meta
 *   POST   /project-media/:projectId/upload
 *   POST   /project-data/:projectId/upload
 *   GET    /project-file
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs     = require('fs-extra');
const path   = require('path');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');
const { DEFAULT_PROJECTS_ROOT, COMFYUI_PORT, streamDownload } = require('./shared');

// ── Project CRUD ──────────────────────────────────────────────────────────────

router.post('/create-project', async (req, res) => {
    try {
        const { name, folderPath } = req.body;
        const id = uuidv4();
        const sanitizedName = (name || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').trim();

        let projectRoot;
        if (folderPath) {
            const lastPart = path.basename(folderPath);
            if (lastPart.toLowerCase() === sanitizedName.toLowerCase()) {
                projectRoot = folderPath;
            } else {
                projectRoot = path.join(folderPath, sanitizedName);
            }
        } else {
            projectRoot = path.join(DEFAULT_PROJECTS_ROOT, sanitizedName);
        }

        if (await fs.pathExists(projectRoot)) {
            projectRoot = `${projectRoot}_${id.slice(0, 8)}`;
        }

        const mediaDir = path.join(projectRoot, 'Media');
        await fs.ensureDir(mediaDir);

        const project = {
            id,
            name: name || 'Untitled Project',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            folderPath: projectRoot.replace(/\\/g, '/'),
            thumbnail: null,
            schemaVersion: 1,
            itemGroups: [],
            modelSettings: {},
            toolSettings: {},
            tutorialSeen: false,
        };

        await fs.writeJson(path.join(projectRoot, 'project.json'), project, { spaces: 2 });
        await fs.writeFile(path.join(projectRoot, 'project.md'), `# ${project.name}\n\nProject notes go here.\n`);
        res.json({ success: true, project });
    } catch (err) {
        logger.error('project', 'create-project error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/list-projects', async (req, res) => {
    try {
        const { extraPaths = [] } = req.body;
        const roots = [DEFAULT_PROJECTS_ROOT, ...extraPaths];
        const projects = [];

        for (const root of roots) {
            if (!(await fs.pathExists(root))) continue;
            const entries = await fs.readdir(root);
            for (const entry of entries) {
                const jsonPath = path.join(root, entry, 'project.json');
                if (await fs.pathExists(jsonPath)) {
                    try {
                        const p = await fs.readJson(jsonPath);
                        let recentThumbnail = null;
                        try {
                            const mediaDir = path.join(root, entry, 'Media');
                            if (await fs.pathExists(mediaDir)) {
                                const mediaFiles = await fs.readdir(mediaDir);
                                const candidates = [];
                                const filesToScan = mediaFiles.slice(0, 100);
                                for (const f of filesToScan) {
                                    const ext = path.extname(f).toLowerCase().slice(1);
                                    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'webm'].includes(ext)) {
                                        const stats = await fs.stat(path.join(mediaDir, f));
                                        candidates.push({ name: f, mtime: stats.mtime });
                                    }
                                }
                                if (candidates.length) {
                                    candidates.sort((a, b) => b.mtime - a.mtime);
                                    recentThumbnail = `/project-file?path=${encodeURIComponent(path.join(mediaDir, candidates[0].name))}`;
                                }
                            }
                        } catch (e) { /* silent fail for media scan */ }
                        projects.push({ ...p, recentThumbnail });
                    } catch (_) { /* skip corrupt entries */ }
                }
            }
        }

        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const seen = new Set();
        const unique = projects.filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
        });
        res.json({ success: true, projects: unique });
    } catch (err) {
        logger.error('project', 'list-projects error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/get-project', async (req, res) => {
    try {
        const { folderPath } = req.body;
        const project = await fs.readJson(path.join(folderPath, 'project.json'));
        res.json({ success: true, project });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/update-project', async (req, res) => {
    try {
        const { folderPath, updates } = req.body;
        const jsonPath = path.join(folderPath, 'project.json');
        const project = await fs.readJson(jsonPath);
        const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
        await fs.writeJson(jsonPath, updated, { spaces: 2 });
        res.json({ success: true, project: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/delete-project', async (req, res) => {
    try {
        const { folderPath } = req.body;
        const jsonPath = path.join(folderPath, 'project.json');
        if (!(await fs.pathExists(jsonPath))) {
            return res.status(400).json({ success: false, error: 'Not a valid project folder.' });
        }
        await fs.remove(folderPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Media Library ─────────────────────────────────────────────────────────────

router.get('/project-media/:projectId', async (req, res) => {
    try {
        const { folderPath } = req.query;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });

        const mediaDir = path.join(folderPath, 'Media');
        if (!(await fs.pathExists(mediaDir))) return res.json({ success: true, files: [] });

        const entries = await fs.readdir(mediaDir);
        const realFiles = entries.filter(e => !e.endsWith('.meta.json') && !e.endsWith('.json'));

        const files = await Promise.all(realFiles.map(async (name) => {
            const filePath = path.join(mediaDir, name);
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) return null;

            const ext = path.extname(name).toLowerCase().slice(1);
            let type = 'other';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) type = 'image';
            else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) type = 'video';
            else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) type = 'audio';

            let promptContext = null;
            let seed = null;
            let resolution = '';
            const metaPath = filePath + '.json';
            let metadata = {};

            if (await fs.pathExists(metaPath)) {
                try {
                    metadata = await fs.readJson(metaPath);
                    promptContext = metadata.promptContext || metadata.prompt || null;
                    seed = metadata.seed || null;
                    if (metadata.width && metadata.height) resolution = `${metadata.width}x${metadata.height}`;
                } catch (e) { }
            }

            if (!promptContext && ext === 'png') {
                try {
                    const buffer = await fs.readFile(filePath);
                    const contentStr = buffer.toString('binary');
                    const promptIdx = contentStr.indexOf('prompt\0');
                    if (promptIdx !== -1) {
                        const startIdx = promptIdx + 7;
                        const firstBracket = contentStr.indexOf('{', startIdx);
                        if (firstBracket !== -1) {
                            let depth = 0, lastIdx = -1;
                            for (let i = firstBracket; i < contentStr.length; i++) {
                                if (contentStr[i] === '{') depth++;
                                else if (contentStr[i] === '}') depth--;
                                if (depth === 0) { lastIdx = i; break; }
                            }
                            if (lastIdx !== -1) {
                                const fullPrompt = JSON.parse(contentStr.slice(firstBracket, lastIdx + 1));
                                if (fullPrompt['1460']?.inputs?.text) promptContext = fullPrompt['1460'].inputs.text;
                                if (fullPrompt['1454']?.inputs?.seed) seed = fullPrompt['1454'].inputs.seed;
                                else if (fullPrompt['1466']?.inputs?.noise_seed) seed = fullPrompt['1466'].inputs.noise_seed;
                            }
                        }
                    }
                } catch (e) { /* silent parse fail */ }
            }

            return { name, type, size: stat.size, path: filePath, ext, promptContext, seed, resolution, metadata, mtime: stat.mtimeMs };
        }));

        res.json({ success: true, files: files.filter(Boolean) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/project-media/:projectId/:filename', async (req, res) => {
    try {
        const { folderPath, itemId } = req.query;
        const { filename } = req.params;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });

        const mediaDir = path.join(folderPath, 'Media');
        const filePath = path.join(mediaDir, filename);

        // Delete the UUID-based .meta/<uuid>.json if itemId is provided
        if (itemId) {
            const uuidMetaPath = path.join(mediaDir, '.meta', `${itemId}.json`);
            if (await fs.pathExists(uuidMetaPath)) await fs.remove(uuidMetaPath);
        }

        // Delete the legacy filename-based .meta/ sidecar
        const legacyMetaPath = filePath + '.json';
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            if (await fs.pathExists(legacyMetaPath)) await fs.remove(legacyMetaPath);
            res.json({ success: true, message: 'Permanently deleted' });
        } else if (itemId) {
            // File already gone — still OK if we cleaned up the meta
            res.json({ success: true, message: 'Meta cleaned up' });
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } catch (err) {
        logger.error('project', 'delete failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/project-media/:projectId/download/:filename', async (req, res) => {
    try {
        const { folderPath } = req.query;
        const { filename } = req.params;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });
        const filePath = path.join(folderPath, 'Media', filename);
        if (await fs.pathExists(filePath)) {
            res.download(filePath, filename);
        } else {
            res.status(404).send('File not found');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/project-media/:projectId/update-meta', async (req, res) => {
    try {
        const { folderPath } = req.query;
        const { filename, updates } = req.body;
        if (!folderPath || !filename || !updates) {
            return res.status(400).json({ success: false, error: 'folderPath, filename and updates required' });
        }
        const mediaDir = path.join(folderPath, 'Media');
        const metaPath = path.join(mediaDir, filename + '.json');
        let meta = {};
        if (await fs.pathExists(metaPath)) meta = await fs.readJson(metaPath);
        meta = { ...meta, ...updates };
        await fs.ensureDir(mediaDir);
        await fs.writeJson(metaPath, meta, { spaces: 2 });
        res.json({ success: true, metadata: meta });
    } catch (err) {
        logger.error('project', 'update-meta failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/project-media/:projectId/upload', async (req, res) => {
    try {
        const { folderPath } = req.query;
        const { filename, base64Data, promptContext, seed, autoSequence } = req.body;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });
        if (!filename || !base64Data) return res.status(400).json({ success: false, error: 'filename and base64Data required' });

        const mediaDir = path.join(folderPath, 'Media');
        await fs.ensureDir(mediaDir);

        let finalFileName = filename;
        if (autoSequence) {
            const entries = await fs.readdir(mediaDir);
            let maxNum = 0;
            entries.forEach(e => {
                const m = e.match(/^mpiAiSuite_(\d+)/);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            });
            const nextNum = (maxNum + 1).toString().padStart(5, '0');
            const ext = finalFileName.split('.').pop() || 'png';
            finalFileName = `mpiAiSuite_${nextNum}.${ext}`;
        }

        const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Content, 'base64');
        const filePath = path.join(mediaDir, finalFileName);
        await fs.writeFile(filePath, buffer);

        // Metadata lives in Media/.meta/ not alongside the file
        const metaDir = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);
        const metaPath = path.join(metaDir, finalFileName + '.json');
        const meta = {
            promptContext: promptContext || '',
            negativePrompt: req.body.negativePrompt || '',
            seed: seed || null,
            width: req.body.width || null,
            height: req.body.height || null,
            timestamp: new Date().toISOString()
        };
        await fs.writeJson(metaPath, meta, { spaces: 2 });
        res.json({ success: true, filePath, filename: finalFileName });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Handles raw binary uploads for large files (videos, audio).
 * Expects headers: 
 *   x-filename: final_name.mp4
 *   content-type: application/octet-stream (or specific)
 */
router.post('/project-media/:projectId/upload-raw', async (req, res) => {
    try {
        const { folderPath } = req.query;
        const filename = req.headers['x-filename'];

        if (!folderPath || !filename) {
            return res.status(400).json({ success: false, error: 'folderPath and x-filename header required' });
        }

        const mediaDir = path.join(folderPath, 'Media');
        await fs.ensureDir(mediaDir);
        const filePath = path.join(mediaDir, filename);

        const writeStream = fs.createWriteStream(filePath);
        req.pipe(writeStream);

        writeStream.on('finish', () => {
            res.json({ success: true, filePath, filename });
        });

        writeStream.on('error', (err) => {
            logger.error('project', 'raw upload error', err);
            res.status(500).json({ success: false, error: err.message });
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/project-data/:projectId/upload', async (req, res) => {
    try {
        const { folderPath } = req.query;
        const { subDir, filename, base64Data } = req.body;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });
        if (!subDir || !filename || !base64Data) return res.status(400).json({ success: false, error: 'subDir, filename and base64Data required' });

        const targetDir = path.join(folderPath, 'data', subDir);
        await fs.ensureDir(targetDir);
        const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Content, 'base64');
        const filePath = path.join(targetDir, filename);
        await fs.writeFile(filePath, buffer);
        res.json({ success: true, filePath, filename });
    } catch (err) {
        logger.error('project', 'project-data upload error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/project-file', async (req, res) => {
    try {
        const { path: filePath } = req.query;
        if (!filePath) return res.status(400).send('path required');
        if (!(await fs.pathExists(filePath))) return res.status(404).send('Not found');
        res.sendFile(filePath);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//  (FFmpeg Extraction Route)

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

router.post('/project-media/:projectId/extract', async (req, res) => {
    try {
        const { folderPath, sourceUrl, startTime, duration, crop } = req.body;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });

        // Resolve local path from URL or absolute path
        let inputPath = '';
        if (sourceUrl.includes('project-file?path=')) {
            const urlObj = new URL(sourceUrl, 'http://localhost');
            inputPath = decodeURIComponent(urlObj.searchParams.get('path'));
        } else {
            inputPath = sourceUrl;
        }

        if (!(await fs.pathExists(inputPath))) {
            return res.status(400).json({ success: false, error: 'Source file not found: ' + inputPath });
        }

        // 1. Get source dimensions using ffprobe
        const ffprobeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${inputPath}"`;
        const { stdout: dimensions } = await execPromise(ffprobeCmd);
        const [srcW, srcH] = dimensions.trim().split('x').map(Number);

        if (!srcW || !srcH) throw new Error('Could not determine source dimensions');

        // 2. Map normalized crop to pixels
        const cropW = Math.floor(crop.width * srcW);
        const cropH = Math.floor(crop.height * srcH);
        const cropX = Math.floor(crop.x * srcW);
        const cropY = Math.floor(crop.y * srcH);

        const isTemp = req.body.saveToLibrary === false;
        const targetDir = isTemp ? path.join(folderPath, 'data', 'temp') : path.join(folderPath, 'Media');
        await fs.ensureDir(targetDir);

        const filename = `extract_${Date.now()}.mp4`;
        const outputPath = path.join(targetDir, filename);

        // 3. Run FFmpeg extraction
        // -ss before -i for fast seeking, -t for duration
        // Filter: crop=w:h:x:y
        // libx264 for universal compatibility
        const ffmpegCmd = `ffmpeg -ss ${startTime} -t ${duration} -i "${inputPath}" -filter:v "crop=${cropW}:${cropH}:${cropX}:${cropY}" -c:v libx264 -crf 18 -preset fast -c:a copy "${outputPath}"`;

        logger.info('project', `ffmpeg: ${ffmpegCmd}`);
        await execPromise(ffmpegCmd);

        res.json({ success: true, filePath: outputPath, filename });
    } catch (err) {
        logger.error('project', 'extract error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Generation Persistence ───────────────────────────────────────────────────

/**
 * POST /project/save-generation
 *
 * Downloads a ComfyUI output image from its view URL, saves it to
 * Media/<operation>_NNN.ext under the project folder, writes a UUID-keyed
 * sidecar to Media/.meta/<uuid>.json, and garbage-collects orphaned
 * sidecars (meta files whose media file no longer exists).
 *
 * Body:
 *   folderPath    {string}  — absolute project folder path
 *   comfyViewUrl  {string}  — http://127.0.0.1:8188/view?filename=...
 *   itemId        {string}  — UUID generated by the client before calling this route
 *   operation     {string}  — command key, e.g. 't2i', 'upscale'
 *   meta          {Object}  — { prompt, negativePrompt, seed, modelId }
 *   pixelDimensions {Object} — { w, h }
 *
 * Response:
 *   { success, itemId, filename, relativePath, filePath }
 *   relativePath is relative to folderPath, e.g. "Media/t2i_001.png"
 */
router.post('/project/save-generation', async (req, res) => {
    try {
        const { folderPath, comfyViewUrl, itemId, operation = 'generated', meta = {}, pixelDimensions } = req.body;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });
        if (!comfyViewUrl) return res.status(400).json({ success: false, error: 'comfyViewUrl required' });

        const id = itemId || uuidv4();

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);

        // Derive extension from the comfy URL filename param
        let ext = 'png';
        try {
            const u = new URL(comfyViewUrl);
            const fname = u.searchParams.get('filename') || '';
            const dotIdx = fname.lastIndexOf('.');
            if (dotIdx !== -1) ext = fname.slice(dotIdx + 1).toLowerCase();
        } catch (_) { /* keep default */ }

        // Sanitise operation key to a safe filename prefix (max 24 chars)
        const prefix = operation.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);

        // Find the next available sequence number by scanning existing files
        const existing = await fs.readdir(mediaDir);
        let maxNum = 0;
        const re = new RegExp(`^${prefix}_(\\d+)\\.`, 'i');
        for (const f of existing) {
            const m = f.match(re);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxNum) maxNum = n;
            }
        }
        const seq      = String(maxNum + 1).padStart(3, '0');
        const filename = `${prefix}_${seq}.${ext}`;
        const filePath = path.join(mediaDir, filename);

        // Download from ComfyUI server-side
        await streamDownload(comfyViewUrl, filePath);

        // Write UUID-keyed sidecar to .meta/<uuid>.json (single source of truth)
        const metaContent = {
            id,
            type: 'image',
            filePath: `/project-file?path=${encodeURIComponent(filePath)}`,
            operation,
            prompt:         meta.prompt        || '',
            negativePrompt: meta.negativePrompt || '',
            seed:           meta.seed          ?? -1,
            modelId:        meta.modelId       || null,
            createdAt:      new Date().toISOString(),
            name:           null,
            uploaded:       false,
            pixelDimensions: pixelDimensions ?? { w: 0, h: 0 },
        };
        await fs.writeJson(path.join(metaDir, `${id}.json`), metaContent, { spaces: 2 });

        // Garbage-collect orphaned sidecars (both filename-based and UUID-based)
        try {
            const sidecars = await fs.readdir(metaDir);
            for (const sc of sidecars) {
                if (!sc.endsWith('.json')) continue;
                const baseName = sc.slice(0, -5); // strip .json
                // Determine the corresponding media file name
                let mediaFile = baseName;
                // UUID-based: the media file path is stored in the meta itself
                // Filename-based: baseName matches the media filename
                const mediaPath = path.join(mediaDir, mediaFile);
                if (!(await fs.pathExists(mediaPath))) {
                    await fs.remove(path.join(metaDir, sc));
                }
            }
        } catch (_) { /* GC failure is non-fatal */ }

        const relativePath = `Media/${filename}`;
        res.json({ success: true, itemId: id, filename, relativePath, filePath });
    } catch (err) {
        logger.error('project', 'save-generation error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /project/crop-media
 *
 * Crops an existing project image to a new file using Sharp.
 * The source file is NOT modified — the crop is saved as a new history entry.
 * Writes a UUID-keyed sidecar to Media/.meta/<uuid>.json.
 *
 * Body:
 *   folderPath    {string}  — absolute project folder path
 *   itemId        {string}  — UUID generated by the client before calling this route
 *   sourceFilePath {string}  — absolute path to the source image file
 *   x             {number}  — crop origin x in image-space pixels (integer)
 *   y             {number}  — crop origin y in image-space pixels (integer)
 *   w             {number}  — crop width in image-space pixels (integer)
 *   h             {number}  — crop height in image-space pixels (integer)
 *
 * Response:
 *   { success, itemId, filename, filePath }
 */
router.post('/project/crop-media', async (req, res) => {
    try {
        const { folderPath, itemId, sourceFilePath, x, y, w, h } = req.body;

        if (!folderPath)      return res.status(400).json({ success: false, error: 'folderPath required' });
        if (!sourceFilePath)  return res.status(400).json({ success: false, error: 'sourceFilePath required' });
        if (w <= 0 || h <= 0) return res.status(400).json({ success: false, error: 'Invalid crop dimensions' });

        const id = itemId || uuidv4();

        // Resolve the source path (may come as a /project-file?path=... URL)
        let inputPath = sourceFilePath;
        if (sourceFilePath.includes('project-file?path=')) {
            const urlObj = new URL(sourceFilePath, 'http://localhost');
            inputPath = decodeURIComponent(urlObj.searchParams.get('path'));
        }

        if (!(await fs.pathExists(inputPath))) {
            return res.status(400).json({ success: false, error: 'Source file not found: ' + inputPath });
        }

        const mediaDir = path.join(folderPath, 'Media');
        const metaDir  = path.join(mediaDir, '.meta');
        await fs.ensureDir(metaDir);

        // Derive extension from source
        const ext = path.extname(inputPath).slice(1).toLowerCase() || 'png';

        // Sequenced filename using 'crop' prefix
        const existing = await fs.readdir(mediaDir);
        let maxNum = 0;
        const re = /^crop_(\d+)\./i;
        for (const f of existing) {
            const m = f.match(re);
            if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
        }
        const seq      = String(maxNum + 1).padStart(3, '0');
        const filename = `crop_${seq}.${ext}`;
        const filePath = path.join(mediaDir, filename);

        // Sharp crop
        let sharp;
        try {
            sharp = require('sharp');
        } catch (_) {
            return res.status(500).json({ success: false, error: 'Sharp is not installed on the server.' });
        }

        await sharp(inputPath)
            .extract({
                left:   Math.max(0, Math.round(x)),
                top:    Math.max(0, Math.round(y)),
                width:  Math.round(w),
                height: Math.round(h),
            })
            .toFile(filePath);

        // Write UUID-keyed sidecar to .meta/<uuid>.json (single source of truth)
        const metaContent = {
            id,
            type: 'image',
            filePath: `/project-file?path=${encodeURIComponent(filePath)}`,
            operation: 'crop',
            prompt: '',
            negativePrompt: '',
            seed: -1,
            modelId: null,
            createdAt: new Date().toISOString(),
            name: null,
            uploaded: false,
            pixelDimensions: { w: Math.round(w), h: Math.round(h) },
            cropRect: { x, y, w, h },
            sourceFile: inputPath,
        };
        await fs.writeJson(path.join(metaDir, `${id}.json`), metaContent, { spaces: 2 });

        res.json({ success: true, itemId: id, filename, filePath });
    } catch (err) {
        logger.error('project', 'crop-media error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});





// ─── Reconciliation & Migration ───────────────────────────────────────────────

/**
 * GET /file-exists
 * Checks if an absolute path exists on disk.
 * Query: path=<absolute path>
 * Response: { exists: boolean }
 */
router.get('/file-exists', (req, res) => {
    const { path: filePath } = req.query;
    if (!filePath) return res.json({ exists: false });
    res.json({ exists: fs.existsSync(filePath) });
});

/**
 * GET /load-meta
 * Loads a .meta/<uuid>.json file by item ID.
 * Query: id=<uuid>, folderPath=<project folder path>
 * Response: JSON object from the meta file, or 404
 */
router.get('/load-meta', (req, res) => {
    const { id, folderPath } = req.query;
    if (!id || !folderPath) return res.status(400).json({ error: 'Missing params' });

    const metaPath = path.join(folderPath, 'Media', '.meta', `${id}.json`);
    if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Not found' });

    try {
        res.json(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
    } catch {
        res.status(500).json({ error: 'Parse error' });
    }
});

/**
 * DELETE /delete-meta
 * Deletes a .meta/<uuid>.json file.
 * Query: id=<uuid>, folderPath=<project folder path>
 */
router.delete('/delete-meta', (req, res) => {
    const { id, folderPath } = req.query;
    if (!id || !folderPath) return res.status(400).json({ error: 'Missing params' });

    const metaPath = path.join(folderPath, 'Media', '.meta', `${id}.json`);
    if (fs.existsSync(metaPath)) {
        fs.removeSync(metaPath);
    }
    res.json({ success: true });
});

/**
 * POST /migrate-project
 * Reads project.json from disk, runs migrations, writes back, returns result.
 * Body: { folderPath }
 * Response: { success, project } — the migrated project object
 */
router.post('/migrate-project', async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ success: false, error: 'folderPath required' });

        const jsonPath = path.join(folderPath, 'project.json');
        const project = await fs.readJson(jsonPath);

        // Import migration runner lazily to avoid circular deps
        const { migrateProject } = require('../js/migrations/projectMigrations.js');
        const migrated = await migrateProject(project, folderPath);

        await fs.writeJson(jsonPath, migrated, { spaces: 2 });
        res.json({ success: true, project: migrated });
    } catch (err) {
        logger.error('project', 'migrate-project error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Project Templates ────────────────────────────────────────────────────────

/**
 * Helper to find a project's folder on disk by its internal UUID.
 */
async function findProjectFolder(id) {
    if (!id) return null;
    const roots = [DEFAULT_PROJECTS_ROOT];
    for (const root of roots) {
        if (!(await fs.pathExists(root))) continue;
        const entries = await fs.readdir(root);
        for (const entry of entries) {
            const entryPath = path.join(root, entry);
            const jsonPath = path.join(entryPath, 'project.json');
            if (await fs.pathExists(jsonPath)) {
                try {
                    const p = await fs.readJson(jsonPath);
                    if (p.id === id) return entryPath;
                } catch (e) { /* skip */ }
            }
        }
    }
    return null;
}

/**
 * GET /project-templates/:id
 * Returns all templates for a project.
 */
router.get('/project-templates/:id', async (req, res) => {
    try {
        const folderPath = await findProjectFolder(req.params.id);
        if (!folderPath) return res.status(404).json({ error: 'Project not found' });
        const projectPath = path.join(folderPath, 'project.json');
        const project = await fs.readJson(projectPath);
        res.json({ templates: project.templates || {} });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /project-templates/:id
 * Body: { name: string, toolStates: Object }
 * Saves or overwrites a named template.
 */
router.post('/project-templates/:id', async (req, res) => {
    try {
        const { name, toolStates } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });
        const folderPath = await findProjectFolder(req.params.id);
        if (!folderPath) return res.status(404).json({ error: 'Project not found' });
        const projectPath = path.join(folderPath, 'project.json');
        const project = await fs.readJson(projectPath);
        if (!project.templates) project.templates = {};
        project.templates[name] = { created: new Date().toISOString(), toolStates };
        await fs.writeJson(projectPath, project, { spaces: 2 });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /project-templates/:id/:name
 * Deletes a named template.
 */
router.delete('/project-templates/:id/:name', async (req, res) => {
    try {
        const folderPath = await findProjectFolder(req.params.id);
        if (!folderPath) return res.status(404).json({ error: 'Project not found' });
        const projectPath = path.join(folderPath, 'project.json');
        const project = await fs.readJson(projectPath);
        if (project.templates) delete project.templates[req.params.name];
        await fs.writeJson(projectPath, project, { spaces: 2 });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Reconciliation Helpers ────────────────────────────────────────────────────────

/**
 * GET /project-media/temp
 * List media files in a project's Media directory (used by reconciliation).
 * Query: folderPath=<project folder path>
 * Response: { files: [{ name, type, path, resolution? }] }
 */
router.get('/project-media/temp', async (req, res) => {
    try {
        const { folderPath } = req.query;
        if (!folderPath) return res.status(400).json({ error: 'folderPath required' });

        const mediaDir = path.join(folderPath, 'Media');
        if (!(await fs.pathExists(mediaDir))) return res.json({ files: [] });

        const entries = await fs.readdir(mediaDir);
        const realFiles = entries.filter(e => {
            // Skip .meta directories and .meta.json sidecar files
            return e !== '.meta' && !e.endsWith('.meta.json') && !e.endsWith('.json');
        });

        const files = await Promise.all(realFiles.map(async (name) => {
            const filePath = path.join(mediaDir, name);
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) return null;

            const ext = path.extname(name).toLowerCase().slice(1);
            let type = 'other';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) type = 'image';
            else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) type = 'video';
            else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) type = 'audio';

            // Try to extract resolution from filename (e.g., "image_1920x1080.png")
            let resolution = null;
            const resMatch = name.match(/(\d+)x(\d+)/);
            if (resMatch) {
                resolution = `${resMatch[1]}x${resMatch[2]}`;
            }

            return {
                name,
                type,
                path: filePath,
                resolution,
            };
        }));

        res.json({ files: files.filter(f => f !== null) });
    } catch (err) {
        logger.error('project', '/project-media/temp error', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
