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

export const remoteEngineClient = {

    /** @type {boolean} Mirror of the backend remote-mode flag. */
    _active: false,

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
        } catch (_) {
            this._active = false;
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
