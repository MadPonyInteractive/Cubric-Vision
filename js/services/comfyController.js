/**
 * ComfyUIController — ComfyUI WebSocket and workflow execution service.
 *
 * Single public API: {@link runWorkflow}. All other members are internal.
 *
 * @see commandExecutor.js for the execution layer that calls this service.
 */

import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { Events } from '../events.js';
import { remoteEngineClient } from './remoteEngineClient.js';

// Seconds to wait for the ComfyUI server to report ready before giving up.
// Cold start on a slow / CPU-only machine loads torch + a checkpoint and can
// take well over a minute; the previous 60s limit timed out the frontend while
// the server was still coming up. Polling is 1s/iteration, so this is seconds.
const COMFY_READY_TIMEOUT_S = 240;

// MPI-73: the remote engine is mid-transition (connecting/disconnecting). During
// this window the backend remote-mode flag may not match the user's intent yet —
// `isRemote()` can still read false mid-connect — so a generation would silently
// fall to the LOCAL engine (spinning up local ComfyUI) instead of waiting for the
// Pod. Track the transition from the same `remote:connection` phase the UI uses
// and refuse generation while it is in progress. Module-scoped: one subscription
// for the page lifetime (the controller is a singleton).
let _remoteTransition = null; // 'connecting' | 'disconnecting' | null
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (controller singleton)
Events.on('remote:connection', ({ phase = null } = {}) => { _remoteTransition = phase || null; });

// MPI-85: show the "running locally" fallback info toast only once per page so a
// burst of generations after a disconnect doesn't stack identical toasts. Reset
// when a remote connection is (re-)established so a later disconnect notifies again.
let _localFallbackNoticeShown = false;
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (controller singleton)
Events.on('remote:connection', ({ connected = false } = {}) => { if (connected) _localFallbackNoticeShown = false; });

function _buildComfyViewUrl(httpBase, fileInfo) {
    const params = new URLSearchParams();
    for (const key of ['filename', 'type', 'subfolder', 'format', 'frame_rate', 'workflow', 'fullpath']) {
        const value = fileInfo?.[key];
        if (value !== undefined && value !== null) params.set(key, value);
    }
    return `${httpBase}/view?${params.toString()}`;
}

function _collectComfyOutputUrls(httpBase, nodeOutput, target) {
    if (nodeOutput?.images) {
        for (const img of nodeOutput.images) target.push(_buildComfyViewUrl(httpBase, img));
    }
    if (nodeOutput?.gifs) {
        for (const gif of nodeOutput.gifs) target.push(_buildComfyViewUrl(httpBase, gif));
    }
    // The vanilla ComfyUI `SaveVideo` node (replacing VHS_VideoCombine for
    // portable, card-agnostic encoding — VHS's nvenc encode fails on the
    // Blackwell Pod container, B3) emits its result under `videos` instead of
    // `gifs`. Each entry is the same { filename, subfolder, type, format } file
    // dict `_buildComfyViewUrl` already understands, so the /view URL is built
    // identically. Handled here so the "Output" capture node works whether the
    // workflow uses VHS_VideoCombine (gifs) or SaveVideo (videos).
    if (nodeOutput?.videos) {
        for (const vid of nodeOutput.videos) target.push(_buildComfyViewUrl(httpBase, vid));
    }
}

