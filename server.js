'use strict';

/**
 * server.js — Express app entry point.
 *
 * This file is now a thin orchestrator. All route logic lives in ./routes/:
 *   routes/shared.js   — shared constants, utilities, process state
 *   routes/system.js   — /system/stats, /choose-folder, /open-folder
 *   routes/projects.js — /create-project, /list-projects, /project-media/*, etc.
 *   routes/engine.js   — /engine/status, /engine/download
 *   routes/comfy.js    — /comfy/*, /comfy/workflows, /comfy/model/download, etc.
 *
 * RULES FOR AGENTS:
 * - Do NOT add route handlers to this file.
 * - To add a new route, add it to the appropriate routes/ module (or create a new one).
 * - Constants and shared helpers belong in routes/shared.js.
 */

// quiet: dotenv's startup banner ("injected env (0) from .env // tip: ...") is raw
// child stdout, so pipeChildStream formats it as a real [server] INFO line and it
// reaches users in app.log looking like an app message. Nothing reads the banner.
require('dotenv').config({ quiet: true });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
// The desktop E2E suite hands each run its own free port so it never fights (or
// silently attaches to) a dev app already on 3000 — MPI-448. main.js resolves the
// same value and inherits it into this fork. 3000 stays the default everywhere else.
const port = Number(process.env.CUBRIC_PORT) || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// Case-insensitive /comfy_workflows/* resolver — MUST precede express.static so a
// registry filename whose case differs from disk still resolves on Linux/macOS.
const { workflowStatic } = require('./routes/workflowStatic');
app.use(workflowStatic);

app.use(express.static(__dirname));

// ── Route Modules ──────────────────────────────────────────────────────────────

const logger        = require('./routes/logger');
const systemRoutes  = require('./routes/system');
const projectRoutes = require('./routes/projects');
const engineRoutes  = require('./routes/engine');
const comfyRoutes   = require('./routes/comfy');
const videoCropRoutes = require('./routes/videoCrop');
const videoConcatRoutes = require('./routes/videoConcat');
const videoReverseRoutes = require('./routes/videoReverse');
const videoGifRoutes = require('./routes/videoGif');
const videoTrimInputRoutes = require('./routes/videoTrimInput');
const { router: downloadManagerRoutes, cancelAllDownloads, logBootDiskSpace } = require('./routes/downloadManager');
const { router: runpodRemoteRoutes } = require('./routes/runpodRemote');
const { router: remoteEngineRoutes } = require('./routes/remoteEngine');
const { router: remoteProxyRoutes } = require('./routes/remoteProxy');
const { cleanComfyUITempFiles } = require('./routes/shared');
const connectorRoutes = require('./routes/connector');
const licenceRoutes = require('./routes/licences');
const llmRoutes = require('./routes/llm');

console.log('[server.js] App initialization started');
logger.info('system', 'Server initialization started');

app.use(systemRoutes);
app.use(projectRoutes);
app.use(engineRoutes);
// remoteProxy MUST mount before comfy: its /comfy/events/stream intercept
// falls through to routes/comfy.js via next() when remote mode is inactive.
app.use(remoteProxyRoutes);
app.use(comfyRoutes);
app.use(videoCropRoutes);
app.use(videoConcatRoutes);
app.use(videoReverseRoutes);
app.use(videoGifRoutes);
app.use(videoTrimInputRoutes);
app.use(downloadManagerRoutes);
app.use(runpodRemoteRoutes);
app.use(remoteEngineRoutes);
app.use(connectorRoutes);
app.use(licenceRoutes);
app.use(llmRoutes);

process.on('SIGTERM', () => { cancelAllDownloads(); cleanComfyUITempFiles(); process.exit(0); });
process.on('SIGINT', () => { cancelAllDownloads(); cleanComfyUITempFiles(); process.exit(0); });

// A single stray async rejection must NOT kill the whole server — it also hosts
// the ComfyUI proxy, project, and generation routes. The trigger we hit: a
// download write to a full disk (ENOSPC) inside node-downloader-helper's stream
// rejected outside any catch, Node turned it into an uncaughtException, and the
// forked server process exited code 1 — the download bar then hung at 0B with no
// failure surfaced. Log loudly (this is NOT for hiding bugs) but stay alive; for
// a download-disk-full specifically, tear down in-flight downloads so the UI gets
// a clean failed state instead of a frozen bar. (MPI-140)
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('system', `Unhandled promise rejection (server stays up): ${err.stack || err.message}`);
    if (err.code === 'ENOSPC') {
        logger.warn('system', 'Disk full during a write — cancelling active downloads so the UI can recover.');
        try { cancelAllDownloads(); } catch (e) { logger.error('system', `cancelAllDownloads failed: ${e.message}`); }
    }
});

// ── Startup ────────────────────────────────────────────────────────────────────

const httpServer = app.listen(port, '127.0.0.1', () => {
    // Free space on the models root and on the userData volume, once per boot.
    // Deliberately OUTSIDE the axios import below: a failed dynamic import must not
    // be what costs us the disk telemetry. It swallows its own errors. (MPI-716)
    logBootDiskSpace();

    // Dynamic import for ESM-only axios
    import('axios').then(mod => {
        const axios = mod.default;
        // Inject into routes that need it
        comfyRoutes.setAxios(axios);

        logger.info('system', `Server started at http://127.0.0.1:${port}`);
        if (process.send) process.send('server-ready');
    }).catch(err => {
        console.error('Failed to load dynamic modules:', err);
    });

    // MPI-677 removed the broker boot that stood here (MPI-10): ensureFamilyBroker
    // → startConnectorResponder → setClient, plus the D1 eager spawn of headless
    // sibling apps. Vision no longer registers with the Cubric hub, so booting the
    // server no longer starts a broker or a headless Cubric Prompt beside it.
});

// A taken port must KILL this process, never be shrugged off (MPI-448). Without
// this the fork stayed alive not listening, main.js loaded 127.0.0.1:<port>
// anyway and got somebody ELSE'S server — a second app instance, or a desktop
// spec quietly driving the dev session it was supposed to be isolated from.
// main.js turns this exit code into a visible failure.
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.error('system', `Port ${port} is already in use — another Cubric Vision (or another app) owns it. Refusing to start.`);
    } else {
        logger.error('system', `Server failed to listen on ${port}`, err);
    }
    process.exit(1);
});
