/**
 * routes/llm.js — the app's own LLM call (MPI-677 step 1a).
 *
 * THE POINT OF THIS FILE: until now Vision had no LLM client of any kind, and
 * the PromptBox's Enhance button called OUT over the broker to Cubric Prompt.
 * This is the local replacement. Nothing here knows about recipes — the renderer
 * (`js/services/llmService.js`) resolves the recipe and sends the finished system
 * prompt, because `js/data/recipes/` is ESM the renderer already loads. This half
 * exists for one reason the renderer cannot cover: **the DeepInfra key lives in
 * the main process and must never reach the renderer.**
 *
 * Two routes:
 *   GET  /llm/status   -> { deepinfra: { hasKey }, ollama: { running }, defaultBackend }
 *   POST /llm/enhance  -> { ok, text, backend, model } | { ok:false, error }
 *
 * HONEST STATE IS PART OF THE CONTRACT: every completion echoes the backend and
 * the model that actually answered, never the one that was asked for. The UI
 * shows it, and "local" must never appear over a cloud answer.
 *
 * The backends themselves are `services/llmEngines.mjs` — the SAME clients the
 * Stage 1 recipe harness measures every recipe on. One implementation, so a fix
 * here cannot drift from the instrument that produced the greens.
 */

'use strict';

const express = require('express');
const router = express.Router();
const logger = require('./logger');
const { ask } = require('./forkBridge');

// `services/llmEngines.mjs` is ESM and this router is CJS, so it loads through a
// dynamic import — the same thing server.js already does for axios. Cached after
// the first call.
let _enginesPromise = null;
function engines() {
    if (!_enginesPromise) _enginesPromise = import('../services/llmEngines.mjs');
    return _enginesPromise;
}

/**
 * The DeepInfra key, or null. Order: the user's stored key (main process,
 * safeStorage, over the fork bridge) then `DEEPINFRA_API_KEY` from the
 * environment — which is what a dev run and the recipe harness use. The value
 * never leaves this module: it is handed straight to the engine and is not
 * logged, cached on disk, or returned by any route.
 */
async function deepInfraKey() {
    const m = await ask('secrets:get-deepinfra-key-request', {});
    return (m && m.value) || process.env.DEEPINFRA_API_KEY || null;
}

/** Presence only — asked on every readiness poll, so it must not move the key. */
async function hasDeepInfraKey() {
    const m = await ask('secrets:has-deepinfra-key-request', {});
    if (m && typeof m.has === 'boolean') return m.has || !!process.env.DEEPINFRA_API_KEY;
    return !!process.env.DEEPINFRA_API_KEY;
}

/**
 * Which backend a request without an explicit choice runs on.
 *
 * DeepInfra when a key is present, Ollama otherwise (Fabio, 2026-09-08: with a
 * key connected there is no GPU tax on any model, which is what let the enhance
 * control collapse to one path). This resolves SERVER-side because only this
 * process can see the key — the renderer is told the answer, never the reason
 * it could compute it itself.
 */
async function defaultBackend() {
    return (await hasDeepInfraKey()) ? 'deepinfra' : 'ollama';
}

router.get('/llm/status', async (_req, res) => {
    try {
        const { OllamaEngine } = await engines();
        const [hasKey, running] = await Promise.all([
            hasDeepInfraKey(),
            new OllamaEngine().isRunning(),
        ]);
        res.json({
            deepinfra: { hasKey },
            ollama: { running },
            defaultBackend: hasKey ? 'deepinfra' : 'ollama',
        });
    } catch (err) {
        logger.error('system', `llm status failed: ${err && err.message}`);
        // A probe failure is "not ready", never a 500 the caller has to branch on.
        res.json({ deepinfra: { hasKey: false }, ollama: { running: false }, defaultBackend: 'ollama' });
    }
});

/**
 * POST /llm/enhance — one completion.
 *
 * body: { prompt, system?, backend?, modelId? }
 *   `backend`  'deepinfra' | 'ollama'. Omitted -> `defaultBackend()`.
 *   `modelId`  a neutral id from `MODEL_REGISTRY`. Omitted -> the registry default.
 *
 * The ComfyUI backend is deliberately NOT reachable here: it runs as a queued
 * ComfyUI job through the existing `promptEnhance` operation, which the renderer
 * already knows how to dispatch. Routing it through this process would mean a
 * second dispatch path to the same engine.
 */
router.post('/llm/enhance', async (req, res) => {
    const { prompt, system, backend: asked, modelId } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.json({ ok: false, error: 'Write a prompt first, then Enhance.' });
    }

    let backend;
    try {
        const { OllamaEngine, DeepInfraEngine, getModel, DEFAULT_MODEL_ID } = await engines();
        backend = asked === 'deepinfra' || asked === 'ollama' ? asked : await defaultBackend();

        const entry = getModel(modelId || DEFAULT_MODEL_ID);
        if (!entry) return res.json({ ok: false, error: `Unknown model id: ${modelId}` });
        // Backend coverage is asymmetric ON PURPOSE — abliterated builds exist
        // only locally, frontier models only in the cloud — so a valid id can
        // still be unreachable on the chosen backend. Say which, rather than
        // letting `model: undefined` reach the wire.
        const model = backend === 'deepinfra' ? entry.deepInfraId : entry.ollamaName;
        if (!model) return res.json({ ok: false, error: `"${entry.name}" has no ${backend} variant.` });

        if (backend === 'ollama' && !(await new OllamaEngine().isRunning())) {
            return res.json({
                ok: false,
                error: "Ollama isn't running. Start it with `ollama serve`, or add a DeepInfra key in settings.",
            });
        }

        const engine = backend === 'deepinfra'
            ? new DeepInfraEngine(await deepInfraKey())
            : new OllamaEngine();
        // `complete()` takes only `{ model, system }` — the engines drop any
        // other option on the floor, so a `maxTokens` here would read as a cap
        // and be one only in the harness's own `chat()` path.
        const result = await engine.complete(prompt, { model, system });

        // `result.backend` / `result.model`, not the variables above: the engine
        // reports what actually answered.
        res.json({
            ok: true,
            text: String(result.text || '').trim(),
            backend: result.backend,
            model: result.model,
        });
    } catch (err) {
        logger.error('system', `llm enhance failed: ${err && err.message}`);
        res.json({ ok: false, error: (err && err.message) || 'Enhance failed.' });
    } finally {
        // MPI-14's rule, now on Vision's side of it: a local LLM must not sit on
        // VRAM the generator is about to want. Measured on a 16GB card — an idle
        // LLM alongside a video generation took a sub-10s render past 3 minutes,
        // because once VRAM is exhausted every token crosses PCIe. `keep_alive:0`
        // on EVERY exit path, failures included. The cloud backend holds no local
        // VRAM, so `releaseLocalModels` is a no-op there.
        if (backend === 'ollama') {
            try {
                const { OllamaEngine } = await engines();
                await new OllamaEngine().releaseOwnModels();
            } catch { /* server gone / already empty — nothing was held either way */ }
        }
    }
});

module.exports = router;
module.exports.defaultBackend = defaultBackend;