export const ComfyUIController = {

    /** @type {string} Target ComfyUI WS/HTTP server address (local mode). */
    serverAddress: "127.0.0.1:8188",

    /**
     * HTTP base for all ComfyUI-shaped calls. Local mode: the ComfyUI server
     * directly (byte-identical to the historical hardcoded address). Remote
     * mode: the Express proxy, which attaches the wrapper token server-side.
     * @returns {string}
     */
    httpBase() {
        return remoteEngineClient.httpBase() || `http://${this.serverAddress}`;
    },

    /** @type {string} Unique client ID for this session; used in WS handshake and prompt payloads. */
    clientId: crypto.randomUUID(),

    /** @type {WebSocket|null} */
    _ws: null,

    /** @type {boolean} True while a workflow is actively executing. */
    _isRunning: false,

    /** @type {Map<string, (msg: object) => void>} Active WS listeners keyed by ComfyUI prompt_id. */
    _promptListeners: new Map(),

    /** @type {Map<string, object[]>} Prompt-scoped messages that arrived before POST ack handling finished. */
    _pendingPromptMessages: new Map(),

    /** @type {string|null} Last prompt_id reported as actively executing. Used for binary previews. */
    _activePromptId: null,

    /** @type {Map<string, (err: Error) => void>} Reject hooks mirroring `_promptListeners`, used to settle a pending generation if the WS drops out-of-band (e.g. a remote container OOM-kill — B4). */
    _promptRejectors: new Map(),

    /** @type {number} Consecutive WS reconnect attempts with no successful open. Reset on `onopen`; a sustained drop trips `_onWsDropped`. */
    _wsReconnectAttempts: 0,

    /** @type {boolean} True only while the binary-preview WS is OPEN. Wrapper-health `ready` (ComfyUI up) is NOT the same as the preview WS being connected — accepting a generation before the WS is open hangs the job in STARTING with no prompt_id (MPI-73 Bug 1). */
    _wsReady: false,

    /** @returns {boolean} Whether the preview WS is currently open. */
    isWsReady() {
        return this._wsReady === true
            && !!this._ws
            && this._ws.readyState === WebSocket.OPEN;
    },

    /**
     * Resolves true once the binary-preview WS is OPEN, false on timeout.
     * Opens the socket (via `connect()`) if it is not already open. Used by the
     * boot/Settings connect flow to gate the "Connected"/ready signal on a real
     * WS handshake, and by `_ensureRemoteReady` to refuse generation until the
     * WS is up (MPI-73 Bug 1).
     * @param {{ timeoutMs?: number }} [opts]
     * @returns {Promise<boolean>}
     */
    async ensureWsConnected({ timeoutMs = 20000, retryMs = 1500 } = {}) {
        if (this.isWsReady()) return true;
        // Load the remote WS base + token BEFORE connecting. The boot/Settings flow
        // calls ensureWsConnected directly (not via ensureServerRunning), so without
        // this refresh `remoteEngineClient.wsUrl()` is null and connect() falls back
        // to the LOCAL ws://127.0.0.1:8188 — which never opens in remote mode, so the
        // handshake times out and the caller shows a false "almost ready" with the
        // hero stuck on local·offline even though the Pod is up (MPI-73).
        try { await remoteEngineClient.refresh(); } catch { /* fall through; connect() retries below */ }
        const start = Date.now();
        let lastAttempt = 0;
        // RETRY across the whole window, don't rely on a single attempt + a passive
        // waiter. The Pod's preview WS often is not accepting yet at the instant
        // wrapper-health flips `ready`; the first socket errors + closes, and the
        // pre-gen connect path doesn't auto-reconnect (that only runs while a
        // generation is in flight). Without retrying here, ensureWsConnected gives
        // up on that first failure and the caller shows a false "almost ready" even
        // though the WS comes up a few seconds later (MPI-73). Re-`connect()`
        // whenever the socket is missing/closed; `onopen` sets `_wsReady`.
        while (Date.now() - start < timeoutMs) {
            const st = this._ws?.readyState;
            const connecting = st === WebSocket.CONNECTING;
            const open = st === WebSocket.OPEN;
            if (!open && !connecting && Date.now() - lastAttempt >= retryMs) {
                lastAttempt = Date.now();
                this.connect();
            }
            await new Promise(r => setTimeout(r, 250));
            if (this.isWsReady()) return true;
        }
        return false;
    },

    /**
     * Ensures the ComfyUI Python process is running and ready.
     * Emits `comfy:starting` → polls `/comfy/status` → emits `comfy:ready`.
     * On failure emits `comfy:error` and `ui:error`.
     * @returns {Promise<boolean>}
     */
    async ensureServerRunning(opts = {}) {
        // MPI-73: refuse to start ANY generation while the remote engine is
        // connecting or disconnecting. Mid-transition the backend remote-mode flag
        // may not yet reflect the user's intent, so without this guard the run
        // would fall to the LOCAL engine (spinning up local ComfyUI) instead of
        // waiting for the Pod — exactly the "pressed Cue while connecting and it
        // generated locally" bug. Block BEFORE refresh()/the local-vs-remote split.
        if (_remoteTransition) {
            // Backstop only — the Cue button is disabled during a transition
            // (MpiPromptBox), so this rarely fires. Surface a plain INFO toast, not
            // the bug-reporter `comfy:error` modal: a transition refusal is expected
            // UX, not a crash to report. The thrown error still ends the pipeline.
            const tMsg = _remoteTransition === 'disconnecting'
                ? 'Disconnecting the remote engine — wait for it to finish before generating.'
                : 'Connecting to the remote engine — wait until it is ready before generating.';
            Events.emit('ui:info', { message: tMsg });
            const err = new Error(tMsg);
            err.code = 'remote_transition';
            throw err;
        }
        // Remote mode owns its own error surfacing (retry dialog in background,
        // modal-bound comfy:error in foreground) — dispatch OUTSIDE the local
        // try/catch so a remote failure doesn't double-emit ui:error below.
        try { await remoteEngineClient.refresh(); } catch { /* Express unreachable — fall through to local */ }
        if (remoteEngineClient.isRemote()) return await this._ensureRemoteReady(opts);

        try {
            const statusRes = await fetch('/comfy/status');
            const status = await statusRes.json();

            // ── Auto-restart if custom nodes were installed (even if ComfyUI is ready) ─
            if (state.comfyNeedsRestart && status.running) {
                clientLogger.info('comfy', 'Custom nodes installed — triggering auto-restart');
                Events.emit('ui:info', {
                    message: 'Restarting ComfyUI — new custom nodes were installed.',
                });

                await fetch('/comfy/stop', { method: 'POST' });
                await new Promise(r => setTimeout(r, 2000));

                await fetch('/comfy/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isUserRestart: true }),
                });

                // Poll until ready
                let retries = COMFY_READY_TIMEOUT_S;
                while (retries-- > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const check = await fetch('/comfy/status').then(r => r.json());
                        if (check.ready) {
                            state.comfyNeedsRestart = false;
                            Events.emit('comfy:ready');
                            return true;
                        }
                    } catch (e) { /* keep polling */ }
                }
                throw new Error('ComfyUI auto-restart failed to become ready.');
            }

            // If ComfyUI is not running and needs restart flag is set, just clear it
            // (ComfyUI will start fresh, no need for restart message)
            if (state.comfyNeedsRestart && !status.running) {
                state.comfyNeedsRestart = false;
            }

            // Already running and ready — skip startup indicator to avoid flash.
            if (status.running && status.ready) return true;

            Events.emit('comfy:starting');

            if (!status.running) {
                clientLogger.info('comfy', 'Requesting ComfyUI server start');
                await fetch('/comfy/start', { method: 'POST' });
            }

            for (let i = 0; i < COMFY_READY_TIMEOUT_S; i++) {
                const checkRes = await fetch('/comfy/status');
                const check = await checkRes.json();
                if (check.ready) {
                    Events.emit('comfy:ready');
                    return true;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            throw new Error('ComfyUI server failed to become ready in time.');
        } catch (e) {
            Events.emit('comfy:error', { message: e.message });
            clientLogger.error('comfy', 'ComfyUI failed to start', e);
            Events.emit('ui:error', { title: 'ComfyUI failed to start', message: e.message });
            throw e;
        }
    },

    /**
     * Remote-mode readiness check. Polls the Express-side wrapper health relay
     * until the Pod's wrapper reports ready. Pod start/stop lifecycle is owned
     * by the backend (and, later, the Settings boot gate) — this only waits.
     * Emits the same `comfy:starting` / `comfy:ready` events as local mode.
     * @returns {Promise<boolean>}
     * @private
     */
    async _ensureRemoteReady({ background = false } = {}) {
        // Step 4.2 lifecycle: the Pod is created explicitly via Connect in
        // Settings (create-on-Connect / delete-on-Disconnect), never lazily at
        // generation — so generation does NOT auto-create a Pod (avoids a silent
        // billing surprise and the GPU-pick requirement). If the wrapper is
        // already healthy (Connected), proceed; otherwise tell the user to Connect.
        const check = await fetch('/remote/comfy/status').then(r => r.json()).catch(() => ({}));
        if (check.ready) {
            // MPI-88: the connected Pod is a no-GPU "download mode" Pod (CPU-only,
            // for installing models to the volume with no GPU bill). ComfyUI is up
            // and `ready`, but a sampler workflow would fail / crawl on CPU. Block
            // dispatch with a clear, actionable message — the user must switch the
            // GPU picker to a real card and Connect. Soft block (ui:info), not the
            // bug-reporter, and thrown before the restart/WS gates below.
            if (check.noGpu) {
                const gpuMsg = 'This Pod has no GPU — it is for downloading models only. To generate, open Settings → RunPod, pick a GPU, then Connect.';
                if (!background) Events.emit('comfy:error', { message: gpuMsg });
                else Events.emit('ui:info', { message: gpuMsg });
                throw Object.assign(new Error(gpuMsg), { code: 'pod_no_gpu' });
            }
            // A per-model custom_node was installed onto the volume this session
            // (comfy:needs-restart → state.comfyNeedsRestart). ComfyUI only scans
            // custom_nodes at process start, so the already-running remote ComfyUI
            // has NOT loaded it — proceeding would fail with a `missing_node_type`
            // 503 (e.g. PainterI2VAdvanced for Wan I2V). MPI-81: the wrapper now
            // owns ComfyUI and exposes /wrapper/restart-comfy, so restart ONLY the
            // ComfyUI subprocess on the Pod (no Pod reboot, no local detour) and
            // auto-retry — mirroring the local path's stop/start. On an OLDER image
            // the endpoint is absent (404) → fall back to the manual-reconnect msg.
            if (state.comfyNeedsRestart) {
                Events.emit('ui:info', { message: 'Loading new nodes — restarting the remote engine…' });
                let restarted = false;
                try {
                    const r = await fetch('/proxy/restart-comfy', { method: 'POST' });
                    restarted = r.ok;
                } catch { /* relay/network — treated as unsupported below */ }

                if (restarted) {
                    // ComfyUI is relaunching on the Pod (~15s). Mark the WS not-ready
                    // (it points at the old process); the WS gate below calls
                    // ensureWsConnected → connect(), which closes the stale socket and
                    // re-handshakes against the fresh ComfyUI. Poll wrapper health
                    // until comfy_ready first, then fall through to that gate.
                    this._wsReady = false;
                    let retries = COMFY_READY_TIMEOUT_S;
                    let ready = false;
                    while (retries-- > 0) {
                        await new Promise(r => setTimeout(r, 1000));
                        const s = await fetch('/remote/comfy/status').then(r => r.json()).catch(() => ({}));
                        if (s.ready) { ready = true; break; }
                    }
                    if (ready) {
                        state.comfyNeedsRestart = false;
                        // fall through to the WS gate below — it re-opens the WS and
                        // proceeds with the gen on the freshly-restarted ComfyUI.
                    } else {
                        const slow = 'The remote engine is still loading the new nodes — give it a moment, then try again.';
                        if (!background) Events.emit('comfy:error', { message: slow });
                        else Events.emit('ui:info', { message: slow });
                        throw new Error(slow);
                    }
                } else {
                    // Old image without /wrapper/restart-comfy — keep the manual path.
                    const msg = 'New custom nodes were installed for this model. Reconnect the remote engine to load them: open Settings → RunPod, press Disconnect, then Connect, and try again.';
                    if (!background) Events.emit('comfy:error', { message: msg });
                    else Events.emit('ui:error', { title: 'Reconnect required', message: msg });
                    throw new Error(msg);
                }
            }
            // Wrapper-health `ready` only means ComfyUI is UP — it does NOT mean
            // the binary-preview WS is connected. Accepting a generation before
            // the WS handshake completes hangs the job in STARTING with no
            // prompt_id (MPI-73 Bug 1). Require the WS to be open before
            // proceeding; open it on demand and wait briefly for the handshake.
            const wsOk = this.isWsReady() || await this.ensureWsConnected({ timeoutMs: 15000 });
            if (!wsOk) {
                const wsMsg = 'Still connecting to the remote engine — give it a moment, then try again. (Settings → RunPod shows the connection status.)';
                if (!background) Events.emit('comfy:error', { message: wsMsg });
                else Events.emit('ui:info', { message: wsMsg });
                throw new Error(wsMsg);
            }
            if (background) Events.emit('comfy:ready');
            return true;
        }

        // No Pod connected (auto-connect-off boot, or a mid-session disconnect/OOM).
        // MPI-85: the LOCAL engine is still available — fall back to it instead of
        // throwing the bug-reporter error and locking the user out. Drop the stale
        // remote mode so httpBase()/wsUrl() resolve LOCAL, refresh the adapter, then
        // re-enter this method's local branch. Routing follows the ACTUAL connection
        // state, not the "Enable RunPod" toggle. Remote-only models are already absent
        // from the local model list (/comfy/models/check is engine-scoped + the
        // disconnect re-check in shell.js swaps any stale selection), so the requested
        // workflow only references models present locally — no extra gate needed here.
        try {
            await fetch('/remote/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: false }),
            });
        } catch (_) { /* best effort — the refresh below still flips local on failure */ }
        await remoteEngineClient.refresh();
        // Resolve the engine feed to LOCAL (hero/status bar) and trigger the
        // disconnect-edge model re-check so the picker drops to local-only models.
        Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
        if (!_localFallbackNoticeShown) {
            _localFallbackNoticeShown = true;
            Events.emit('ui:info', {
                message: 'No Pod connected — running locally. Connect in Settings → RunPod for cloud generation.',
            });
        }
        clientLogger.info('comfy', 'Remote engine not connected — falling back to the local engine.');
        return await this.ensureServerRunning({ background });
    },

    /**
     * Generates a random 15-digit seed value for KSampler nodes.
     * @returns {number}
     */
    generateRandomSeed() {
        return Math.floor(Math.random() * 100000000000000);
    },

    /**
     * Sends an interrupt signal to the ComfyUI WS server to abort the running pipeline.
     * @returns {Promise<void>}
     */
    async interrupt() {
        // MPI-94 G2 — remote-only "Stopping…" toast. There's a ~5s gap between the
        // interrupt POST and the Pod actually halting the running step; without a
        // hint the user re-clicks Stop thinking nothing happened. Local interrupt
        // is effectively instant, so skip the toast there.
        if (remoteEngineClient.isRemote()) {
            Events.emit('ui:info', { message: 'Stopping… the remote engine is interrupting the current step.' });
        }
        try {
            await fetch(`${this.httpBase()}/interrupt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: this.clientId })
            });
            this._isRunning = false;
        } catch (e) {
            clientLogger.error('comfy', 'Interrupt failed', e);
            this._isRunning = false;
        }
    },

    /**
     * Returns ComfyUI's native queue snapshot.
     * Shape: `{ queue_running: [...], queue_pending: [...] }` (raw Comfy response,
     * normalized to `{ running, pending }` for caller convenience).
     * @returns {Promise<{ running: any[], pending: any[] }>}
     */
    async getQueue() {
        try {
            const res = await fetch(`${this.httpBase()}/queue`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return {
                running: data.queue_running || [],
                pending: data.queue_pending || [],
            };
        } catch (e) {
            clientLogger.error('comfy', 'getQueue failed', e);
            return { running: [], pending: [] };
        }
    },

    /**
     * Clears all pending jobs from ComfyUI's native queue. Does not interrupt
     * the currently running job.
     * @returns {Promise<boolean>}
     */
    async clearQueue() {
        try {
            const res = await fetch(`${this.httpBase()}/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true }),
            });
            return res.ok;
        } catch (e) {
            clientLogger.error('comfy', 'clearQueue failed', e);
            return false;
        }
    },

    /**
     * Removes a specific queued (pending) job from ComfyUI's native queue.
     * Does not affect the currently running job — use `interrupt()` for that.
     * @param {string} promptId
     * @returns {Promise<boolean>}
     */
    async deleteQueueItem(promptId) {
        try {
            const res = await fetch(`${this.httpBase()}/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete: [promptId] }),
            });
            return res.ok;
        } catch (e) {
            clientLogger.error('comfy', 'deleteQueueItem failed', e);
            return false;
        }
    },

    /**
     * Opens (or reuses) a WebSocket connection to the ComfyUI WS server.
     *
     * - Binary ArrayBuffer messages are decoded as JPEG preview blobs and
     *   forwarded to the listener as `{ type: 'preview', url: blobURL }`.
     * - JSON messages are forwarded as-is.
     * - If the socket closes unexpectedly while `_isRunning` is true, it
     *   auto-reconnects once after 1 second.
     *
     * @param {(msg: object) => void} [onMessage]  Message handler to register as the active listener.
     */
    _routeMessage(msg) {
        if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
            const listener = this._activePromptId ? this._promptListeners.get(this._activePromptId) : null;
            listener?.(msg);
            return;
        }

        const promptId = msg?.data?.prompt_id || msg?.prompt_id || null;
        if (promptId) {
            if (msg.type === 'executing' && msg.data?.node !== null) {
                this._activePromptId = promptId;
            }
            const listener = this._promptListeners.get(promptId);
            if (listener) {
                listener(msg);
            } else {
                const pending = this._pendingPromptMessages.get(promptId) || [];
                pending.push(msg);
                this._pendingPromptMessages.set(promptId, pending);
            }
            return;
        }

        if (msg?.type === 'status') return;

        // Some ComfyUI events omit prompt_id but are only meaningful for the
        // currently executing prompt. Route them narrowly instead of broadcasting
        // completions/progress across queued jobs.
        const activeListener = this._activePromptId ? this._promptListeners.get(this._activePromptId) : null;
        activeListener?.(msg);
    },

    connect() {
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
            this._ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    this._routeMessage({ type: 'preview', url });
                } else {
                    const msg = JSON.parse(event.data);
                    this._routeMessage(msg);
                }
            };
            this._ws.binaryType = 'arraybuffer';
            return;
        }

        if (this._ws) {
            this._ws.onopen = null;
            this._ws.onmessage = null;
            this._ws.onerror = null;
            this._ws.onclose = null;
            this._ws.close();
        }

        const wsUrl = remoteEngineClient.wsUrl(this.clientId)
            || `ws://${this.serverAddress}/ws?clientId=${this.clientId}`;
        this._ws = new WebSocket(wsUrl);
        this._ws.binaryType = "arraybuffer";
        this._ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                this._routeMessage({ type: 'preview', url });
            } else {
                const msg = JSON.parse(event.data);
                this._routeMessage(msg);
            }
        };

        this._ws.onopen = () => {
            // A clean open clears the sustained-drop counter so a future blip
            // gets the full reconnect budget again.
            this._wsReconnectAttempts = 0;
            // The preview WS is now genuinely connected — only NOW is the engine
            // safe to accept a generation (MPI-73 Bug 1). `ensureWsConnected` polls
            // `isWsReady()`, which now returns true.
            this._wsReady = true;
        };

        this._ws.onerror = (e) => {
            clientLogger.warn('comfy', 'WebSocket error (may be transient)');
        };

        this._ws.onclose = () => {
            // Socket no longer open — drop the ready flag so a generation gated on
            // `isWsReady()` is refused until a fresh handshake completes (MPI-73).
            this._wsReady = false;
            if (this._promptListeners.size && this._isRunning) {
                // A transient blip reconnects (the socket re-opens, onopen resets
                // the counter). A SUSTAINED drop — e.g. a remote container OOM-kill
                // (exit 137) that takes the wrapper/ComfyUI down — never re-opens,
                // so each onclose re-schedules connect() and the pending generation
                // would hang forever on a dead socket (B4). Cap the retries: after
                // _WS_MAX_RECONNECTS failed opens, treat the engine as gone, settle
                // every pending generation, and stop looping.
                this._wsReconnectAttempts += 1;
                if (this._wsReconnectAttempts > this._WS_MAX_RECONNECTS) {
                    this._onWsDropped();
                    return;
                }
                setTimeout(() => this.connect(), 1000);
            }
        };
    },

    /** @type {number} Failed WS reopen attempts before a drop is treated as engine-down (B4). ~6s at 1s/attempt. */
    _WS_MAX_RECONNECTS: 6,

    /**
     * Settles every in-flight generation when the WS drops out-of-band and does
     * not recover (B4). The remote engine can die mid-generation — a container
     * OOM-kill (exit 137) takes the process down before any `execution_error` WS
     * event, so the socket just closes and the generation promise would otherwise
     * hang "running" forever. Rejecting each pending prompt flows through the
     * existing `commandExecutor` → `generationService` onError chain, which ends
     * the generation cleanly and surfaces a toast. The connection-feed poll
     * (shell.js) repaints the engine status separately.
     * @private
     */
    _onWsDropped() {
        const rejectors = Array.from(this._promptRejectors.values());
        this._promptListeners.clear();
        this._promptRejectors.clear();
        this._pendingPromptMessages.clear();
        this._activePromptId = null;
        this._isRunning = false;
        this._wsReconnectAttempts = 0;
        this._wsReady = false;
        const err = new Error(
            'The remote engine disconnected mid-generation — the Pod may have run '
            + 'out of memory and restarted. Try a shorter or smaller generation, or '
            + 'reconnect from Settings → RunPod.'
        );
        err.code = 'engine_dropped';
        clientLogger.warn('comfy', 'Remote WS dropped mid-generation — ending pending generations');
        Events.emit('remote:engine-dropped');
        for (const reject of rejectors) {
            try { reject(err); } catch (_) { /* best-effort */ }
        }
    },

    /**
     * Generic workflow runner.
     *
     * Handles:
     * 1. **Loading** — resolves a workflow ID string from `state.allComfyWorkflows`
     *    or treats it as a `.json` filename and fetches it from `/comfy_workflows/`.
     * 2. **Asset handling** — image/mask params are uploaded to ComfyUI using
     *    **static filenames** (`mpi_input_image.png`, `mpi_input_mask.png`) to
     *    enable execution caching. Video/audio params resolve to local paths for
     *    path-based loader nodes.
     * 3. **Parameter injection** — params are matched to nodes by `_meta.title`
     *    (case-insensitive) and written to the first matching input field
     *    (`value`, `text`, `int`, `float`, `boolean`, `string`, `ckpt_name`,
     *    `model_name`, `unet_name`, `image`, `mask`, `picks`, `lora_name`,
     *    `strength_model`, `strength_clip`, `denoise`, `seed`, `noise_seed`).
     * 4. **Execution** — connects to the WS, queues the prompt via HTTP POST,
     *    resolves with `{ success: true, images: string[] }` when execution
     *    finishes (node === null on `executing` event), or rejects on error.
     *
     * Binary previews (`ArrayBuffer` / `preview` messages) are forwarded to
     * `onMessage` during execution so callers can display live latents.
     *
     * @param {string|object} workflowOrId  Workflow JSON object or a workflow ID string.
     * @param {object} [params={}]           Title-keyed injection params.
     * @param {((msg: object) => void)=} [onMessage]  Live WS message handler (preview, executed, executing, error).
     * @returns {Promise<{success: boolean, images: string[]}>}
     */
    async runWorkflow(workflowOrId, params = {}, onMessage = null) {
        await this.ensureServerRunning();

        let workflow = workflowOrId;

        // 1. Load workflow if it's an ID string
        if (typeof workflow === 'string') {
            const registry = state.allComfyWorkflows || [];
            const wfConfig = registry.find(w => w.id === workflow);
            const fallbackFile = workflow.includes('.json') ? workflow : `${workflow}.json`;
            const file = wfConfig?.file || fallbackFile;

            const res = await fetch(`/comfy_workflows/${file}`);
            if (!res.ok) throw new Error(`Failed to load workflow: ${file}`);
            workflow = await res.json();
        }

        // 2. Handle media inputs by inspecting the matching workflow node input.
        // This keeps future named slots (Input_Image_2, Reference_Video_3, etc.)
        // from needing another hardcoded map in the controller.
        const mediaParamKinds = {};
        for (const key of Object.keys(params)) {
            const nodes = Object.values(workflow).filter(node =>
                (node?._meta?.title || '').toLowerCase() === key.toLowerCase()
            );
            if (nodes.some(node => node?.inputs && 'video' in node.inputs)) mediaParamKinds[key] = 'video';
            else if (nodes.some(node => node?.inputs && 'audio' in node.inputs)) mediaParamKinds[key] = 'audio';
            else if (nodes.some(node => node?.inputs && 'mask' in node.inputs)) mediaParamKinds[key] = 'mask';
            else if (nodes.some(node => node?.inputs && 'image' in node.inputs)) mediaParamKinds[key] = 'image';
        }
        if (params.Image && !mediaParamKinds.Image) mediaParamKinds.Image = 'image';
        if (params.Input_Image && !mediaParamKinds.Input_Image) mediaParamKinds.Input_Image = 'image';
        if (params.Mask && !mediaParamKinds.Mask) mediaParamKinds.Mask = 'mask';
        if (params.Input_Mask && !mediaParamKinds.Input_Mask) mediaParamKinds.Input_Mask = 'mask';
        // `Input_Video`/`Input_Audio` may now target an `MpiString` fan-out node
        // (string field, no `video`/`audio` input) instead of the VHS loader
        // directly — the split video/audio workflows feed one injected path into
        // both VHS and `MpiHasAudio` via a String node (B3). The field-based
        // detection above misses that, so the raw `/project-file?path=` URL would
        // reach VHS unresolved ("video is not a valid path"). Force the media kind
        // by title so `_resolveMediaPath` (and remote upload) still runs.
        if (params.Input_Video && !mediaParamKinds.Input_Video) mediaParamKinds.Input_Video = 'video';
        if (params.Input_Audio && !mediaParamKinds.Input_Audio) mediaParamKinds.Input_Audio = 'audio';

        for (const [paramKey, mediaKind] of Object.entries(mediaParamKinds)) {
            let val = params[paramKey];
            if (!val) continue;

            if (mediaKind === 'video' || mediaKind === 'audio') {
                if (typeof val === 'string') {
                    const localPath = this._resolveMediaPath(val);
                    // Remote engine: the resolved path is local to this machine and
                    // invisible to the Pod. Upload the file to the Pod volume input
                    // dir via Express → wrapper and inject the bare filename, which
                    // VHS LoadVideo/LoadAudio nodes resolve against the input dir.
                    params[paramKey] = remoteEngineClient.isRemote()
                        ? await this._uploadRemoteMedia(localPath)
                        : localPath;
                }
                continue;
            }

            const staticName = `mpi_${paramKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;

            // Normalize local project paths to /project-file URLs
            if (
                typeof val === 'string' &&
                !val.startsWith('data:') &&
                !val.startsWith('blob:') &&
                !val.startsWith('http') &&
                !val.includes('project-file')
            ) {
                const cleanPath = val.replace(/\\/g, '/');
                val = `/project-file?path=${encodeURIComponent(cleanPath)}`;
            }

            if (
                typeof val === 'string' &&
                (val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('http') ||
                 val.includes('project-file') || val.includes('/project-media/'))
            ) {
                try {
                    const uploadRes = await this._uploadImage(val, staticName);
                    if (uploadRes && uploadRes.name) {
                        params[paramKey] = uploadRes.name;
                    }
                } catch (e) {
                    clientLogger.error('comfy', `Asset upload failed for ${paramKey}`, e);
                    throw e;
                }
            }
        }

        // Defensive: Preview_Only param requested but workflow lacks the boolean
        // node. Op contract guarantees presence on multi-stage workflows; this
        // catches malformed/desynced workflow files. Strip param so injection
        // does not no-op silently and the run proceeds as full generation.
        if (params.Preview_Only !== undefined) {
            const hasNode = Object.values(workflow).some(
                n => (n?._meta?.title || '').toLowerCase() === 'preview_only'
            );
            if (!hasNode) {
                clientLogger.warn('comfy', 'Preview_Only requested but workflow has no matching node — running full generation');
                delete params.Preview_Only;
            }
        }

        // 3. Inject Parameters (Title-Based)
        const _inject = (nodeId, val) => {
            const node = workflow[nodeId];
            if (!node || !node.inputs) return;
            const targets = [
                'value', 'text', 'int', 'float', 'boolean', 'string',
                'ckpt_name', 'model_name', 'unet_name', 'image', 'mask', 'picks',
                'lora_name', 'strength_model', 'strength_clip',
                'denoise', 'seed', 'noise_seed', 'video', 'audio', 'latent'
            ];
            for (const t of targets) {
                if (t in node.inputs) {
                    if (typeof node.inputs[t] === 'number') node.inputs[t] = parseFloat(val);
                    else if (typeof node.inputs[t] === 'boolean') node.inputs[t] = (val === true || val === 'true');
                    else node.inputs[t] = val;
                }
            }
        };

        for (const [key, val] of Object.entries(params)) {
            const nodeIds = Object.keys(workflow).filter(id => {
                const title = workflow[id]._meta?.title || "";
                return title.toLowerCase() === key.toLowerCase();
            });
            for (const id of nodeIds) {
                // Special handling for LoRA objects (Lora_1 through Lora_6)
                if (/^Lora_(?:[A-Za-z]+_)?\d+$/i.test(key) && typeof val === 'object' && val !== null &&
                    'lora_name' in val && 'strength_model' in val && 'strength_clip' in val) {
                    const node = workflow[id];
                    if (node && node.inputs) {
                        if ('lora_name' in node.inputs) node.inputs.lora_name = val.lora_name;
                        if ('strength_model' in node.inputs) node.inputs.strength_model = parseFloat(val.strength_model);
                        if ('strength' in node.inputs) node.inputs.strength = parseFloat(val.strength_model);
                        if ('strength_clip' in node.inputs) node.inputs.strength_clip = parseFloat(val.strength_clip);
                    }
                } else {
                    _inject(id, val);
                }
            }
        }

        // 4. Execution
        return new Promise(async (resolve, reject) => {
            const outputs = [];
            let promptId = null;
            const internalListener = (msg) => {
                if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
                    if (onMessage) onMessage(msg);
                    return;
                }

                if (onMessage) onMessage(msg);

                if (msg.type === 'executed') {
                    const nodeOutput = msg.data.output;
                    _collectComfyOutputUrls(this.httpBase(), nodeOutput, outputs);
                }

                // A node raised in-process (missing node, a node throwing, a
                // torch-caught CUDA OOM, etc). ComfyUI sends execution_error AND
                // THEN an `executing node===null` — without handling the error we
                // would resolve with empty outputs and the user would see a
                // generic "no output returned" instead of the real exception
                // (B0). Reject with a readable message; commandExecutor's catch
                // surfaces it as a ui:error toast and ends the generation.
                // Mode-agnostic (helps local crashes too). NOTE: a container
                // OOM-kill (exit 137) kills the process before this event ever
                // sends — that path is handled by the WS-drop detection (B4).
                if (msg.type === 'execution_error') {
                    const d = msg.data || {};
                    const nodeType = d.node_type || d.class_type || 'a node';
                    const exc = d.exception_type ? `${d.exception_type}: ` : '';
                    const detail = d.exception_message || 'unknown error';
                    if (promptId) {
                        this._promptListeners.delete(promptId);
                        this._promptRejectors.delete(promptId);
                    }
                    if (this._activePromptId === promptId) this._activePromptId = null;
                    this._isRunning = this._promptListeners.size > 0;
                    reject(new Error(`${nodeType} failed: ${exc}${detail}`));
                    return;
                }

                if (msg.type === 'executing' && msg.data.node === null) {
                    if (promptId) {
                        this._promptListeners.delete(promptId);
                        this._promptRejectors.delete(promptId);
                    }
                    if (this._activePromptId === promptId) this._activePromptId = null;
                    this._isRunning = this._promptListeners.size > 0;
                    resolve({ success: true, images: outputs });
                }
            };

            this.connect();
            this._isRunning = true;

            try {
                const req = await fetch(`${this.httpBase()}/prompt`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: workflow, client_id: this.clientId })
                });

                if (!req.ok) {
                    // Two distinct remote-503 shapes from the wrapper (mpi-ci
                    // wrapper.py `_err`): the body is
                    //   { error, message, detail: { comfy_status, comfy_body } }
                    //
                    //  (1) error="comfy_not_ready" (503): the ComfyUI PROCESS is
                    //      down/re-initialising — the OOM container self-restart
                    //      case (A3). RECOVERABLE by waiting → tag `engine_restarting`
                    //      so the executor shows a soft "restarting, retry" toast,
                    //      not the bug-reporter modal.
                    //  (2) error="engine_error" (503): ComfyUI is UP but REJECTED
                    //      the prompt — e.g. an unbaked model weight (B4: RIFE /
                    //      SAM-yolo / upscale) or a bad node. NOT fixed by waiting.
                    //      `detail.comfy_body` carries ComfyUI's real message (it
                    //      names the missing file) but the app used to drop it and
                    //      show a bare "ComfyUI Error". Surface `comfy_body` so these
                    //      unbaked-weight 503s are self-diagnosing (L2/B4 fix).
                    //
                    // A non-JSON body (a bare proxy/Cloudflare 503) must not throw a
                    // parse error and mask the real status.
                    let errCode = null;
                    let errMsg = 'ComfyUI Error';
                    let comfyBody = null;
                    try {
                        const errData = await req.json();
                        errCode = errData?.error || null;
                        errMsg = errData?.message || errData?.error?.message || errMsg;
                        comfyBody = errData?.detail?.comfy_body || null;
                    } catch (_) { /* non-JSON proxy error body — keep the defaults */ }
                    // The detailed ComfyUI body (when present) is the part that names
                    // the real cause — log it and fold it into the surfaced message.
                    if (comfyBody) {
                        clientLogger.error('comfy', `Remote /prompt ${req.status} ${errCode || ''}: ${comfyBody}`);
                        errMsg = `${errMsg} — ${comfyBody}`;
                    }
                    const err = new Error(errMsg);
                    // Only the process-not-ready case is the recoverable restart.
                    if (req.status === 503 && errCode === 'comfy_not_ready') err.code = 'engine_restarting';
                    throw err;
                }

                const ack = await req.json();
                promptId = ack?.prompt_id || null;
                if (!promptId) throw new Error('ComfyUI did not return a prompt_id');
                if (promptId) {
                    this._promptListeners.set(promptId, internalListener);
                    // Register a reject hook so an out-of-band WS drop (B4) can
                    // settle this generation instead of leaving it hung "running".
                    this._promptRejectors.set(promptId, reject);
                    if (onMessage) onMessage({ type: 'prompt_ack', prompt_id: promptId });
                    const pending = this._pendingPromptMessages.get(promptId) || [];
                    this._pendingPromptMessages.delete(promptId);
                    for (const msg of pending) internalListener(msg);
                }
            } catch (err) {
                if (promptId) {
                    this._promptListeners.delete(promptId);
                    this._promptRejectors.delete(promptId);
                }
                this._isRunning = this._promptListeners.size > 0;
                reject(err);
            }
        });
    },

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Uploads an image or mask asset to the ComfyUI server.
     * @param {string} dataUrlOrPath
     * @param {string} filename
     * @returns {Promise<object>}
     * @private
     */
    async _uploadImage(dataUrlOrPath, filename) {
        let blob;
        try {
            const res = await fetch(dataUrlOrPath);
            if (!res.ok) {
                throw new Error(`source returned HTTP ${res.status}`);
            }
            blob = await res.blob();
            if (!blob.type.startsWith('image/')) {
                throw new Error(`source is not an image (${blob.type || 'unknown content type'})`);
            }
        } catch (e) {
            throw new Error(`[ComfyUIController] Failed to prepare blob for ${filename}: ${e.message}`);
        }

        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('overwrite', 'true');

        const uploadRes = await fetch(`${this.httpBase()}/upload/image`, {
            method: 'POST',
            body: formData
        });
        if (!uploadRes.ok) {
            throw new Error(`[ComfyUIController] Comfy upload failed for ${filename}: HTTP ${uploadRes.status}`);
        }
        return await uploadRes.json();
    },

    /**
     * Uploads a resolved local video/audio path to the Pod volume input dir via
     * Express → wrapper and returns the bare filename for the workflow node.
     * Remote-mode only. The Express route reads the local file server-side
     * (the renderer cannot stream an absolute fs path as a blob) and lands it on
     * the volume; VHS LoadVideo/LoadAudio nodes load it by basename.
     * @param {string} localPath  Absolute local path from `_resolveMediaPath`.
     * @returns {Promise<string>} The bare filename to inject into the workflow.
     * @private
     */
    async _uploadRemoteMedia(localPath) {
        const filename = String(localPath).split(/[\\/]/).pop();
        const res = await fetch('/remote/upload/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ localPath, filename }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
            throw new Error(`[ComfyUIController] Remote media upload failed for ${filename}: ${data?.message || `HTTP ${res.status}`}`);
        }
        return data.name || filename;
    },

    /**
     * Resolves app media URLs into local paths for ComfyUI path-loader nodes.
     * @param {string} mediaPathOrUrl
     * @returns {string}
     * @private
     */
    _resolveMediaPath(mediaPathOrUrl) {
        if (!mediaPathOrUrl) return mediaPathOrUrl;

        if (mediaPathOrUrl.includes('project-file?path=')) {
            try {
                const url = new URL(mediaPathOrUrl, window.location.origin);
                return decodeURIComponent(url.searchParams.get('path') || mediaPathOrUrl);
            } catch (_) {
                const match = mediaPathOrUrl.match(/[?&]path=([^&]+)/);
                return match ? decodeURIComponent(match[1]) : mediaPathOrUrl;
            }
        }

        if (
            !mediaPathOrUrl.startsWith('data:') &&
            !mediaPathOrUrl.startsWith('blob:') &&
            !mediaPathOrUrl.startsWith('http')
        ) {
            return mediaPathOrUrl.replace(/\//g, '\\');
        }

        return mediaPathOrUrl;
    }
};
