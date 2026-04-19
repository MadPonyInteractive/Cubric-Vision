/**
 * routes/llm.js — LLM model management and text generation routes.
 *
 * Routes exposed:
 *   GET  /llm/models    — list available models + download status
 *   POST /llm/download  — download a model file
 *   POST /llm/delete    — delete a model file
 *   POST /llm/unload    — kill active llama-server to free VRAM
 *   POST /llm/generate  — run inference (boots llama-server if needed)
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');
const {
    MODELS_ROOT,
    LLM_CONFIG_PATH,
    LLAMA_ENGINE_ROOT,
    LLAMA_SERVER_PORT,
    processState,
    stopLlamaServer,
    streamDownload,
} = require('./shared');
const { getLlamaBin } = require('./platformEngine');

// ── Helpers ───────────────────────────────────────────────────────────────────

let _axios = null;
function getAxios() {
    if (!_axios) throw new Error('Server is still loading AI modules. Try again in a few seconds.');
    return _axios;
}
// Injected by server.js after dynamic import
function setAxios(ax) { _axios = ax; }

async function checkLlamaServerReady() {
    for (let i = 0; i < 30; i++) {
        try {
            const ax = getAxios();
            const res = await ax.get(`http://127.0.0.1:${LLAMA_SERVER_PORT}/health`);
            if (res.status === 200 || res.status === 503) return true;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/llm/models', async (req, res) => {
    try {
        if (!(await fs.pathExists(LLM_CONFIG_PATH))) return res.json({ success: true, models: [] });
        const config = await fs.readJson(LLM_CONFIG_PATH);
        const models = await Promise.all(config.models.map(async (m) => {
            const localPath = path.join(MODELS_ROOT, m.filename);
            const exists = await fs.pathExists(localPath);
            let sizeOnDisk = 0;
            if (exists) { const stats = await fs.stat(localPath); sizeOnDisk = stats.size; }
            return { ...m, exists, sizeOnDisk };
        }));
        res.json({ success: true, models });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/llm/download', async (req, res) => {
    const { modelId } = req.body;
    try {
        getAxios(); // Guard: fail fast if axios not ready
        const config = await fs.readJson(LLM_CONFIG_PATH);
        const model = config.models.find(m => m.id === modelId);
        if (!model) return res.status(404).json({ error: 'Model not found' });

        await fs.ensureDir(MODELS_ROOT);
        logger.info('llm', `Starting download for core model ${model.name}...`);
        const mainPath = path.join(MODELS_ROOT, model.filename);
        await streamDownload(model.url, mainPath);

        if (model.mmproj_url && model.mmproj_filename) {
            logger.info('llm', `Starting download for vision projector ${model.mmproj_filename}...`);
            await streamDownload(model.mmproj_url, path.join(MODELS_ROOT, model.mmproj_filename));
        }

        res.json({ success: true, path: mainPath });
    } catch (err) {
        logger.error('llm', 'Download failed', err);
        res.status(500).json({ success: false, error: `Server Error: ${err.message}`, stack: err.stack });
    }
});

router.post('/llm/delete', async (req, res) => {
    const { modelId } = req.body;
    try {
        const config = await fs.readJson(LLM_CONFIG_PATH);
        const model = config.models.find(m => m.id === modelId);
        if (!model) return res.status(404).json({ error: 'Model not found' });

        const localPath = path.join(MODELS_ROOT, model.filename);
        if (await fs.pathExists(localPath)) {
            if (processState.activeModelId === modelId) stopLlamaServer();
            await fs.remove(localPath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Model not found on disk' });
        }
    } catch (err) {
        logger.error('llm', 'Delete failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/llm/unload', async (req, res) => {
    try {
        stopLlamaServer();
        logger.info('llm', 'Active model manual unload complete');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/llm/generate', async (req, res) => {
    const { modelId, prompt, system, images = [] } = req.body;
    try {
        const ax = getAxios();
        const config = await fs.readJson(LLM_CONFIG_PATH);
        const modelInfo = config.models.find(m => m.id === modelId);
        if (!modelInfo) return res.status(404).json({ error: 'Model not found' });

        const modelPath = path.join(MODELS_ROOT, modelInfo.filename);
        if (!(await fs.pathExists(modelPath))) {
            return res.status(400).json({ error: 'Model not downloaded locally' });
        }

        const llamaBin = getLlamaBin();
        const serverExePath = path.join(LLAMA_ENGINE_ROOT, llamaBin);
        if (!(await fs.pathExists(serverExePath))) {
            return res.status(500).json({ success: false, error: `${llamaBin} backend is missing. Please review engine provisioning.` });
        }

        if (processState.activeModelId !== modelId || !processState.activeLlamaProcess) {
            logger.info('llm', `Starting llama-server for model: ${modelInfo.name}...`);
            stopLlamaServer();

            const spawnArgs = ['-m', modelPath, '--port', LLAMA_SERVER_PORT.toString(), '-c', '8192'];

            if (modelInfo.mmproj_filename) {
                const mmprojPath = path.join(MODELS_ROOT, modelInfo.mmproj_filename);
                if (await fs.pathExists(mmprojPath)) {
                    spawnArgs.push('--mmproj', mmprojPath);
                    logger.info('llm', `Using vision projector: ${modelInfo.mmproj_filename}`);
                } else {
                    logger.warn('llm', `mmproj_filename defined but not found at ${mmprojPath}`);
                }
            }

            processState.activeLlamaProcess = spawn(serverExePath, spawnArgs, { stdio: 'ignore' });
            processState.activeLlamaProcess.on('exit', () => {
                if (processState.activeModelId === modelId) processState.activeModelId = null;
            });

            logger.info('llm', `Waiting for llama-server on port ${LLAMA_SERVER_PORT}...`);
            const ready = await checkLlamaServerReady();
            if (!ready) {
                stopLlamaServer();
                throw new Error('llama-server.exe timed out while booting the model. Ensure you have enough VRAM and the model files are not corrupt.');
            }
            processState.activeModelId = modelId;
            await new Promise(r => setTimeout(r, 2000));
        }

        logger.info('llm', `Generating with ${modelInfo.name}...`);
        let reqMessages = [];
        if (system && system.trim()) reqMessages.push({ role: 'system', content: system });

        let userContent = [];
        if (prompt && prompt.trim()) userContent.push({ type: 'text', text: prompt });
        if (images && images.length > 0) {
            images.forEach(img => {
                const b64 = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
                userContent.push({ type: 'image_url', image_url: { url: b64 } });
            });
        }
        reqMessages.push({ role: 'user', content: userContent });

        const payload = { model: modelId, messages: reqMessages, temperature: 0.7 };
        const completionRes = await ax.post(`http://127.0.0.1:${LLAMA_SERVER_PORT}/v1/chat/completions`, payload);
        res.json({ response: completionRes.data.choices[0].message.content });

    } catch (err) {
        logger.error('llm', 'Generation error', err);
        let msg = err.message || 'Internal Error';
        if (err.response?.data?.error) msg = err.response.data.error.message || err.response.data.error;
        if (msg.includes('allocate') || msg.includes('CUDA') || msg.includes('GGML')) {
            msg = 'OOM: You do not have enough VRAM in your system to run this model';
        }
        res.status(500).json({ success: false, error: msg });
    }
});

module.exports = router;
module.exports.setAxios = setAxios;
