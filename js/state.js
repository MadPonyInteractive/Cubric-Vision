import { Events } from './events.js';

// Global runtime state. Per-project persistent settings live on state.currentProject
// (modelSettings, toolSettings) — not here.
const _state = {
    // ── Core routing ──────────────────────────────────────────────────────────
    currentProject: null,       // Active Project object (from project.json)
    currentPage: 'landing',     // 'landing' | 'gallery' | 'groupHistory'
    currentParams: {},          // Extra router params
    previousPage: null,
    previousParams: {},

    // ── ComfyUI engine ────────────────────────────────────────────────────────
    comfyRootPath: null,        // Custom path to an external ComfyUI installation
    allComfyWorkflows: [],      // Workflow registry used by comfyController for id→file lookup

    // ── Runtime asset lists (populated at startup / on demand) ────────────────
    upscaleModels: [],          // Available upscale model filenames from ComfyUI backend
    availableLoras: [],         // Available LoRA filenames from ComfyUI backend

    // ── Canonical selected model ───────────────────────────────────────────────
    s_selectedModelId: null,    // Canonical selected model ID — written by any workspace
                               // that hosts a model selector. Read by other workspaces to
                               // sync the dropdown when switching pages.

    // ── Legacy — keep until LLM re-implementation ─────────────────────────────
    g_selectedModel: null,     // LEGACY — replaced by s_selectedModelId; remove in Task 6
    g_abortControllers: {},     // Used by llmService.js
    currentLoadedModel: null,   // Used by llmService.js
};

/**
 * Singleton state object wrapped in a Proxy to automatically emit 'state:changed'
 * events when any property is mutated.
 */
export const state = new Proxy(_state, {
    set(target, key, value) {
        target[key] = value;
        Events.emit('state:changed', { key, value });
        return true;
    },
    get(target, key) {
        return target[key];
    }
});

