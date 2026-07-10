/**
 * comfyController.js — ComfyUI WebSocket and workflow execution service.
 *
 * MPI-74 Phase 6 (true concurrency): this module exports TWO engine instances —
 * `localEngine` and `remoteEngine` — produced by {@link createEngine}. Each owns
 * its OWN socket, clientId, prompt listeners, and `_activePromptId`, so a cloud
 * gen and a local gen run AT THE SAME TIME without cross-talk. Pick an engine
 * with {@link getEngine}(forceLocal). The default export `ComfyUIController`
 * aliases `remoteEngine` for back-compat (boot/Settings connect gates resolve
 * remote-or-local via `remoteEngineClient`, exactly as the old singleton did).
 *
 * `_alwaysLocal` on an instance pins it to LOCAL ComfyUI (httpBase, WS, /prompt,
 * uploads) and skips the remote model auto-upload — replacing the per-call
 * `forceLocal` flag the single-socket Phase 1 hack threaded through every method.
 *
 * @see commandExecutor.js for the execution layer that calls these engines.
 */

import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { Events } from '../events.js';
import { remoteEngineClient } from './remoteEngineClient.js';
import { buildComfyViewUrl, collectComfyOutputUrls } from '../utils/comfyOutputUrls.js';

// Seconds to wait for the ComfyUI server to report ready before giving up.
// Cold start on a slow / CPU-only machine loads torch + a checkpoint and can
// take well over a minute; the previous 60s limit timed out the frontend while
// the server was still coming up. Polling is 1s/iteration, so this is seconds.
const COMFY_READY_TIMEOUT_S = 240;

// Binary preview frames carry a header before the JPEG payload. Core ComfyUI uses
// an 8-byte header ([event_type, image_type]); KJNodes' LTX2 preview override
// (LTX latent previews, MPI-166) uses VideoHelperSuite's 28-byte VHS header. A
// fixed slice(8) corrupts the VHS frames. Find the JPEG SOI marker (FF D8) and
// slice from there so any header length works; fall back to 8 if not found.
function _stripPreviewHeader(buf) {
    const b = new Uint8Array(buf);
    const max = Math.min(b.length - 1, 64); // SOI is within the header, scan a bounded prefix
    for (let i = 0; i < max; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xd8) return buf.slice(i);
    }
    return buf.slice(8);
}

// MPI-73: the remote engine is mid-transition (connecting/disconnecting). During
// this window the backend remote-mode flag may not match the user's intent yet —
// `isRemote()` can still read false mid-connect — so a generation would silently
// fall to the LOCAL engine (spinning up local ComfyUI) instead of waiting for the
// Pod. Track the transition from the same `remote:connection` phase the UI uses
// and refuse generation while it is in progress. Module-scoped: one subscription
// for the page lifetime (shared by both engine instances).
let _remoteTransition = null; // 'connecting' | 'disconnecting' | null
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (controller singleton)
Events.on('remote:connection', ({ phase = null } = {}) => { _remoteTransition = phase || null; });

// MPI-85: show the "running locally" fallback info toast only once per page so a
// burst of generations after a disconnect doesn't stack identical toasts. Reset
// when a remote connection is (re-)established so a later disconnect notifies again.
let _localFallbackNoticeShown = false;
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener (controller singleton)
Events.on('remote:connection', ({ connected = false } = {}) => { if (connected) _localFallbackNoticeShown = false; });

// MPI-198: local ComfyUI's loader enum uses the ENGINE-OS separator (Windows '\',
// Linux/macOS '/'). Baked workflow values ship Windows backslashes, so on a
// Linux/macOS LOCAL engine (portable builds) they must be healed to '/' too — not
// only on remote. Cache the server's process.platform once (renderer has no
// reliable process.platform). '' until fetched; the heal gate treats unknown as
// win32 (no-op) so a slow/failed fetch never breaks Windows-local.
let _serverPlatform = '';
fetch('/system/platform-config')
    .then(r => (r.ok ? r.json() : null))
    .then(cfg => { if (cfg && cfg.platform) _serverPlatform = cfg.platform; })
    .catch(() => { /* stays '' → treated as win32, backslashes untouched */ });

// Heal is needed when the target engine's loader enum uses '/': remote (always
// Linux Pod) OR local on a non-Windows host.
function _needsPathHeal(alwaysLocal) {
    if (!alwaysLocal && remoteEngineClient.isRemote()) return true;
    return _serverPlatform !== '' && _serverPlatform !== 'win32';
}

/**
 * Pull the offending `lora_name` out of a LOCAL ComfyUI 400 body's `node_errors`.
 * Shape (ComfyUI execution.py):
 *   node_errors: { "<nodeId>": { errors: [ { type: 'value_not_in_list',
 *     extra_info: { input_name: 'lora_name', received_value: 'sdxl\\x.safetensors' } } ] } }
 * `received_value` is the clean filename — preferred over parsing the `details`
 * string, which is '' whenever any other output node still validated.
 * @param {object|null|undefined} nodeErrors
 * @returns {string|null} the received lora_name, or null when no such error
 */
function _findNodeErrorLora(nodeErrors) {
    if (!nodeErrors || typeof nodeErrors !== 'object') return null;
    for (const node of Object.values(nodeErrors)) {
        for (const e of (node?.errors || [])) {
            if (e?.type !== 'value_not_in_list') continue;
            if (e?.extra_info?.input_name !== 'lora_name') continue;
            const got = e.extra_info.received_value;
            if (typeof got === 'string' && got) return got;
        }
    }
    return null;
}

// Adapters over the shared js/utils/comfyOutputUrls.js (MPI-176): this controller
// resolves httpBase per-instance (remote or local pinned), so it binds httpBase.
function _collectComfyOutputUrls(httpBase, nodeOutput, target) {
    collectComfyOutputUrls(f => buildComfyViewUrl(httpBase, f), nodeOutput, target);
}

/**
 * Builds one ComfyUI engine instance. Two are created at module load:
 * `remoteEngine` (`alwaysLocal:false`) and `localEngine` (`alwaysLocal:true`).
 * Each instance is fully self-contained — its own WS socket, clientId, prompt
 * registries, and `_activePromptId` — so two can run concurrently (MPI-74 P6).
 *
 * @param {{ engine: 'local'|'remote', alwaysLocal: boolean }} cfg
 */
