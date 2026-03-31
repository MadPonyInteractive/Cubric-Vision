/**
 * llmService.js — Core LLM Service.
 * Provides low-level communication with the llama-server.exe backend.
 */

import { state } from './state.js';

let _llmLock = Promise.resolve();

/**
 * Generic LLM completion call.
 * @param {Object} options { modelId, prompt, system, images, signal }
 */
export async function llamaGenerate({ modelId, prompt, system, images, signal }) {
    // Wait for the lock to be free
    await _llmLock;

    // "Take" the lock by replacing the current _llmLock with a new unresolved promise
    let release;
    _llmLock = new Promise(resolve => release = resolve);

    try {
        // If a different model is requested, unload the current one first
        if (state.currentLoadedModel && state.currentLoadedModel !== modelId) {
            console.log(`[LLM Service] Switching model: ${state.currentLoadedModel} -> ${modelId}. Unloading...`);
            await unloadModel();
        }

        const payload = { modelId, prompt, system };
        if (images?.length > 0) payload.images = images;

        const res = await fetch('/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: signal || null
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || res.statusText);
        }

        const data = await res.json();
        state.currentLoadedModel = modelId;
        return data;
    } finally {
        // Always release the lock, even on error
        release();
    }
}

/**
 * Unload the current model from VRAM.
 */
export async function unloadModel() {
    try {
        await fetch('/llm/unload', { method: 'POST' });
        state.currentLoadedModel = null; // Mark VRAM as empty
        return true;
    } catch (e) {
        console.error('Failed to unload model:', e);
        return false;
    }
}

/**
 * Cancel all active operations tracked in state.
 */
export function cancelAllOperations() {
    Object.keys(state.g_abortControllers).forEach(key => {
        if (state.g_abortControllers[key]) {
            state.g_abortControllers[key].abort();
            state.g_abortControllers[key] = null;
        }
    });

    // Also trigger a VRAM unload as a safety measure on cancel
    unloadModel();
}

/**
 * Polling helper for long-running generations or status checks.
 */
export async function pollLlamaStatus() {
    const res = await fetch('/llm/status');
    return await res.json();
}
