import { clientLogger } from './services/clientLogger.js';

/**
 * js/events.js — Centralized Event Bus for Cubric Studio.
 *
 * Usage:
 *   import { Events } from './events.js';
 *   Events.on('media:updated', ({ projectId }) => refresh(projectId));
 *   Events.emit('media:updated', { projectId: '123' });
 *   Events.once('comfy:ready', () => startRun());
 *   const ch = Events.channel('generator');
 *   ch.emit('result', { url }); ch.on('result', handler);
 */

'use strict';

class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event. Returns an unsubscribe function.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} unsubscribe
     */
    on(event, handler) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event once — auto-removes after first fire.
     * @param {string} event
     * @param {Function} handler
     */
    once(event, handler) {
        const wrapper = (data) => { handler(data); this.off(event, wrapper); };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe a handler from an event.
     * @param {string} event
     * @param {Function} handler
     */
    off(event, handler) {
        this._listeners.get(event)?.delete(handler);
    }

    /**
     * Emit an event with optional payload.
     * @param {string} event
     * @param {*} [data]
     */
    emit(event, data) {
        this._listeners.get(event)?.forEach(h => {
            try { h(data); } catch (e) { clientLogger.error(`[Events] Error in "${event}" handler:`, e); }
        });
    }

    /**
     * Subscribe to a specific state key change. Filters state:changed events by key.
     * Returns unsubscribe function.
     * @param {string} key
     * @param {Function} handler
     * @returns {Function} unsubscribe
     */
    onState(key, handler) {
        return this.on('state:changed', ({ key: k, value }) => {
            if (k === key) handler(value);
        });
    }

    /**
     * Returns a namespaced sub-bus. Useful for tool-level event isolation.
     * @param {string} namespace
     * @returns {{ on: Function, once: Function, off: Function, emit: Function }}
     */
    channel(namespace) {
        return {
            on:   (event, handler) => this.on(`${namespace}:${event}`, handler),
            once: (event, handler) => this.once(`${namespace}:${event}`, handler),
            off:  (event, handler) => this.off(`${namespace}:${event}`, handler),
            emit: (event, data)    => this.emit(`${namespace}:${event}`, data),
        };
    }

    /**
     * Remove all listeners (useful for testing/cleanup).
     */
    clear() {
        this._listeners.clear();
    }
}

/** @type {EventBus} Singleton event bus available app-wide */
export const Events = new EventBus();

