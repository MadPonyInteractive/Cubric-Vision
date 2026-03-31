/**
 * routes/system.js — System, memory, and OS utility routes.
 *
 * Routes exposed:
 *   GET  /system/stats   — RAM + VRAM usage
 *   POST /choose-folder  — Native Windows folder-picker dialog
 *   POST /open-folder    — Open folder in Windows Explorer
 */

'use strict';

const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');

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

router.post('/choose-folder', (req, res) => {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms;
$form = New-Object System.Windows.Forms.Form;
$form.TopMost = $true;
$form.ShowInTaskbar = $false;
$form.WindowState = 'Minimized';
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
$dialog.Description = 'Choose a folder for your project';
$dialog.ShowNewFolderButton = $true;
$result = $dialog.ShowDialog($form);
if ($result -eq 'OK') { Write-Output $dialog.SelectedPath }
`;
    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Sta -WindowStyle Hidden -Command "${ps.replace(/\n/g, ' ')}"`, (err, stdout) => {
        if (err) {
            console.error('Folder picker error:', err);
            return res.json({ cancelled: true, path: null, error: err.message });
        }
        if (!stdout.trim()) return res.json({ cancelled: true, path: null });
        res.json({ cancelled: false, path: stdout.trim() });
    });
});

router.post('/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).send('No path provided');
    exec(`start "" "${folderPath}"`, (err) => {
        if (err) {
            console.error('Failed to open folder:', err);
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

module.exports = router;