function createEngine({ engine, alwaysLocal }) {
    return {

    /** @type {'local'|'remote'} This engine's identity (used in comfy:* event tags). */
    engine,

    /** @type {boolean} When true this engine ALWAYS targets local ComfyUI (httpBase/WS/uploads/skip-remote), regardless of remote-connection state. */
    _alwaysLocal: alwaysLocal,

    /** @type {string} Target ComfyUI WS/HTTP server address (local mode). */
    serverAddress: "127.0.0.1:8188",

    /**
     * HTTP base for all ComfyUI-shaped calls. Local-pinned engine: the ComfyUI
     * server directly. Remote engine: the Express proxy (token attached server-
     * side) when remote-connected, else the local address.
     * @returns {string}
     */
    httpBase() {
        if (this._alwaysLocal) return `http://${this.serverAddress}`;
        return remoteEngineClient.httpBase() || `http://${this.serverAddress}`;
    },

    /** @type {string} Unique client ID for THIS engine's session; used in WS handshake and prompt payloads. Per-engine so ComfyUI can demux two concurrent sockets (MPI-74 P6 Step 4). */
    clientId: crypto.randomUUID(),

    /** @type {WebSocket|null} */
    _ws: null,

    /** @type {boolean} True while a workflow is actively executing on THIS engine. */
    _isRunning: false,

    /** @type {Map<string, (msg: object) => void>} Active WS listeners keyed by ComfyUI prompt_id. */
    _promptListeners: new Map(),

    /** @type {Map<string, object[]>} Prompt-scoped messages that arrived before POST ack handling finished. */
    _pendingPromptMessages: new Map(),

    /** @type {string|null} Last prompt_id reported as actively executing. Used for binary previews. */
    _activePromptId: null,

    /** @type {Map<string, (err: Error) => void>} Reject hooks mirroring `_promptListeners`, used to settle a pending generation if the WS drops out-of-band (e.g. a remote container OOM-kill — B4). */
    _promptRejectors: new Map(),

    /** @type {Map<string, (result: object) => void>} Resolve hooks mirroring `_promptListeners`. Used to settle a pending generation from `/history` when the live terminal WS event was MISSED during a reconnect blip (MPI-152): terminal events are sent `broadcast=False` and are NOT replayed on reconnect, so a gen that finishes during the ~1s reconnect window would hang forever. `_reconcileFromHistory` resolves through this. */
    _promptResolvers: new Map(),

    /** @type {number} Consecutive WS reconnect attempts with no successful open. Reset on `onopen`; a sustained drop trips `_onWsDropped`. */
    _wsReconnectAttempts: 0,

    /** @type {boolean} True only while the binary-preview WS is OPEN. Wrapper-health `ready` (ComfyUI up) is NOT the same as the preview WS being connected — accepting a generation before the WS is open hangs the job in STARTING with no prompt_id (MPI-73 Bug 1). */
    _wsReady: false,

    /** @type {Map<string, ReturnType<typeof setInterval>>} REMOTE-only per-prompt /history poll backstop. The direct renderer→Pod terminal WS has no app-side keepalive, so RunPod's edge proxy reaps it idle during long sampling and the terminal `execution_success` is lost; the one-shot reconnect reconcile bails if it fires mid-stage and never re-arms. This interval re-runs `_reconcileFromHistory` every few seconds until the gen settles — a generation-lifetime backstop independent of WS health. */
    _historyPollTimers: new Map(),

    /** @type {number} Interval (ms) for the remote /history poll backstop. */
    _HISTORY_POLL_MS: 5000,

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
        // hero stuck on local·offline even though the Pod is up (MPI-73). A
        // local-pinned engine skips the refresh (it always wants the local socket).
        if (!this._alwaysLocal) {
            try { await remoteEngineClient.refresh(); } catch { /* fall through; connect() retries below */ }
        }
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
     * @returns {Promise<{ ready: boolean, remoteComfyRestarted: boolean }>}
     */
    async ensureServerRunning(opts = {}) {
        // Remote mode owns its own error surfacing (retry dialog in background,
        // modal-bound comfy:error in foreground) — dispatch OUTSIDE the local
        // try/catch so a remote failure doesn't double-emit ui:error below. A
        // local-pinned engine skips the remote refresh entirely.
        //
        // MPI-156: this refresh runs BEFORE the transition guard below (it used to
        // run after). After a disconnect+DELETE, the renderer's `_remoteTransition`
        // can be left stale (a `phase` event missed/raced) — and a stale
        // `disconnecting` would throw the transition error below for EVERY later
        // gen, LOCAL included, wedging the app until restart (zero `[comfy]` lines:
        // the throw is before any engine starts). Refreshing first lets the guard
        // reconcile against backend truth: if the backend reports remote-mode
        // INACTIVE, the Pod is gone and the user's intent is local — a stale
        // transition flag must not block that.
        if (!this._alwaysLocal) {
            try { await remoteEngineClient.refresh(); } catch { /* Express unreachable — fall through to local */ }
        }

        // MPI-73: refuse to start ANY remote generation while the remote engine is
        // connecting or disconnecting. Mid-transition the backend remote-mode flag
        // may not yet reflect the user's intent, so without this guard the run
        // would fall to the LOCAL engine (spinning up local ComfyUI) instead of
        // waiting for the Pod — exactly the "pressed Cue while connecting and it
        // generated locally" bug. A local-pinned engine is unaffected: it always
        // wants local ComfyUI, so a remote transition never mis-routes it.
        //
        // MPI-156: only honour the transition flag when the backend STILL reports
        // remote mode active. A `disconnecting` flag stuck after a Pod delete (the
        // backend already cleared remote mode) is stale — clear it and fall through
        // to local so a torn-down engine can never block a local gen indefinitely.
        if (_remoteTransition && !this._alwaysLocal) {
            if (_remoteTransition === 'disconnecting' && !remoteEngineClient.isRemote()) {
                clientLogger.warn('comfy', 'Stale "disconnecting" transition after remote teardown — clearing and falling through to local.');
                _remoteTransition = null;
            } else {
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
        }
        // A local-pinned engine ALWAYS takes the local branch below, even while
        // remote-connected; the remote engine takes the remote-ready path when a
        // Pod is connected.
        if (!this._alwaysLocal && remoteEngineClient.isRemote()) return await this._ensureRemoteReady(opts);

        try {
            const statusRes = await fetch('/comfy/status');
            const status = await statusRes.json();

            // The restart-needed signal can live in EITHER place: the frontend
            // `state` flag (set live via the `comfy:needs-restart` SSE) OR the
            // server-authoritative `status.needsRestart` (set by a local custom-node
            // install). The server flag is the durable one — it survives an app /
            // browser reload that wipes frontend `state`, and it covers the race where
            // a node was installed while ComfyUI was still BOOTING (its scan already
            // ran + cached an import failure). Honor either.
            const needsRestart = state.comfyNeedsRestart || status.needsRestart === true;

            // ── Auto-restart if custom nodes were installed (even if ComfyUI is ready) ─
            if (needsRestart && status.running) {
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
                            this._emitLifecycle('comfy:ready');
                            return { ready: true, remoteComfyRestarted: false };
                        }
                    } catch (e) { /* keep polling */ }
                }
                throw new Error('ComfyUI auto-restart failed to become ready.');
            }

            // If ComfyUI is not running and a restart was pending, just clear the
            // frontend flag (the fresh start below scans nodes anew; the server flag
            // is cleared by /comfy/start when it spawns the process).
            if (needsRestart && !status.running) {
                state.comfyNeedsRestart = false;
            }

            // Already running and ready — skip the startup indicator to avoid a
            // flash, but STILL emit `comfy:ready`. Consumers (shell.js → loadAssets)
            // hang the asset-list load off this event, and on a cold app start with
            // ComfyUI already up this is the ONLY path taken — a silent return left
            // `state.availableLoras` empty, which fails the missing-LoRA guard open
            // (_findMissingModel treats an empty list as "engine not ready").
            if (status.running && status.ready) {
                this._emitLifecycle('comfy:ready');
                return { ready: true, remoteComfyRestarted: false };
            }

            // background: a boot auto-start brings the engine up silently — no
            // blocking "Starting ComfyUI Engine…" overlay. Manual generation still
            // emits it so the user sees the engine spinning up before their job.
            if (!opts.background) this._emitLifecycle('comfy:starting');

            if (!status.running) {
                clientLogger.info('comfy', 'Requesting ComfyUI server start');
                await fetch('/comfy/start', { method: 'POST' });
            }

            for (let i = 0; i < COMFY_READY_TIMEOUT_S; i++) {
                const checkRes = await fetch('/comfy/status');
                const check = await checkRes.json();
                if (check.ready) {
                    this._emitLifecycle('comfy:ready');
                    return { ready: true, remoteComfyRestarted: false };
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            throw new Error('ComfyUI server failed to become ready in time.');
        } catch (e) {
            this._emitLifecycle('comfy:error', { message: e.message });
            clientLogger.error('comfy', 'ComfyUI failed to start', e);
            Events.emit('ui:error', { title: 'ComfyUI failed to start', message: e.message });
            throw e;
        }
    },

    /**
     * Emits an engine-tagged ComfyUI lifecycle event (MPI-74 P6 Step 3). The
     * `engine` tag lets the shell show a NON-blocking per-engine boot status so a
     * local cold-boot never freezes a running cloud gen (and vice versa).
     * @param {'comfy:starting'|'comfy:ready'|'comfy:error'} name
     * @param {object} [detail]
     * @private
     */
    _emitLifecycle(name, detail = {}) {
        Events.emit(name, { ...detail, engine: this.engine });
    },

    /**
     * Remote-mode readiness check. Polls the Express-side wrapper health relay
     * until the Pod's wrapper reports ready. Pod start/stop lifecycle is owned
     * by the backend (and, later, the Settings boot gate) — this only waits.
     * Emits the same `comfy:starting` / `comfy:ready` events as local mode.
     * @returns {Promise<{ ready: boolean, remoteComfyRestarted: boolean }>}
     * @private
     */
    async _ensureRemoteReady({ background = false } = {}) {
        // Step 4.2 lifecycle: the Pod is created explicitly via Connect in
        // Settings (create-on-Connect / delete-on-Disconnect), never lazily at
        // generation — so generation does NOT auto-create a Pod (avoids a silent
        // billing surprise and the GPU-pick requirement). If the wrapper is
        // already healthy (Connected), proceed; otherwise tell the user to Connect.
        // MPI-107: a SINGLE probe miss here used to drop the user silently to the
        // LOCAL engine (the fall-to-local branch below) even when the Pod was alive
        // — a transient wrapper 503 (e.g. right after a Cancel/interrupt, or mid
        // restart-comfy) reads identical to "Pod gone". Retry a few times before
        // concluding not-ready, so only a PERSISTENT not-ready falls to local
        // (genuine OOM/disconnect/delete — MPI-85). Same transient-retry posture as
        // wrapperFetch. Connecting Pods are gated upstream (_remoteTransition).
        let check = {};
        for (let attempt = 0; attempt < 3; attempt++) {
            check = await fetch('/remote/comfy/status').then(r => r.json()).catch(() => ({}));
            if (check.ready) break;
            if (attempt < 2) await new Promise(r => setTimeout(r, 700));
        }
        if (check.ready) {
            let remoteComfyRestarted = false;
            // MPI-88: the connected Pod is a no-GPU "download mode" Pod (CPU-only,
            // for installing models to the volume with no GPU bill). ComfyUI is up
            // and `ready`, but a sampler workflow would fail / crawl on CPU. Block
            // dispatch with a clear, actionable message — the user must switch the
            // GPU picker to a real card and Connect. Soft block (ui:info), not the
            // bug-reporter, and thrown before the restart/WS gates below.
            if (check.noGpu) {
                const gpuMsg = 'This Pod has no GPU — it is for downloading models only. To generate, open Settings → RunPod, pick a GPU, then Connect.';
                if (!background) this._emitLifecycle('comfy:error', { message: gpuMsg });
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
            if (state.remoteComfyNeedsRestart) {
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
                        // MPI-107: gate on comfy_ready, NOT wrapper `ready`. A
                        // restart-comfy reloads ONLY the ComfyUI subprocess — the
                        // wrapper stays up, so `s.ready` is true the whole time and
                        // breaking on it accepts a gen before ComfyUI is back
                        // (→ interrupt/gen 503, "no output"). `comfyReady` is the
                        // signal that flips. `=== undefined` keeps old-image compat.
                        // Mirrors the shell.js connection gate.
                        if (s.ready && (s.comfyReady === undefined || s.comfyReady)) { ready = true; break; }
                    }
                    if (ready) {
                        state.remoteComfyNeedsRestart = false;
                        remoteComfyRestarted = true;
                        // fall through to the WS gate below — it re-opens the WS and
                        // proceeds with the gen on the freshly-restarted ComfyUI.
                    } else {
                        const slow = 'The remote engine is still loading the new nodes — give it a moment, then try again.';
                        if (!background) this._emitLifecycle('comfy:error', { message: slow });
                        else Events.emit('ui:info', { message: slow });
                        throw new Error(slow);
                    }
                } else {
                    // Old image without /wrapper/restart-comfy — keep the manual path.
                    const msg = 'New custom nodes were installed for this model. Reconnect the remote engine to load them: open Settings → RunPod, press Disconnect, then Connect, and try again.';
                    if (!background) this._emitLifecycle('comfy:error', { message: msg });
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
                if (!background) this._emitLifecycle('comfy:error', { message: wsMsg });
                else Events.emit('ui:info', { message: wsMsg });
                throw new Error(wsMsg);
            }
            if (background) this._emitLifecycle('comfy:ready');
            return { ready: true, remoteComfyRestarted };
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
        // Fall to the LOCAL engine instance — it always takes the local branch.
        return await localEngine.ensureServerRunning({ background });
    },

    /**
     * Generates a random 15-digit seed value for KSampler nodes.
     * @returns {number}
     */
    generateRandomSeed() {
        return Math.floor(Math.random() * 100000000000000);
    },

    /**
     * Sends an interrupt signal to THIS engine's ComfyUI server to abort its
     * running pipeline. Per-engine (MPI-74 P6): Stopping a cloud job interrupts
     * only the cloud engine; a concurrent local job keeps running, and vice versa.
     * @returns {Promise<void>}
     */
    async interrupt() {
        // MPI-94 G2 — REVERTED 2026-06-15 (user feedback): a user-initiated Stop
        // should NOT raise a toast; it was noise. `interrupt()` is only ever the
        // user-Stop path (all callers are cancel()), so no toast belongs here.
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
     * Opens (or reuses) a WebSocket connection to THIS engine's ComfyUI WS server.
     *
     * - Binary ArrayBuffer messages are decoded as JPEG preview blobs and
     *   forwarded to the listener as `{ type: 'preview', url: blobURL }`.
     * - JSON messages are forwarded as-is.
     * - If the socket closes unexpectedly while `_isRunning` is true, it
     *   auto-reconnects once after 1 second.
     */
    _routeMessage(msg) {
        // `preview` (binary frame) and `VHS_latentpreview` (video preview window
        // boundary, MPI-167) carry no prompt_id — route them to the active prompt.
        if (msg instanceof ArrayBuffer || (msg && (msg.type === 'preview' || msg.type === 'VHS_latentpreview'))) {
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
        // Reuse a live socket (this engine owns exactly one; it always points at
        // this engine's target, so no wrong-engine check is needed — that was the
        // single-socket `_wsForceLocal` hack, dead now that sockets are per-engine).
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
            this._ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([_stripPreviewHeader(event.data)], { type: 'image/jpeg' });
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

        // A local-pinned engine ALWAYS uses the local preview WS, even while remote-
        // connected, so its previews + completion events come from local ComfyUI.
        // The remote engine uses the proxy WS when connected, else local.
        const wsUrl = (!this._alwaysLocal && remoteEngineClient.wsUrl(this.clientId))
            || `ws://${this.serverAddress}/ws?clientId=${this.clientId}`;
        this._ws = new WebSocket(wsUrl);
        this._ws.binaryType = "arraybuffer";
        this._ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const blob = new Blob([_stripPreviewHeader(event.data)], { type: 'image/jpeg' });
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
            // MPI-152: if a generation was in flight when the socket blipped, the
            // terminal completion event (broadcast=False, not replayed) may have
            // fired into the dead socket and been lost → the gen would hang forever.
            // Reconcile from `/history` now that we're reconnected. Small delay so
            // the connection settles before the HTTP call.
            if (this._isRunning && this._activePromptId) {
                const pid = this._activePromptId;
                setTimeout(() => this._reconcileFromHistory(pid), 500);
            }
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
        for (const id of this._historyPollTimers.keys()) this._stopHistoryPoll(id);
        this._promptListeners.clear();
        this._promptRejectors.clear();
        this._promptResolvers.clear();
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
     * Settle a generation from ComfyUI `/history` when its live terminal WS event
     * was MISSED during a reconnect blip (MPI-152). ComfyUI sends terminal events
     * (`execution_success` / the legacy `executing node===null`) with
     * `broadcast=False` to the submitting client only, and does NOT replay them on
     * reconnect. A gen that finishes during the ~1s WS reconnect window therefore
     * never settles → the gallery card spins + the status bar hangs forever even
     * though the engine finished and the output file exists.
     *
     * On reconnect (`onopen`, while a gen is in flight) we query
     * `/history/{prompt_id}`:
     *   - empty `{}`            → still running; let normal WS events settle it.
     *   - status.completed +    → DONE: build output URLs from `entry.outputs`
     *     status_str==='success'  (same per-node shape as the `executed` event, so
     *                             `_collectComfyOutputUrls` is reused) and resolve.
     *   - status_str==='error'  → reject with the history error messages.
     * Best-effort: any fetch/parse failure is swallowed so the normal WS flow (or
     * the B4 drop watchdog) still governs.
     * @param {string} promptId
     * @private
     */
    async _reconcileFromHistory(promptId, source = 'reconnect') {
        // Already settled by a live event between the onopen and this timeout.
        if (!this._promptResolvers.has(promptId)) return;
        let entry;
        try {
            // Both modes hit `${httpBase()}/history/{id}`. Remote httpBase() is
            // `/proxy`, so this resolves to the Express route GET /proxy/history/:id
            // (routes/remoteProxy.js), which forwards SERVER-side to the Pod
            // wrapper's /wrapper/history/{id}. The client must NOT prepend /wrapper
            // itself — `/proxy/wrapper/history` is not a route and 404s, which
            // silently broke EVERY remote reconcile (the !resp.ok early-return
            // swallowed it) so a missed-terminal gen hung forever (MPI-152/156). The
            // /wrapper segment belongs only to the server→Pod leg. Local httpBase()
            // is the ComfyUI origin, so /history hits ComfyUI directly.
            const histUrl = `${this.httpBase()}/history/${promptId}`;
            const resp = await fetch(histUrl);
            if (!resp.ok) return;
            const data = await resp.json();
            entry = data?.[promptId];
        } catch (_) {
            return; // proxy/wrapper not ready — let WS flow handle it
        }
        if (!entry) return;                       // not in history yet → still running
        const status = entry.status;
        if (!status?.completed) return;           // incomplete → still running
        // Re-check: a live terminal event may have landed during the await.
        if (!this._promptResolvers.has(promptId)) return;

        if (status.status_str === 'error') {
            const reject = this._promptRejectors.get(promptId);
            this._stopHistoryPoll(promptId);
            this._promptListeners.delete(promptId);
            this._promptRejectors.delete(promptId);
            this._promptResolvers.delete(promptId);
            if (this._activePromptId === promptId) this._activePromptId = null;
            this._isRunning = this._promptListeners.size > 0;
            clientLogger.warn('comfy', `Reconciled FAILED gen ${promptId} from /history`);
            reject?.(new Error(`Remote generation failed: ${(status.messages || []).join('; ') || 'unknown error'}`));
            return;
        }

        // success → REPLAY the missed events through the prompt's own
        // internalListener (registered at /prompt ack) instead of resolving the
        // promise directly. Synthetic `executed` per history node re-feeds the
        // caller's onMessage (commandExecutor filters output/latent/audio nodes
        // and dedups replayed ids), and the synthetic `execution_success`
        // terminal runs the FULL normal teardown: listener/resolver/rejector
        // cleanup, poll stop, promise resolve, and — critically —
        // commandExecutor's `_finishGeneration()` → exec.onComplete → gallery
        // card + status bar + queue lane. The old body resolved the runWorkflow
        // promise directly, but its value has NO consumer (commandExecutor
        // awaits it purely for the error path), so a missed-terminal gen
        // completed on the engine yet stayed wedged in the app forever: queue
        // card RUNNING, status bar counting, output stranded in /history
        // (MPI-203 — 2/2 live remote gens on pod 81kol4nhlutsx0).
        const listener = this._promptListeners.get(promptId);
        const nodeCount = Object.keys(entry.outputs || {}).length;
        clientLogger.info('comfy', `Reconciled completed gen ${promptId} from /history via ${source} (${nodeCount} output nodes) — terminal WS event was missed`);
        // MPI-208 Phase 5 (archaeology Part-4 gap): the terminal WS event was missed,
        // so the user watched the bar hang and never saw this gen finish. The replay
        // below recovers the output silently — surface a soft toast so the recovery
        // isn't invisible ("why did my gen suddenly appear?"). Info, not success —
        // it's a recovered anomaly, not a normal completion (whose own toast fires
        // from the status bar on the synthetic terminal below).
        //
        // ONLY toast on a genuine reconnect. On some Pods (e.g. Wan 5B, or dev-mode
        // raw-8188 exposure) the direct terminal WS is structurally unreachable, so
        // the lifetime `poll` backstop recovers EVERY gen — toasting there fires the
        // "blip" alarm on every single generation (false alarm, it's steady state).
        // The reconnect/one-shot path is the only one that maps to an actual blip.
        if (source !== 'poll') {
            Events.emit('ui:info', { message: 'Generation recovered — the result was retrieved after a connection blip.' });
        }
        if (listener) {
            for (const [nodeId, nodeOutput] of Object.entries(entry.outputs || {})) {
                listener({ type: 'executed', data: { node: nodeId, output: nodeOutput, prompt_id: promptId } });
            }
            listener({ type: 'execution_success', data: { prompt_id: promptId } });
            return;
        }
        // Defensive fallback — resolver alive but listener gone (should not
        // happen; both are set/cleared together). Settle the promise directly
        // rather than hang.
        const outputs = [];
        for (const nodeOutput of Object.values(entry.outputs || {})) {
            _collectComfyOutputUrls(this.httpBase(), nodeOutput, outputs);
        }
        const resolve = this._promptResolvers.get(promptId);
        this._stopHistoryPoll(promptId);
        this._promptListeners.delete(promptId);
        this._promptRejectors.delete(promptId);
        this._promptResolvers.delete(promptId);
        if (this._activePromptId === promptId) this._activePromptId = null;
        this._isRunning = this._promptListeners.size > 0;
        resolve?.({ success: true, images: outputs });
    },

    /**
     * REMOTE-only: start a generation-lifetime /history poll backstop for a prompt.
     * The direct renderer→Pod terminal WS has no app-side keepalive, so RunPod's
     * edge proxy reaps it idle during long sampling stretches and the terminal
     * `execution_success` (broadcast=False, not replayed) is lost. The reconnect
     * reconcile is one-shot and bails if it fires while the gen is still mid-stage,
     * never re-arming — so a gen that finishes AFTER that single poll hangs forever
     * even though the Pod is done. This interval re-runs `_reconcileFromHistory`
     * until the resolver is consumed (by ANY path — live terminal, reconnect, or
     * this poll). Idempotent: `_reconcileFromHistory` no-ops once settled.
     * @param {string} promptId
     * @private
     */
    _startHistoryPoll(promptId) {
        if (this._alwaysLocal || !remoteEngineClient.isRemote()) return;
        if (this._historyPollTimers.has(promptId)) return;
        const timer = setInterval(() => {
            // Settled by another path → stop polling.
            if (!this._promptResolvers.has(promptId)) { this._stopHistoryPoll(promptId); return; }
            this._reconcileFromHistory(promptId, 'poll');
        }, this._HISTORY_POLL_MS);
        this._historyPollTimers.set(promptId, timer);
    },

    /** Stop the remote /history poll backstop for a prompt (idempotent). @param {string} promptId @private */
    _stopHistoryPoll(promptId) {
        const timer = this._historyPollTimers.get(promptId);
        if (timer) { clearInterval(timer); this._historyPollTimers.delete(promptId); }
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
     * @param {{ beforePromptSubmit?: ((ctx: { serverReady: { ready: boolean, remoteComfyRestarted: boolean }, workflow: object, params: object }) => Promise<void>|void) }=} [opts]
     * @returns {Promise<{success: boolean, images: string[]}>}
     */
    async runWorkflow(workflowOrId, params = {}, onMessage = null, opts = {}) {
        // MPI-74 P6: engine selection now happens at the CALL SITE — the dispatch
        // path picks getEngine(forceLocal) and calls .runWorkflow on it. So `this`
        // is already the correct engine; `this._alwaysLocal` drives all routing.
        const serverReady = await this.ensureServerRunning(opts);

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
            // MPI-116: node-naming-law load-time check. Capture nodes carry a
            // reserved/`Output_*` title; without one, the run reports "no output
            // returned". Warn (no hard fail) so an authoring slip surfaces in the
            // log instead of as a silent dead generation. ponytail: capture-node
            // presence is the only unambiguous violation; bare legacy input titles
            // (Positive/Seed/...) are valid by design, so we don't flag those.
            const _hasCapture = Object.values(workflow).some(n => {
                const t = (n?._meta?.title || '').toLowerCase();
                return t === 'output' || t.startsWith('output_') || t === 'preview' || t === 'detected';
            });
            if (!_hasCapture) {
                clientLogger.warn('comfy', `Workflow "${file}" has no capture node (Output / Output_* / Preview / Detected) — run will report no output. Node naming law: every workflow needs a capture node.`);
            }
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
                    // VHS LoadVideo/LoadAudio nodes resolve against the input dir. A
                    // local-pinned engine keeps the local path.
                    params[paramKey] = (!this._alwaysLocal && remoteEngineClient.isRemote())
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
                    // A deleted input source (e.g. the reused frame's content asset
                    // was removed by the manual Cleanup command, or the source is
                    // otherwise gone — the upload is lazy at dispatch, so the
                    // /project-file source 404s here). Tag it with a code so
                    // commandExecutor surfaces a WARNING TOAST (user-actionable), not
                    // the GitHub bug-reporter dialog (MPI-227 downgrade of MPI-225's
                    // soft-fail). Shared path → covers local AND remote engines.
                    if (
                        typeof val === 'string' &&
                        val.includes('project-file') &&
                        /HTTP 404/.test(e.message || '')
                    ) {
                        const softErr = new Error('Cannot reuse — prompt assets no longer exist. Re-add the input and try again.');
                        softErr.code = 'input_asset_deleted';
                        throw softErr;
                    }
                    throw e;
                }
            }
        }

        // 2b. Remote engine: auto-upload any selected LoRA/upscale model that is
        // present LOCALLY but not yet on the Pod volume, mirroring the input-asset
        // upload above. The model dropdowns list LOCAL folders (the user keeps
        // weights local, not in the cloud — MPI-82), but a remote generation
        // resolves them from the Pod's MODELS_DIR by basename. So before /prompt we
        // upload the file once, then rewrite the param value to its basename to match
        // the flat Pod loader enum (MPI-229 — a subfoldered local value like
        // 'CHROMA/Rossifi.safetensors' would fail value_not_in_list against the flat
        // Pod list). The rewrite happens inside _uploadRemoteModels on this same
        // `params` object, before the injection loop below reads it.
        //
        // GATE: remote engine + remote-connected. A local-pinned engine (MPI-74)
        // takes the LOCAL ComfyUI path — the model is already on local disk and
        // there is no Pod to upload to, so it must skip this entirely.
        if (!this._alwaysLocal && remoteEngineClient.isRemote()) {
            await this._uploadRemoteModels(params);
        }

        // Defensive: Preview_Only param requested but workflow lacks the boolean
        // node. Op contract guarantees presence on multi-stage workflows; this
        // catches the genuinely node-less case (e.g. the _stage2 sibling, which
        // has no preview node). The node was re-authored to the tier-2 title
        // `Input_Preview_Only` (MPI-127), and _buildParams dual-emits both keys,
        // so accept EITHER title — else the check false-fires on every stage-1 gen
        // and strips the (already-injected) preview boolean. Strip both keys so
        // injection does not no-op silently and the run proceeds as full generation.
        if (params.Preview_Only !== undefined || params.Input_Preview_Only !== undefined) {
            const hasNode = Object.values(workflow).some(n => {
                const t = (n?._meta?.title || '').toLowerCase();
                return t === 'preview_only' || t === 'input_preview_only';
            });
            if (!hasNode) {
                clientLogger.warn('comfy', 'Preview_Only requested but workflow has no matching node — running full generation');
                delete params.Preview_Only;
                delete params.Input_Preview_Only;
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
                'denoise', 'seed', 'noise_seed', 'video', 'audio', 'latent', 'select'
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
                // Special handling for LoRA objects (Lora_1..6, or the tier-2 alias
                // Input_Lora_1..6 emitted by the MPI-127 alias pass). Without the
                // optional Input_ prefix, flat-lora models whose workflow nodes are
                // titled Input_Lora_N (Chroma, LTX) fall to _inject, which writes the
                // whole {lora_name,…} object into node.inputs.lora_name → ComfyUI
                // "Value not in list: lora_name: {dict}" 400. (MPI-219)
                if (/^(?:Input_)?Lora_(?:[A-Za-z]+_)?\d+$/i.test(key) && typeof val === 'object' && val !== null &&
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

        // 3b. Heal path-bearing loader values to the '/' separator. BAKED workflow
        // values (lora_name 'LTX2.3\\x', upscale_model, etc.) ship hardcoded in the
        // workflow JSON with Windows backslashes and NEVER pass through the dropdown
        // heal (/comfy/list-files → toEngineSep) — they're injected straight into
        // /prompt. Any engine whose loader enum uses '/' (remote Linux Pod, OR a
        // LOCAL engine on Linux/macOS portable builds) fails ComfyUI
        // value_not_in_list on a backslash value. Windows-local is skipped: its
        // ComfyUI lists with '\\', so backslashes already match — flipping them
        // would BREAK local. (MPI-141 remote; MPI-198 local Linux/macOS)
        const PATH_INPUTS = ['lora_name', 'upscale_model', 'ckpt_name', 'unet_name', 'model_name', 'vae_name', 'clip_name'];
        const _healToSlash = _needsPathHeal(this._alwaysLocal);
        // MPI-246: some nodes build their own enum with hardcoded '/' regardless of
        // OS — Impact Pack's UltralyticsDetectorProvider lists 'bbox/face_yolov8n.pt'
        // with a forward slash on Windows too. The Windows-local '/'→'\\' heal below
        // corrupts that into 'bbox\\face_yolov8n.pt' → value_not_in_list. Exclude
        // model_name for these node types (harmless in the '\\'→'/' direction too,
        // their value never has backslashes). folder_paths-backed loaders
        // (UpscaleModelLoader, SAMLoader, etc.) still get the OS-separator heal.
        const SLASH_ONLY_NODE_TYPES = new Set(['UltralyticsDetectorProvider']);
        // Windows-local: the inverse. A user LoRA name persisted during a Pod
        // (Linux) session carries '/', but this engine's ComfyUI lists with '\\'
        // → value_not_in_list on reuse. Flip '/'→'\\' so the separator matches the
        // target engine regardless of which engine saved the value. (MPI-229)
        for (const node of Object.values(workflow)) {
            if (!node || !node.inputs) continue;
            for (const k of PATH_INPUTS) {
                if (k === 'model_name' && SLASH_ONLY_NODE_TYPES.has(node.class_type)) continue;
                const v = node.inputs[k];
                if (typeof v !== 'string') continue;
                if (_healToSlash) {
                    if (v.includes('\\')) node.inputs[k] = v.replace(/\\/g, '/');
                } else if (v.includes('/')) {
                    node.inputs[k] = v.replace(/\//g, '\\');
                }
            }
        }

        // 4. Execution
        return new Promise(async (resolve, reject) => {
            const outputs = [];
            let promptId = null;
            let _terminalSafetyTimer = null;   // MPI-156: remote broadcast=False terminal safety net
            const internalListener = (msg) => {
                if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
                    if (onMessage) onMessage(msg);
                    return;
                }

                if (onMessage) onMessage(msg);

                if (msg.type === 'executed') {
                    const nodeOutput = msg.data.output;
                    _collectComfyOutputUrls(this.httpBase(), nodeOutput, outputs);
                    // MPI-156 safety net: on REMOTE, the terminal `execution_success`
                    // is broadcast=False and is NOT replayed, so if it never reaches
                    // the proxied WS (no reconnect to trigger the onopen reconcile)
                    // the gen hangs forever even though outputs already arrived. Arm a
                    // debounced /wrapper/history poll after the last `executed`; the
                    // terminal/error paths clear it. Idempotent: _reconcileFromHistory
                    // no-ops if the resolver was already consumed by a live terminal.
                    if (!this._alwaysLocal && remoteEngineClient.isRemote() && promptId) {
                        if (_terminalSafetyTimer) clearTimeout(_terminalSafetyTimer);
                        const pid = promptId;
                        _terminalSafetyTimer = setTimeout(() => {
                            this._reconcileFromHistory(pid);
                        }, 4000);
                    }
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
                    if (_terminalSafetyTimer) { clearTimeout(_terminalSafetyTimer); _terminalSafetyTimer = null; }
                    const d = msg.data || {};
                    const nodeType = d.node_type || d.class_type || 'a node';
                    const exc = d.exception_type ? `${d.exception_type}: ` : '';
                    const detail = d.exception_message || 'unknown error';
                    if (promptId) {
                        this._stopHistoryPoll(promptId);
                        this._promptListeners.delete(promptId);
                        this._promptRejectors.delete(promptId);
                        this._promptResolvers.delete(promptId);
                    }
                    if (this._activePromptId === promptId) this._activePromptId = null;
                    this._isRunning = this._promptListeners.size > 0;
                    reject(new Error(`${nodeType} failed: ${exc}${detail}`));
                    return;
                }

                // Terminal completion. ComfyUI signals "queue item done" two
                // different ways across versions:
                //   • <=0.25.1: `executing` with `node === null` (the sentinel).
                //   • 0.26.0+ : a dedicated `execution_success` message; the old
                //     `executing node===null` sentinel is NO LONGER sent
                //     (execution.py:815). Listening only for the sentinel left the
                //     generation Promise hung forever on 0.26 — the asset arrived
                //     (via `executed`, still sent) but the job never settled, so the
                //     app sat in "STARTING" (MPI-139 v0.26 floor regression).
                // Accept BOTH so the resolve is engine-version-agnostic. `executed`
                // events (above) have already populated `outputs` by the time either
                // terminal arrives.
                const isTerminalDone =
                    (msg.type === 'executing' && msg.data?.node === null) ||
                    msg.type === 'execution_success';
                if (isTerminalDone) {
                    if (_terminalSafetyTimer) { clearTimeout(_terminalSafetyTimer); _terminalSafetyTimer = null; }
                    if (promptId) {
                        this._stopHistoryPoll(promptId);
                        this._promptListeners.delete(promptId);
                        this._promptRejectors.delete(promptId);
                        this._promptResolvers.delete(promptId);
                    }
                    if (this._activePromptId === promptId) this._activePromptId = null;
                    this._isRunning = this._promptListeners.size > 0;
                    resolve({ success: true, images: outputs });
                }
            };

            this.connect();
            this._isRunning = true;

            try {
                if (typeof opts.beforePromptSubmit === 'function') {
                    await opts.beforePromptSubmit({ serverReady, workflow, params });
                }
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
                    let nodeErrorLora = null;
                    try {
                        const errData = await req.json();
                        // The wrapper's 503 shape puts a STRING in `error`; ComfyUI's own
                        // 400 puts an OBJECT there ({type,message,details}). Only take the
                        // string form as a code, or `errCode` becomes an object and every
                        // `errCode === '...'` check below silently fails.
                        errCode = typeof errData?.error === 'string' ? errData.error : null;
                        errMsg = errData?.message || errData?.error?.message || errMsg;
                        comfyBody = errData?.detail?.comfy_body || null;
                        // LOCAL ComfyUI rejects a bad enum with 400 {error, node_errors}
                        // (server.py). The offending filename lives ONLY in
                        // node_errors[id].errors[].extra_info.received_value — the
                        // top-level `error.details` is '' whenever some other output
                        // still validated. Reading it here is what lets the missing-LoRA
                        // case below resolve on the local engine, not just remote.
                        nodeErrorLora = _findNodeErrorLora(errData?.node_errors);
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
                    // MPI-90: incompatible-Pod pre-check block (409). Expected +
                    // user-actionable ("update the app / reinitialize") → a warning
                    // toast, not the bug-reporter dialog.
                    if (req.status === 409 && errCode === 'manifest_schema_incompatible') err.code = 'pod_incompatible';
                    // MPI-229: a LoRA genuinely absent on the Pod → ComfyUI
                    // value_not_in_list on lora_name. After the basename-rewrite
                    // above the only remaining cause is a not-uploaded LoRA — a
                    // user-actionable warning toast, not the bug-reporter dialog.
                    //
                    // Two carriers for the SAME ComfyUI rejection, one per engine:
                    //  - remote: the wrapper folds ComfyUI's text into `detail.comfy_body`
                    //    → scrape the name out of the message.
                    //  - local:  ComfyUI answers directly with `node_errors` → read the
                    //    structured `received_value` (no regex, no '' details trap).
                    // Missing the local carrier is what sent a bare 400 to the
                    // bug-reporter dialog instead of the missing-LoRA toast.
                    const loraMiss = /value not in list:\s*lora_name:\s*'([^']+)'/i.exec(comfyBody || errMsg);
                    const missingLora = nodeErrorLora || (loraMiss ? loraMiss[1] : null);
                    if (missingLora) {
                        // `node_errors` only ever comes from a direct ComfyUI reply (local);
                        // `comfy_body` only ever comes from the Pod wrapper (remote).
                        err.code = nodeErrorLora ? 'lora_missing_local' : 'lora_missing_remote';
                        err.loraName = String(missingLora).split(/[\\/]/).pop();
                    }
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
                    // Register a resolve hook so a MISSED terminal event (lost during
                    // a reconnect blip — terminal events are broadcast=False + not
                    // replayed) can be settled from `/history` by `_reconcileFromHistory`
                    // (MPI-152).
                    this._promptResolvers.set(promptId, resolve);
                    // REMOTE backstop: poll /history for the whole gen lifetime in
                    // case the direct terminal WS is reaped and its terminal event
                    // is lost (see _startHistoryPoll). Local relies on the WS only.
                    this._startHistoryPoll(promptId);
                    if (onMessage) onMessage({ type: 'prompt_ack', prompt_id: promptId });
                    const pending = this._pendingPromptMessages.get(promptId) || [];
                    this._pendingPromptMessages.delete(promptId);
                    for (const msg of pending) internalListener(msg);
                }
            } catch (err) {
                if (promptId) {
                    this._stopHistoryPoll(promptId);
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
     * Uploads an image or mask asset to THIS engine's ComfyUI server.
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
     * Express → wrapper and returns the ABSOLUTE Pod path for the workflow node.
     * Remote-mode only. The Express route reads the local file server-side
     * (the renderer cannot stream an absolute fs path as a blob) and lands it on
     * the volume. The split video/audio workflows feed this value through an
     * `MpiString` node into `VHS_LoadVideoPath`, which resolves a literal path —
     * NOT a bare basename against `--input-directory` — so the full Pod path
     * (`/workspace/comfyui/input/<name>`) is injected, not the basename.
     * @param {string} localPath  Absolute local path from `_resolveMediaPath`.
     * @returns {Promise<string>} The absolute Pod path to inject into the workflow.
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
        // Prefer the absolute Pod path (VHS_LoadVideoPath needs it); fall back to
        // the basename only if an older wrapper/route omits `path`.
        return data.path || data.name || filename;
    },

    /**
     * Remote engine: ensure every LoRA/upscale model referenced by `params` exists
     * on the Pod volume, auto-uploading from the user's LOCAL folders any that are
     * missing. The user keeps weights local (MPI-82), so the dropdowns list local
     * files; a remote run resolves them from MODELS_DIR by basename. For each
     * distinct model we ask the Pod (presence check) and upload only when absent —
     * a multi-GB weight must NOT re-transfer every generation.
     *
     * PARAM REWRITE (MPI-229): the upload lands the file FLAT on the Pod volume
     * (`remoteUploadModel` → `MODELS_DIR/<type>/<basename>`), and the presence check
     * is basename-only, so every remote-referenced model ends up flat there and
     * ComfyUI lists it flat. But `params` still carries the LOCAL value, which may be
     * subfoldered (`CHROMA/Rossifi-Ds5-E309.safetensors` from the user's local loras
     * subfolder). Injecting that subfoldered value into a flat Pod enum fails
     * ComfyUI `value_not_in_list`. So after ensuring presence we rewrite the model
     * value in `params` to its basename, matching the flat Pod layout. Local runs
     * never call this (they resolve the real subfoldered path off local disk).
     *
     * GATING: the upload hits the NEW wrapper endpoint /wrapper/models/upload that
     * ships in a Pod-image rebuild (MPI-81). Against an older image it 404s and the
     * server route surfaces a clean failure — caught here as a warning toast so the
     * generation fails loudly (the old SILENT no-output bug is what this card fixes)
     * rather than dying mute on the Pod. The presence check (/wrapper/models/status)
     * works on TODAY's image, so on an un-rebuilt Pod a missing model is detected and
     * the user is told, instead of a cryptic mid-generation failure.
     * @param {Record<string, any>} params  built workflow params (LoRA objs + Upscale_Model)
     * @private
     */
    async _uploadRemoteModels(params) {
        // Collect distinct { type, name } the workflow references.
        const wanted = [];
        const seen = new Set();
        const add = (type, name) => {
            if (!name || typeof name !== 'string') return;
            const key = `${type}::${name}`;
            if (seen.has(key)) return;
            seen.add(key);
            wanted.push({ type, name });
        };
        for (const value of Object.values(params || {})) {
            if (value && typeof value === 'object' && value.lora_name) add('loras', value.lora_name);
        }
        if (params.Upscale_Model) add('upscale_models', params.Upscale_Model);
        if (!wanted.length) return;

        // MPI-229: the Pod stores every uploaded model FLAT (basename), so rewrite the
        // param values to their basename to match the flat Pod loader enum. Doing this
        // up front (independent of the presence/upload result below) heals a value that
        // was already flat-present on the Pod from a prior run too.
        const _base = (n) => String(n).split(/[\\/]/).pop();
        for (const value of Object.values(params || {})) {
            if (value && typeof value === 'object' && value.lora_name) value.lora_name = _base(value.lora_name);
        }
        if (params.Upscale_Model) params.Upscale_Model = _base(params.Upscale_Model);

        for (const { type, name } of wanted) {
            const base = String(name).split(/[\\/]/).pop();
            // 1. Skip if the Pod already has it (works on today's image).
            let present = false;
            try {
                const pres = await fetch('/remote/model-present', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, filename: base }),
                });
                const pjson = await pres.json().catch(() => null);
                present = Boolean(pjson?.present);
            } catch (_) {
                present = false; // unknown → attempt upload
            }
            if (present) continue;

            // 2. Upload the local file to the Pod volume. The renderer only has the
            // filename; the server resolves the absolute local path from the model
            // folders and streams it to the wrapper.
            Events.emit('ui:info', { message: `Uploading "${base}" to the cloud — generation will start once it's ready…` });
            const res = await fetch('/remote/upload/model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, filename: name }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                // Loud, user-actionable failure (NOT the silent no-output bug). On an
                // un-rebuilt Pod the upload endpoint 404s → surfaces here.
                const msg = data?.message || `HTTP ${res.status}`;
                clientLogger.error('comfy', `Remote model upload failed for ${base}: ${msg}`);
                throw new Error(`Could not upload "${base}" to the cloud engine (${msg}). It may not be available on this Pod image yet.`);
            }
        }
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
}

// ── Two engine instances (MPI-74 P6) ─────────────────────────────────────────
// `remoteEngine` resolves remote-or-local via `remoteEngineClient` (the historical
// singleton behavior); `localEngine` is pinned to local ComfyUI always. Each owns
// its own socket + clientId so both can run concurrently.
export const remoteEngine = createEngine({ engine: 'remote', alwaysLocal: false });
export const localEngine  = createEngine({ engine: 'local',  alwaysLocal: true });

/**
 * Resolves the engine instance for a dispatch. `forceLocal` (the MPI-74 per-gen
 * "Run locally" toggle) picks the local-pinned engine; otherwise the remote
 * engine (which itself falls to local when no Pod is connected).
 * @param {boolean} [forceLocal=false]
 * @returns {ReturnType<typeof createEngine>}
 */
export function getEngine(forceLocal = false) {
    return forceLocal ? localEngine : remoteEngine;
}

// Back-compat default export: the boot/Settings connect gates (shell.js,
// MpiSettings) and `interrupt()` callers historically used a single
// `ComfyUIController`. Alias it to `remoteEngine`, which preserves the old
// remote-or-local resolution exactly.
export const ComfyUIController = remoteEngine;
