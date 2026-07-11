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

    // ── Remote engine transition phase (MPI-73) ───────────────────────────────
    remoteEnginePhase: null,    // null | 'connecting' | 'disconnecting'. Set while the
                               // RunPod engine is mid-transition so any consumer can read
                               // it at mount (race-free) AND react via state:changed. The
                               // Cue button reads this to disable generation during a
                               // transition; comfyController gates generation on it.
                               // Kept in sync with the remote:connection event `phase`.

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

    s_modelOpDraftByModel: Storage.getModelOpDraft(),
                               // MPI-122: { [modelId]: string[] } — the user's
                               // per-model operation toggle draft in the model-download
                               // page. Survives restart. Written by MpiModelManager via
                               // top-level replace; mirrored to localStorage below.

    s_modelArchDraftByModel: Storage.getModelArchDraft(),
                               // MPI-209: { [modelId]: string[] } — the user's
                               // per-model GPU-arch toggle draft (which arch weight(s)
                               // to install). Separate axis from the op draft. Survives
                               // restart; mirrored to localStorage below.

    s_selectedOpByModel: {},   // MPI-247: { [modelId]: opKey } — the user's last
                               // chosen operation per model. Session-only (NOT
                               // persisted to localStorage): a fresh app start
                               // defaults to the model's natural op. Seeds
                               // activeOperation on Gallery mount + model-switch so
                               // navigation and model changes don't snap the op
                               // back to i2i. Written via setSelectedOp() in
                               // js/utils/modelHelpers.js, only on user-driven op
                               // picks (programmatic PromptBox re-picks are guarded).

    // ── Installed model list (populated after syncModelInstalled) ──────────────
    s_installedModelIds: [],    // Array of model IDs where model.installed === true.
                               // Updated by the 'models:checked' event from modelRegistry.

    // ── App inputs (session-only, MPI-256) ─────────────────────────────────────
    s_appInputs: {},            // { [appId]: Object } — per-App last-collected inputs, so an
                               // App overlay restores its controls on close→reopen. Session-only,
                               // NOT persisted (across-restart restore comes from the sidecar, not
                               // here). ALWAYS top-level replace: state.s_appInputs = { ...state.s_appInputs, [id]: {...} }.

    // ── Download Manager ───────────────────────────────────────────────────────
    downloadJobs: [],            // DownloadJob[] — persisted for shutdown recovery
    downloadQueueActive: false, // true when any download is in progress
    comfyNeedsRestart: false,   // true after a LOCAL custom-node/model install — restarts the local ComfyUI
    remoteComfyNeedsRestart: false, // true after a REMOTE (Pod) install — restarts the Pod's ComfyUI, NOT the local one (kept separate so a remote install never restarts a healthy local engine during a dual-engine session)

    // ── Gallery organization ───────────────────────────────────────────────────
    gallerySort: { order: 'newest', filter: 'all' }, // order: 'newest'|'oldest', filter: 'all'|'images'|'videos'|'audios'|'previews'|'favorites'
    galleryShowInfo: false,          // Show/hide model badges and type badges on gallery cards
    gallerySizeLevel: 3,             // 1–4; survives gallery navigation within session

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
    engineOverride: null,            // null | 'local' — per-generation engine override (R31).
                                     // Written by MpiPromptBox cloud toggle (ON → 'local', OFF → null).
                                     // Reset to null on disconnect. Drives model selector derivation
                                     // via remoteEngineClient.effectiveEngine() instead of isRemote().
                                     // Session-only; never persisted.

    // ── Prompt draft (session-only, not persisted) ─────────────────────────────
    promptDraft: { gallery: { id: null, positive: '', negative: '' }, history: { id: null, positive: '', negative: '' } },
                                     // Per-WORKSPACE prompt text so a draft survives nav and does
                                     // NOT bleed across surfaces — gallery box and history box are
                                     // independent. Each slot is TAGGED with the workspace's card id
                                     // (`id`): history reuses one slot for every card, so MpiPromptBox
                                     // restores only when id matches the card being opened (else the
                                     // previous card's draft would leak). Gallery has no card (id null).
                                     // Keyed on props.workspaceKey + props.workspaceId. Session-only.
    promptMedia: { gallery: { id: null, items: [] }, history: { id: null, items: [] } },
                                     // Per-WORKSPACE staged prompt-media chips (start/end frame, input
                                     // video), same tagged-slot scheme as promptDraft. items[] =
                                     // { url, mediaType, role? } with a DURABLE url (blob: chips are
                                     // dropped — they die on nav). Written by MpiPromptBox on
                                     // media-change, re-injected on a matching-id mount. Session-only.

    // ── Last generation (session-only, not persisted) ──────────────────────────
    lastGeneration: null,            // { label: string, elapsed: number } — set by StatusBar on
                                     // complete(). Read by status bar idle display and future
                                     // meta-card consumers via 'generation:timing' event.

    // ── Viewer rendering ───────────────────────────────────────────────────────
    pixelMode: Storage.getPixelMode(),
                                     // 'auto' (default) | 'smooth' | 'pixel'.
                                     // auto = smooth at fit, pixelated above AUTO_PIXEL_THRESHOLD scale.
                                     // Applied as `html.pixel-mode-{value}` class by shell + state listener.
                                     // MpiCanvas + MpiMaskedImagePreview set per-stack `data-zoom-mode`
                                     // which CSS reads only under `html.pixel-mode-auto`.

    // ── PromptBox UI (cross-session, localStorage-mirrored) ───────────────────
    promptExpanded: Storage.getPromptExpanded(),
                                     // bool — default true. Toggled by chevron lock button in
                                     // MpiPromptBox. Mirrored to localStorage by subscriber below.
    promptReuseOptions: Storage.getPromptReuseOptions(),
                                     // { ask, prompt, settings, model, images }.
                                     // Default: all reuse parts enabled, ask disabled.
    promptReuseSource: Storage.getPromptReuseSource(),
                                     // Gallery-only source preference: 'original' | 'current'.

    // ── OS notification prefs (cross-session, localStorage-mirrored) ──────────
    notificationPrefs: Storage.getNotificationPrefs(),
                                     // { generation, downloads } — per-type OS-notification opt-out.
                                     // Both default true. Read by notificationService at event time;
                                     // does NOT affect in-app toasts. Mirrored by subscriber below.

    // ── RunPod remote engine (cross-session, localStorage-mirrored) ───────────
    runpodConfig: Storage.getRunpodConfig(),
                                     // { enabled, podId, datacenter, gpuType, volumeId, wasConnected } —
                                     // NON-secret prefs only. The API key / wrapper token
                                     // are main-process-only (secrets:* IPC via
                                     // js/core/secretsClient.js) and must never appear
                                     // here or in localStorage. Mirrored by subscriber below.

    // ── Auto-retry wait (MPI-110, transient — NOT persisted) ──────────────────
    remoteWaitGpu: null,             // gpuType currently being waited-for by the
                                     // app-wide auto-retry loop (shell-owned), or null.
                                     // Lets any (re)mounted Settings panel reflect a
                                     // wait that started elsewhere / before it mounted.
};

