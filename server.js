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

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

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
const { router: downloadManagerRoutes, cancelAllDownloads } = require('./routes/downloadManager');
const { router: runpodRemoteRoutes } = require('./routes/runpodRemote');
const { router: remoteEngineRoutes } = require('./routes/remoteEngine');
const { router: remoteProxyRoutes } = require('./routes/remoteProxy');
const { cleanComfyUITempFiles } = require('./routes/shared');
const connectorRoutes = require('./routes/connector');

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

// Connected broker client, set once the connector responder registers (MPI-10).
let _connectorClient = null;

app.listen(port, '127.0.0.1', () => {
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

    // Broker boot (MPI-10): ensure the shared family broker is running BEFORE
    // startConnectorResponder attempts discoverApps(). Best-effort chain:
    // ensureFamilyBroker (connect-or-spawn) → startConnectorResponder (register
    // + handshake) → setClient (enable /connector/* routes). Any failure at any
    // step leaves _client null → promptEnhance:false — Vision stays standalone.
    const path = require('node:path');
    const { ensureFamilyBroker }    = require('./services/brokerBoot');
    const { startConnectorResponder } = require('./services/connectorResponder');

    ensureFamilyBroker().then(async (brokerResult) => {
        if (brokerResult) {
            logger.info('system', `Broker ready (spawned=${brokerResult.spawned}, metadataPath=${brokerResult.metadataPath}).`);
        }
        const responder = await startConnectorResponder({
            manifestPath: path.join(__dirname, 'resources', 'cubric', 'connector-manifest.json'),
        });
        if (responder) {
            // Share the connected client with the caller routes (/connector/*).
            connectorRoutes.setClient(responder.client);
            _connectorClient = responder.client;
            logger.info('system', 'Connector responder registered (system.memory.release, system.shutdown) + caller routes live.');
            // D1 eager spawn (MPI-10 Phase 3): boot installed-but-not-running
            // sibling apps headless so their capabilities are live for this
            // session. Vision does NOT self-register a record (it has no
            // --headless mode yet) — it is the spawner/consumer.
            try {
                const connector = await import('@cubric/connector');
                const live = (await responder.client.discoverApps().catch(() => [])).map((a) => a.appId);
                // server.js runs as an Electron fork, so ELECTRON_RUN_AS_NODE=1
                // is set here. Siblings are Electron APPS — inheriting it would
                // boot them as plain Node and they'd never start.
                const spawnEnv = { ...process.env };
                delete spawnEnv.ELECTRON_RUN_AS_NODE;
                const result = await connector.spawnInstalledSiblings({
                    selfAppId: 'cubric.vision',
                    liveAppIds: live,
                    env: spawnEnv,
                });
                if (result.spawned.length) {
                    logger.info('system', `Spawned headless siblings: ${result.spawned.join(', ')}`);
                }
            } catch { /* best-effort */ }
        }
    }).catch(() => { /* best-effort: Vision works standalone without a broker */ });
});

// Window-state relay (MPI-10): the Electron main reports window visibility over
// the fork IPC; forward it to the broker for family-wide last-window teardown.
process.on('message', (msg) => {
    if (msg && typeof msg === 'object' && msg.type === 'cubric-window-state') {
        _connectorClient?.reportWindowState?.(!!msg.visible)?.catch(() => {});
    }
});