/**
 * @typedef {Object} MpiEventMap — Canonical event names for Cubric Studio
 *
 * 'ui:error'         { title: string, message: string } — show error dialog (shell listens)
 * 'ui:success'       { message: string }              — success toast via StatusBar.notify()
 * 'ui:warning'       { message: string }              — warning toast via StatusBar.notify()
 * 'ui:info'          { message: string }              — info toast via StatusBar.notify()
 * 'media:updated'    { projectId: string }           — any tool saving to library
 * 'tool:running'     { tool: string, type: string }  — tool started a run
 * 'tool:loading-model' { tool: string }              — model loader node executing (VRAM load phase)
 * 'tool:sampling-start' { tool: string, operation?: string } — KSampler about to run (model loaded, sampling begins)
 * 'tool:idle'        { tool: string, type: string }  — tool run finished (success)
 * 'tool:cancelled'   { tool: string }                — tool was cancelled by user or error
 * 'project:changed'  { project: Object }             — user switched active project
 * 'state:changed'    { key: string, value: any }     — reactive state mutation
 * 'comfy:starting'   —                               — ComfyUI server is starting up
 * 'comfy:ready'      —                               — ComfyUI server is ready
 * 'comfy:error'      { message: string }             — ComfyUI failed to start
 * 'nav:tool'         { toolName: string }            — user navigated to a tool
 *
 * Download & Engine Events (bridged from SSE via downloadService):
 * 'download:started'      { modelId: string, job: DownloadJob }    — download enqueued
 * 'download:progress'     { modelId: string, progress: number, speed: string, downloadedBytes: number, totalBytes: number } — download progress update
 * 'download:complete'     { modelId: string }                      — download succeeded
 * 'download:failed'       { modelId: string, error: string }       — download failed
 * 'download:paused'       { modelId: string }                      — download paused by user
 * 'download:resumed'      { modelId: string }                      — download resumed by user
 * 'download:cancelled'    { modelId: string }                      — download cancelled by user
 * 'download:uninstalled'  { modelId: string }                      — model files uninstalled
 * 'download:installing'   { modelId: string }                      — custom node install in progress
 * 'comfy:needs-restart'   { modelId: string }                      — ComfyUI restart required after custom node install
 * 'engine:downloading'    { progress: number, speed: string, downloadedBytes: number, totalBytes: number } — engine download progress
 * 'engine:extracting'     { progress: number }                     — engine extraction in progress
 * 'engine:patching'       { progress: number }                     — engine patching in progress
 * 'engine:upgrade-status' { status: string }                       — engine upgrade status update
 * 'engine:uw-installing'  { progress: number }                     — universal workflow deps installing
 * 'engine:complete'       —                                        — engine install/upgrade complete
 * 'engine:error'          { error: string }                        — engine install/upgrade failed
 * 'engine:ready'          —                                        — engine is ready for use (emitted by shell after all checks)
 * 'models:open'           —                                        — open the Models slide-over (shell re-emits as slide-over:open)
 * 'models:checked'        { installedModelIds: string[] }          — model install state synced
 *
 * Slide-over events:
 * 'slide-over:open'       { title, component, extraClasses?, panelId? }  - open a right slide-over panel
 * 'slide-over:toggle'     { title, component, extraClasses?, panelId? }  - toggle a right slide-over panel
 *
 * Queue panel events:
 * 'generation-queue:open'     â€”                                  â€” open the Cue queue slide-over
 * 'generation-queue:changed'  { running, pending, items, depth }  â€” in-app Cue queue snapshot changed
 *
 * Project events (emitted by ProjectService):
 * 'project:group-added'   { group: Object }                        — new group added and persisted
 * 'project:group-updated' { group: Object }                        — existing group updated and persisted
 * 'project:group-removed' { groupId: string }                      — group removed and persisted
 *
 * Settings events (emitted by UI components, consumed by projectService):
 * 'settings:model:select' { modelId: string }                      — model first selected, create key with defaults if missing
 * 'settings:tool:select'  { toolKey: string }                      — tool first selected, create key with defaults if missing
 * 'settings:model:update' { modelId: string, opName?: string, key: string, value: any }
 *                                                                  — partial setting update (queued + debounced).
 *                                                                    `opName` selects the per-op bucket under
 *                                                                    modelSettings[modelId].operations. Omit `opName` only
 *                                                                    for model-wide keys (loras, upscaleModel).
 * 'settings:shared:update' { mediaType: 'image'|'video', key: string, value: any }
 *                                                                  — cross-model shared setting update (queued + debounced).
 *                                                                    Writes to project.shared[mediaType].
 * 'settings:tool:update'  { toolKey: string,  key: string, value: any } — partial tool setting update (queued + debounced)
 *
 * Media events:
 * 'media:imported'        { url: string, filename: string, mediaType: string } — file imported via PromptBox drop
 * 'media:deleted'         { count: number }                                    — media files removed from disk
 *
 * Project stats events (consumed by projectStatsService):
 * 'project:stats-dirty'   —                                                    — request a refetch of whole-project stats
 * 'history:stats-dirty'   { group: Object }                                    — request a refetch of a single group's stats
 *
 * Generation lifecycle events (emitted by generationService / activeGenerations):
 * 'generation:started'    { id, scope, groupId, tempId, placeholderGroup, extraTempIds, extraPlaceholders }
 * 'generation:preview'    { id, url }
 * 'generation:cancelled'  { id, tempId, extraTempIds }
 * 'generation:complete'   { id, item, group, tempId?, extraTempIds? } — generation succeeded and persisted
 * 'generation-store:changed' { jobs, running, pending, depth } — generationStore snapshot after any job transition (MPI-208; the single source of truth all generation UI derives from)
 *
 * Focus mode events (state-driven; subscribe via `Events.onState('focusMode', ...)`):
 * 'state:changed' { key: 'focusMode', value: boolean } — focus mode toggled
 *
 * Hotkey bridge events (auto-emitted by HotkeyManager for every keypress):
 * 'hotkey:<keyString>'    KeyboardEvent — e.g. 'hotkey:f', 'hotkey:escape'
 */

