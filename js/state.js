import { Events } from './events.js';
import { Storage } from './core/storage.js';

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

    // ── Canonical selected model (per-mediaType, persisted via localStorage) ──
    s_selectedModelIdByType: Storage.getSelectedModels(),
                               // { image: modelId|null, video: modelId|null }.
                               // Read by workspaces via resolveActiveModel(mediaType).
                               // Written via setSelectedModelId(mediaType, id) in
                               // js/utils/modelHelpers.js — top-level replace pattern
                               // (Proxy is shallow). Mirrored to localStorage on every
                               // change by the subscriber below.

    s_lastSelectedMediaType: Storage.getLastSelectedMediaType(),
                               // 'image' | 'video' — which slot was most recently
                               // written. Gallery is mediaType-agnostic: on mount it
                               // resolves from this so the user's last pick (image or
                               // video) is restored. Updated by setSelectedModelId.
                               // Mirrored to localStorage by subscriber below.

    // ── Installed model list (populated after syncModelInstalled) ──────────────
    s_installedModelIds: [],    // Array of model IDs where model.installed === true.
                               // Updated by the 'models:checked' event from modelRegistry.

    // ── Legacy — keep until LLM re-implementation ─────────────────────────────
    g_abortControllers: {},     // Used by llmService.js
    currentLoadedModel: null,   // Used by llmService.js

    // ── Download Manager ───────────────────────────────────────────────────────
    downloadJobs: [],            // DownloadJob[] — persisted for shutdown recovery
    downloadQueueActive: false, // true when any download is in progress
    comfyNeedsRestart: false,   // true after custom node install

    // ── Gallery organization ───────────────────────────────────────────────────
    gallerySort: { order: 'newest', filter: 'all' }, // order: 'newest'|'oldest', filter: 'all'|'images'|'videos'|'favorites'
    galleryShowInfo: false,          // Show/hide model badges and type badges on gallery cards
    gallerySizeLevel: 3,             // 1–5; survives gallery navigation within session

    // ── Project stats (asset count + bytes on disk) ────────────────────────────
    projectStats: { count: 0, bytes: 0 },   // Whole-project totals; refreshed on media add/delete
    historyStats: { groupId: null, count: 0, bytes: 0 }, // Currently-viewed group totals

    // ── Focus mode ─────────────────────────────────────────────────────────────
    focusMode: false,                // F-key toggle: hides app chrome (sidebar, promptbox,
                                     // statusbar, tools/history panels) so the user can focus
                                     // on canvas / gallery / video player. Custom titlebar stays.
                                     // Auto-resets when navigating to PAGE_LANDING.

    // ── Generation queue (session-only) ────────────────────────────────────────
    loopArmed: false,                // Hold-to-arm loop flag. Cue button hold ≥700ms toggles on.
                                     // While armed + queue drains to 0, generationService re-fires
                                     // last payload via getNextGeneration callback. Session-only.
    generationQueueCount: 0,         // Local Cue queue depth (active dispatch + pending jobs).
                                     // Maintained synchronously by generationService.

    // ── Last generation (session-only, not persisted) ──────────────────────────
    lastGeneration: null,            // { label: string, elapsed: number } — set by StatusBar on
                                     // complete(). Read by status bar idle display and future
                                     // meta-card consumers via 'generation:timing' event.
};

// Batching control for state mutations
let _batching = false;
const _batchQueue = new Map(); // key → last value (deduped)

/**
 * Singleton state object wrapped in a Proxy to automatically emit 'state:changed'
 * events when any property is mutated.
 */
export const state = new Proxy(_state, {
    set(target, key, value) {
        target[key] = value;
        if (_batching) {
            _batchQueue.set(key, value);
        } else {
            Events.emit('state:changed', { key, value });
        }
        return true;
    },
    get(target, key) {
        return target[key];
    }
});

/**
 * Batch multiple state mutations into a single render pass.
 * Dedupes mutations to same key — only final value is emitted.
 * @param {Function} fn - Function that performs state mutations
 */
export function batchState(fn) {
    _batching = true;
    try {
        fn();
    } finally {
        _batching = false;
        _batchQueue.forEach((value, key) => Events.emit('state:changed', { key, value }));
        _batchQueue.clear();
    }
}

// Persist selected-model map to localStorage on every change. Source of truth
// is state.s_selectedModelIdByType; localStorage is a mirror for cold-start
// hydration only.
Events.on('state:changed', ({ key, value }) => {
    if (key === 's_selectedModelIdByType') Storage.setSelectedModels(value);
    else if (key === 's_lastSelectedMediaType') Storage.setLastSelectedMediaType(value);
});
