/**
 * routes/system.js — System, memory, and OS utility routes.
 *
 * Routes exposed:
 *   GET  /system/stats   — RAM + VRAM usage
 *   POST /choose-folder  — Native cross-platform folder-picker dialog (via Electron IPC)
 *   POST /open-folder    — Open folder in system file explorer
 */

'use strict';

const express = require('express');
const router = express.Router();
const os   = require('os');
const fs   = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const logger = require('./logger');
const { COMFY_DIR, resolveDownloadConfig } = require('./platformEngine');

// ── VRAM Helper ───────────────────────────────────────────────────────────────

async function getVramStats() {
    return new Promise((resolve) => {
        exec('nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader,nounits', (err, stdout) => {
            if (err || !stdout) return resolve({ total: 0, used: 0 });
            const [total, used] = stdout.split(',').map(s => parseInt(s.trim(), 10));
            resolve({ total: total || 0, used: used || 0 });
        });
    });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/system/stats', async (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const vram = await getVramStats();

        res.json({
            success: true,
            ram: {
                total: totalMem,
                used: usedMem,
                percent: ((usedMem / totalMem) * 100).toFixed(1)
            },
            vram: {
                total: vram.total * 1024 * 1024,
                used: vram.used * 1024 * 1024,
                percent: vram.total > 0 ? ((vram.used / vram.total) * 100).toFixed(1) : 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/system/gpu-info', async (req, res) => {
    try {
        const [downloadConfig, vram] = await Promise.all([
            resolveDownloadConfig(),
            getVramStats(),
        ]);
        res.json({
            success: true,
            gpu: {
                name: downloadConfig.gpu?.name || null,
                vendor: downloadConfig.gpu?.vendor || null,
            },
            vramTotal: vram.total * 1024 * 1024,
            ramTotal: os.totalmem(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/choose-folder', (req, res) => {
    // This route is now handled via IPC in Electron's main process
    // We keep this route for API consistency, but the actual dialog is shown
    // by the Electron main process using native APIs (works on Windows, macOS, Linux)
    //
    // The frontend (MpiEngineInstall.js) will call window.electronAPI.chooseFolder()
    // which triggers the IPC handler in main.js, which uses Electron's dialog API
    res.json({ success: true, status: 'use_ipc' });
});

router.post('/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).send('No path provided');
    exec(`start "" "${folderPath}"`, (err) => {
        if (err) {
            logger.error('system', 'Failed to open folder', err);
            return res.status(500).send('Failed to open folder');
        }
        res.send('Folder opened');
    });
});

/**
 * GET /system/list-components
 * Scans the js/components directory for Primitives, Compounds, and Blocks.
 */
router.get('/system/list-components', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const componentsRoot = path.join(__dirname, '..', 'js', 'components');
    const tiers = ['Primitives', 'Compounds', 'Blocks'];
    const results = {};

    try {
        tiers.forEach(tier => {
            const tierPath = path.join(componentsRoot, tier);
            if (fs.existsSync(tierPath)) {
                results[tier] = fs.readdirSync(tierPath).filter(f => {
                    const fullPath = path.join(tierPath, f);
                    return fs.statSync(fullPath).isDirectory();
                });
            } else {
                results[tier] = [];
            }
        });
        res.json({ success: true, components: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Client-side log bridge ────────────────────────────────────────────────────
// Allows frontend JS errors to be written into the same app.log file.

router.post('/log', (req, res) => {
    const { level = 'error', category = 'client', message = '', detail = '' } = req.body || {};
    const allowed = ['info', 'warn', 'error'];
    const safeLevel = allowed.includes(level) ? level : 'error';
    const fullMessage = detail ? `${message} — ${detail}` : message;
    logger[safeLevel](category, fullMessage);
    res.json({ success: true });
});

// ── Log Download ──────────────────────────────────────────────────────────────

router.get('/logs/download', async (req, res) => {
    const logPath = logger.getLogPath();
    try {
        const exists = await fs.pathExists(logPath);
        if (!exists) {
            return res.status(404).json({ success: false, error: 'No log file found yet.' });
        }
        res.setHeader('Content-Disposition', 'attachment; filename="mpi-app.log"');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        fs.createReadStream(logPath).pipe(res);
    } catch (err) {
        logger.error('system', 'Log download failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/logs/read', async (req, res) => {
    const logPath = logger.getLogPath();
    try {
        const exists = await fs.pathExists(logPath);
        if (!exists) {
            return res.json({ success: true, log: '' });
        }
        const content = await fs.readFile(logPath, 'utf-8');
        res.json({ success: true, log: content });
    } catch (err) {
        logger.error('system', 'Log read failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GitHub Issue Creation ─────────────────────────────────────────────────────

/**
 * Derive the release stage from a semantic version string.
 * Mirrors js/core/appStage.js deriveStage() (frontend ESM cannot be required here).
 * Falls back to 'alpha' for unparseable input — never claims 'release'.
 * @param {string} version
 * @returns {'alpha'|'beta'|'release'}
 */
function deriveStage(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
    if (!m) return 'alpha';
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = Number(m[3]);
    if (major < 1) return 'alpha';
    if (minor === 0 && patch === 0) return 'release';
    if (patch === 0) return 'beta';
    return 'alpha';
}

/**
 * POST /github/create-issue
 * Creates a GitHub issue with error report.
 * Body: { title, message, summary, log, build?: { appVersion, stage } }
 * Stage label is re-derived server-side from build.appVersion; client stage is ignored.
 */
router.post('/github/create-issue', async (req, res) => {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;

    if (!token || !repo) {
        return res.status(500).json({ success: false, error: 'GitHub credentials not configured' });
    }

    const { title, message, summary, log, build } = req.body;

    if (!title || !message) {
        return res.status(400).json({ success: false, error: 'title and message required' });
    }

    try {
        // Build metadata. Stage is ALWAYS re-derived server-side from the
        // reported app version — the client-sent stage is advisory only and
        // never trusted. Mirrors js/core/appStage.js deriveStage().
        const appVersion = (build && typeof build.appVersion === 'string') ? build.appVersion : 'unknown';
        const stage = deriveStage(appVersion);

        // Trim log to last 2000 chars to stay within GitHub's 65k limit
        let trimmedLog = log || '(no log available)';
        if (trimmedLog.length > 2000) {
            trimmedLog = '...' + trimmedLog.slice(-2000);
        }

        let body = `**Error:** ${message}`;
        if (summary) {
            body += `\n\n**What I was doing:**\n${summary}`;
        }
        body += `\n\n**App version:** ${appVersion}\n**Stage:** ${stage}`;
        body += `\n\n<details>\n<summary>App Log</summary>\n\n\`\`\`\n${trimmedLog}\n\`\`\`\n\n</details>`;

        const labels = ['bug', 'auto-report', `stage:${stage}`];

        const ghHeaders = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        const issueUrl = `https://api.github.com/repos/${repo}/issues`;

        let response;
        try {
            response = await axios.post(issueUrl, { title, body, labels }, { headers: ghHeaders });
        } catch (labelErr) {
            // A 422 here is usually a label problem (malformed/invalid label).
            // Degrade gracefully: report the bug anyway with only the base
            // 'bug' label rather than dropping the whole report. Log the cause.
            if (labelErr.response?.status === 422) {
                logger.warn('system', `GitHub issue label apply failed; retrying with base label only. labels=${JSON.stringify(labels)} detail=${JSON.stringify(labelErr.response?.data)}`);
                response = await axios.post(issueUrl, { title, body, labels: ['bug'] }, { headers: ghHeaders });
            } else {
                throw labelErr;
            }
        }

        res.json({
            success: true,
            issueUrl: response.data.html_url,
            issueNumber: response.data.number
        });
    } catch (err) {
        console.error('GitHub API error:', err.response?.data || err.message);
        logger.error('system', 'GitHub issue creation failed', err);
        res.status(500).json({
            success: false,
            error: err.response?.data?.message || err.message,
            details: err.response?.data
        });
    }
});

// ── Platform Configuration ────────────────────────────────────────────────────

/**
 * GET /system/platform-config
 * Returns platform-specific configuration for client use (e.g., engine folder name).
 */
router.get('/system/platform-config', (req, res) => {
    res.json({
        success: true,
        platform: process.platform,
        comfyDir: COMFY_DIR,
    });
});

module.exports = router;
