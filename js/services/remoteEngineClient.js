/**
 * remoteEngineClient — narrow renderer adapter for the RunPod remote engine (MPI-64).
 *
 * The single seam through which `ComfyUIController` selects remote mode.
 * Backend (Express) owns the remote-mode flag, the active Pod id, and the
 * wrapper token; this adapter only mirrors them per run.
 *
 * - `refresh()` is called by `ComfyUIController.ensureServerRunning()` at the
 *   start of every run, so mode/token state is fresh per generation.
 * - `httpBase()` returns the Express proxy base in remote mode, `null` in
 *   local mode — callers fall back to the local ComfyUI address, keeping the
 *   local path byte-identical.
 * - `wsUrl(clientId)` is the one renderer-direct exception (binary preview
 *   frames): a WSS URL to the RunPod proxy with the wrapper token as a query
 *   param. The token lives only in this module's memory for the lifetime of
 *   the page; it is never persisted and never logged.
 */

import { clientLogger } from './clientLogger.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { gpuArch } from '../data/modelConstants/gpuArch.js';

export const remoteEngineClient = {

    /** @type {boolean} Mirror of the backend remote-mode flag. */
    _active: false,

    /** @type {'blackwell'|'modern'|'legacy'|null} Cached LOCAL GPU arch token (one gpu-info fetch/session). */
    _localArch: undefined,

    /** @type {boolean} True when the active Pod is a no-GPU "download mode" Pod (MPI-88). */
    _noGpu: false,

    /** @type {string|null} WSS base for the active Pod, e.g. wss://<pod>-8889.proxy.runpod.net */
    _wsBase: null,

    /** @type {string|null} Wrapper token — in-memory only, never logged or persisted. */
    _token: null,

    /**
     * Syncs remote-mode state from Express. Safe to call often; on any
     * failure the adapter falls back to local mode.
     * @returns {Promise<void>}
     */
    async refresh() {
        try {
            const res = await fetch('/remote/mode');
            const mode = await res.json();
            this._active = !!mode.active;
            this._noGpu = !!mode.noGpu;
        } catch (_) {
            this._active = false;
            this._noGpu = false;
        }

        if (!this._active) {
            this._wsBase = null;
            this._token = null;
            return;
        }

        try {
            const res = await fetch('/remote/ws-token');
            if (!res.ok) throw new Error(`ws-token returned ${res.status}`);
            const data = await res.json();
            this._wsBase = data.wsBase || null;
            this._token = data.token || null;
        } catch (_) {
            this._wsBase = null;
            this._token = null;
            clientLogger.warn('remoteEngine', 'WS token fetch failed — remote event channel unavailable');
        }
    },

    /** @returns {boolean} True when the backend reports remote mode active. */
    isRemote() {
        return this._active;
    },

    /**
     * The GPU architecture token for the given engine, ready to pass as the
     * resolver's `variantTokens.arch` (MPI-200). Engine-aware because a balanced
     * model must resolve the weight/workflow for the machine that ACTUALLY runs
     * the gen:
     *   - remote → the RunPod pod's `gpuType` id string (a full GPU name),
     *     classified client-side (sync, no network).
     *   - local  → the local GPU, from a one-time `/system/gpu-info` fetch
     *     (server-computed `gpu.arch`), cached for the session.
     * Returns null when the arch is unknown (no NVIDIA GPU / no pod selected) —
     * the resolver then unions all variant weights (protection) and a balanced
     * card simply won't resolve a concrete workflow, which is correct.
     *
     * @param {'local'|'remote'} engine  Resolve ONCE per gen, AFTER refresh(), then thread.
     * @returns {Promise<'blackwell'|'modern'|'legacy'|null>}
     */
    async arch(engine) {
        if (engine === 'remote') {
            return gpuArch(state.runpodConfig?.gpuType || null);
        }
        if (this._localArch === undefined) {
            try {
                const res = await fetch('/system/gpu-info');
                const data = await res.json();
                this._localArch = data?.gpu?.arch || null;
            } catch (_) {
                this._localArch = null;
            }
        }
        return this._localArch;
    },

    /**
     * Synchronous arch token for the given engine — for SYNC render-path gates
     * (isModelUsable / isOperationInstalled) that can't await. Remote is always
     * sync (reads the pod gpuType); local returns the cached value from a prior
     * `arch('local')` warm, or null if not warmed yet (a null token unions the
     * variant deps → the gate stays conservative until the warm lands). Call
     * `warmLocalArch()` once at boot so the local cache is populated.
     * @param {'local'|'remote'} engine
     * @returns {'blackwell'|'modern'|'legacy'|null}
     */
    archSync(engine) {
        if (engine === 'remote') return gpuArch(state.runpodConfig?.gpuType || null);
        return this._localArch === undefined ? null : this._localArch;
    },

    /** Populate the local-arch cache once (fire-and-forget at app boot). */
    warmLocalArch() {
        return this.arch('local').catch(() => {});
    },

    /**
     * @returns {boolean} True when a no-GPU "download mode" Pod is active (MPI-88).
     * Generation is impossible on it — call sites use this to block entering the
     * gallery / dispatching a generation and steer the user to connect a GPU.
     * Reflects the last refresh(); call refresh() first if freshness matters.
     */
    isDownloadOnly() {
        return this._active && this._noGpu;
    },

    /**
     * HTTP base for ComfyUI-shaped calls. Remote: the Express proxy prefix
     * (absolute, so view URLs stay streamable by the backend). Local: null.
     * @returns {string|null}
     */
    httpBase() {
        return this._active ? `${window.location.origin}/proxy` : null;
    },

    /**
     * Renderer-direct WSS URL for the binary preview event channel, or null
     * when local mode / token unavailable.
     * @param {string} clientId
     * @returns {string|null}
     */
    wsUrl(clientId) {
        if (!this._active || !this._wsBase || !this._token) return null;
        return `${this._wsBase}/ws?clientId=${clientId}&token=${this._token}`;
    },
};

// MPI-179 — self-heal the mirror on every connection edge. refresh() was only
// called from the ComfyUIController connect/generation flows, but a No-GPU
// "download mode" Pod (MPI-88) never runs those — there is no ComfyUI to
// connect to — so `_active` stayed a stale false for the whole session while
// the backend was remote-active. Every engine-scoped consumer (modelRegistry
// check universe, MpiModelManager footprint/partial/install set) then resolved
// the LOCAL universe: live 2026-07-02 an LTX Pod install shipped WITHOUT its
// GGUF transformer and read INSTALLED. Sync on the same event the UI trusts.
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (module singleton)
Events.on('remote:connection', () => { remoteEngineClient.refresh(); });
