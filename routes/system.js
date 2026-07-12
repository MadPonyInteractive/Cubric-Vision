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
const { execFile } = require('child_process');
const axios = require('axios');
const logger = require('./logger');
const { redactSecrets } = require('./secretRedaction');
const { COMFY_DIR, getComfyRepoRel, resolveDownloadConfig } = require('./platformEngine');

// ── VRAM Helper ───────────────────────────────────────────────────────────────

async function getVramStats() {
    return new Promise((resolve) => {
        execFile('nvidia-smi', ['--query-gpu=memory.total,memory.used', '--format=csv,noheader,nounits'], (err, stdout) => {
            if (err || !stdout) return resolve({ total: 0, used: 0 });
            const [total, used] = stdout.split(',').map(s => parseInt(s.trim(), 10));
            resolve({ total: total || 0, used: used || 0 });
        });
    });
}

function openFolderViaMainProcess(folderPath) {
    return new Promise((resolve, reject) => {
        if (!process.send) {
            reject(new Error('Electron main process bridge unavailable'));
            return;
        }

        const id = `open-folder-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timeout = setTimeout(() => {
            process.removeListener('message', onMessage);
            reject(new Error('Timed out waiting for Electron folder open bridge'));
        }, 10000);

        function onMessage(message) {
            if (!message || message.type !== 'open-folder-result' || message.id !== id) return;
            clearTimeout(timeout);
            process.removeListener('message', onMessage);
            if (message.ok) resolve();
            else reject(new Error(message.error || 'Failed to open folder'));
        }

        process.on('message', onMessage);
        process.send({ type: 'open-folder', id, folderPath });
    });
}

function openFolderViaPlatform(folderPath) {
    return new Promise((resolve, reject) => {
        const opener = process.platform === 'win32'
            ? { command: 'explorer.exe', args: [folderPath] }
            : process.platform === 'darwin'
                ? { command: 'open', args: [folderPath] }
                : { command: 'xdg-open', args: [folderPath] };

        execFile(opener.command, opener.args, { windowsHide: true }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function revealItemViaMainProcess(itemPath) {
    return new Promise((resolve, reject) => {
        if (!process.send) {
            reject(new Error('Electron main process bridge unavailable'));
            return;
        }
        const id = `reveal-item-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timeout = setTimeout(() => {
            process.removeListener('message', onMessage);
            reject(new Error('Timed out waiting for Electron reveal-item bridge'));
        }, 10000);
        function onMessage(message) {
            if (!message || message.type !== 'reveal-item-result' || message.id !== id) return;
            clearTimeout(timeout);
            process.removeListener('message', onMessage);
            if (message.ok) resolve();
            else reject(new Error(message.error || 'Failed to reveal item'));
        }
        process.on('message', onMessage);
        process.send({ type: 'reveal-item', id, itemPath });
    });
}

