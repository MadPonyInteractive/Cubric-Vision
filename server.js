'use strict';

/**
 * server.js — Express app entry point.
 *
 * This file is now a thin orchestrator. All route logic lives in ./routes/:
 *   routes/shared.js   — shared constants, utilities, process state
 *   routes/system.js   — /system/stats, /choose-folder, /open-folder
 *   routes/projects.js — /create-project, /list-projects, /project-media/*, etc.
 *   routes/llm.js      — /llm/models, /llm/download, /llm/generate, etc.
 *   routes/engine.js   — /engine/status, /engine/download
 *   routes/comfy.js    — /comfy/*, /comfy/workflows, /comfy/model/download, etc.
 *
 * RULES FOR AGENTS:
 * - Do NOT add route handlers to this file.
 * - To add a new route, add it to the appropriate routes/ module (or create a new one).
 * - Constants and shared helpers belong in routes/shared.js.
 */

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// ── Route Modules ──────────────────────────────────────────────────────────────

const logger        = require('./routes/logger');
const systemRoutes  = require('./routes/system');
const projectRoutes = require('./routes/projects');
const llmRoutes     = require('./routes/llm');
const engineRoutes  = require('./routes/engine');
const comfyRoutes   = require('./routes/comfy');
const { router: downloadManagerRoutes, cancelAllDownloads } = require('./routes/downloadManager');
const { cleanComfyUITempFiles } = require('./routes/shared');

console.log('[server.js] App initialization started');
logger.info('system', 'Server initialization started');

app.use(systemRoutes);
app.use(projectRoutes);
app.use(llmRoutes);
app.use(engineRoutes);
app.use(comfyRoutes);
app.use(downloadManagerRoutes);

process.on('SIGTERM', () => { cancelAllDownloads(); cleanComfyUITempFiles(); process.exit(0); });
process.on('SIGINT', () => { cancelAllDownloads(); cleanComfyUITempFiles(); process.exit(0); });

// ── Startup ────────────────────────────────────────────────────────────────────

app.listen(port, '127.0.0.1', () => {
    // Dynamic import for ESM-only axios
    import('axios').then(mod => {
        const axios = mod.default;
        // Inject into routes that need it
        llmRoutes.setAxios(axios);
        comfyRoutes.setAxios(axios);

        // Sync workflow install states on startup
        const { syncWorkflowStates } = require('./routes/shared');
        syncWorkflowStates().catch(err => logger.error('system', 'Startup workflow sync failed', err));

        logger.info('system', `Server started at http://127.0.0.1:${port}`);
        if (process.send) process.send('server-ready');
    }).catch(err => {
        console.error('Failed to load dynamic modules:', err);
    });
});