// Effective image-px → screen-px scale above which auto mode switches to nearest-neighbor.
// 3.0 = 300%. AI images skew small (1K typical, 2-4K when upscaled), so threshold is lower
// than Photoshop's 5.0 default.
export const AUTO_PIXEL_THRESHOLD = 3.0;

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
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
Events.on('state:changed', ({ key, value }) => {
    if (key === 's_selectedModelIdByType') Storage.setSelectedModels(value);
    else if (key === 's_lastSelectedMediaType') Storage.setLastSelectedMediaType(value);
    else if (key === 's_modelOpDraftByModel') Storage.setModelOpDraft(value);
    else if (key === 's_modelArchDraftByModel') Storage.setModelArchDraft(value);
    else if (key === 'pixelMode') {
        const mode = (value === 'smooth' || value === 'pixel') ? value : 'auto';
        Storage.setPixelMode(mode);
        const root = document.documentElement;
        root.classList.remove('pixel-mode-auto', 'pixel-mode-smooth', 'pixel-mode-pixel');
        root.classList.add(`pixel-mode-${mode}`);
    }
    else if (key === 'promptExpanded') Storage.setPromptExpanded(value);
    else if (key === 'promptReuseOptions') Storage.setPromptReuseOptions(value);
    else if (key === 'promptReuseSource') Storage.setPromptReuseSource(value);
    else if (key === 'notificationPrefs') Storage.setNotificationPrefs(value);
    else if (key === 'runpodConfig') Storage.setRunpodConfig(value);
});