function revealItemViaPlatform(itemPath) {
    return new Promise((resolve, reject) => {
        // Select the file where the OS supports it; Linux has no portable select flag → open parent.
        const opener = process.platform === 'win32'
            ? { command: 'explorer.exe', args: [`/select,${itemPath}`] }
            : process.platform === 'darwin'
                ? { command: 'open', args: ['-R', itemPath] }
                : { command: 'xdg-open', args: [path.dirname(itemPath)] };
        // ponytail: explorer.exe returns exit 1 even on success — ignore its error, trust others.
        execFile(opener.command, opener.args, { windowsHide: true }, (err) => {
            if (err && process.platform !== 'win32') reject(err);
            else resolve();
        });
    });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/system/stats', async (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const [downloadConfig, vram] = await Promise.all([
            resolveDownloadConfig(),
            getVramStats(),
        ]);
        const gpuVendor = downloadConfig.gpu?.vendor || null;
        const usesUnifiedMemory = gpuVendor === 'apple';

        res.json({
            success: true,
            gpu: {
                name: downloadConfig.gpu?.name || null,
                vendor: gpuVendor,
                memoryModel: usesUnifiedMemory ? 'unified' : (vram.total > 0 ? 'discrete' : null)
            },
            ram: {
                total: totalMem,
                used: usedMem,
                percent: ((usedMem / totalMem) * 100).toFixed(1)
            },
            vram: {
                total: vram.total * 1024 * 1024,
                used: vram.used * 1024 * 1024,
                percent: vram.total > 0 ? ((vram.used / vram.total) * 100).toFixed(1) : 0,
                available: vram.total > 0,
                memoryModel: usesUnifiedMemory ? 'unified' : (vram.total > 0 ? 'discrete' : null)
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
                arch: downloadConfig.gpu?.arch || null,  // MPI-200: runtime-variant token
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

router.post('/open-folder', async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).send('No path provided');
    try {
        const normalizedPath = path.resolve(folderPath);
        if (process.send) {
            await openFolderViaMainProcess(normalizedPath);
        } else {
            await openFolderViaPlatform(normalizedPath);
        }
        res.send('Folder opened');
    } catch (err) {
        logger.error('system', 'Failed to open folder', err);
        res.status(500).send('Failed to open folder');
    }
});

router.post('/reveal-item', async (req, res) => {
    const { itemPath } = req.body;
    if (!itemPath) return res.status(400).send('No path provided');
    try {
        const normalizedPath = path.resolve(itemPath);
        if (process.send) {
            await revealItemViaMainProcess(normalizedPath);
        } else {
            await revealItemViaPlatform(normalizedPath);
        }
        res.send('Item revealed');
    } catch (err) {
        logger.error('system', 'Failed to reveal item', err);
        res.status(500).send('Failed to reveal item');
    }
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
    const safeMessage = redactSecrets(message);
    const safeDetail = redactSecrets(detail);
    const fullMessage = safeDetail ? `${safeMessage} — ${safeDetail}` : safeMessage;
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
 * Body: { title, message, summary, log, build?: { appVersion, stage, hash } }
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
        const buildHash = normalizeBuildHash(build?.hash);

        // Trim log to last 2000 chars to stay within GitHub's 65k limit
        const safeTitle = redactSecrets(title);
        const safeMessage = redactSecrets(message);
        const safeSummary = redactSecrets(summary || '');
        let trimmedLog = redactSecrets(log || '(no log available)');
        if (trimmedLog.length > 2000) {
            trimmedLog = '...' + trimmedLog.slice(-2000);
        }

        let body = `**Error:** ${safeMessage}`;
        if (safeSummary) {
            body += `\n\n**What I was doing:**\n${safeSummary}`;
        }
        body += `\n\n**App version:** ${appVersion}\n**Stage:** ${stage}\n**Build:** ${buildHash || 'dev'}`;
        body += `\n\n<details>\n<summary>App Log</summary>\n\n\`\`\`\n${trimmedLog}\n\`\`\`\n\n</details>`;

        const labels = ['bug', 'auto-report', `stage:${stage}`];
        if (buildHash) {
            labels.push(`build:${buildHash}`);
        }

        const ghHeaders = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        const issueUrl = `https://api.github.com/repos/${repo}/issues`;

        let response;
        try {
            response = await axios.post(issueUrl, { title: safeTitle, body, labels }, { headers: ghHeaders });
        } catch (labelErr) {
            // A 422 here is usually a label problem (malformed/invalid label).
            // Degrade gracefully: report the bug anyway with only the base
            // 'bug' label rather than dropping the whole report. Log the cause.
            if (labelErr.response?.status === 422) {
                logger.warn('system', `GitHub issue label apply failed; retrying with base label only. labels=${JSON.stringify(labels)} detail=${JSON.stringify(labelErr.response?.data)}`);
                response = await axios.post(issueUrl, { title: safeTitle, body, labels: ['bug'] }, { headers: ghHeaders });
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

function normalizeBuildHash(value) {
    if (typeof value !== 'string') return null;
    const hash = value.trim().toLowerCase();
    if (!hash || hash === 'dev') return null;
    return /^[0-9a-f]{7,40}$/.test(hash) ? hash : null;
}

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
        // ComfyUI repo root relative to engine/, e.g. "ComfyUI_windows_portable/ComfyUI"
        // on Windows or "ComfyUI_linux" on Linux/macOS (comfy-cli clones in place).
        comfyRepoRel: getComfyRepoRel().join('/'),
    });
});

module.exports = router;
