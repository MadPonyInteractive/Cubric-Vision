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

const systemRoutes  = require('./routes/system');
const projectRoutes = require('./routes/projects');
const llmRoutes     = require('./routes/llm');
const engineRoutes  = require('./routes/engine');
const comfyRoutes   = require('./routes/comfy');

app.use(systemRoutes);
app.use(projectRoutes);
app.use(llmRoutes);
app.use(engineRoutes);
app.use(comfyRoutes);

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
        syncWorkflowStates().catch(err => console.error('[server] startup sync failed:', err));

        console.log(`Prompt Builder Server running at http://127.0.0.1:${port}`);
        if (process.send) process.send('server-ready');
    }).catch(err => {
        console.error('Failed to load dynamic modules:', err);
    });
});
