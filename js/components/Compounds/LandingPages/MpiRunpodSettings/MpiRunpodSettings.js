import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { mountPodDiskBar } from '../../../../services/podDiskBar.js';
import { MpiOkCancel } from '../../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModal } from '../../../Primitives/MpiModal/MpiModal.js';
import { state } from '../../../../state.js';
import { Events } from '../../../../events.js';
import { Storage } from '../../../../core/storage.js';
import { secretsClient } from '../../../../core/secretsClient.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { ce, qs } from '../../../../utils/dom.js';
import { isStockRefusal } from '../../../../utils/runpodErrorClassify.js';
import { APP_CONFIG } from '../../../../../dev_configs/app_config.js';

/**
 * MpiRunpodSettings — the RunPod Remote Engine section of the Settings panel.
 *
 * Extracted verbatim from MpiSettings.js (MPI-177). DOM ids and the
 * mpi-settings__runpod-* class names are kept unchanged so the extraction is
 * pure code motion; section chrome (.mpi-settings__section) still comes from
 * MpiSettings.css. Mounted once by MpiSettings into #mpiSettingsRunpodMount;
 * MpiSettings forwards el.onOpen() on each panel open.
 */
export const MpiRunpodSettings = ComponentFactory.create({
    name: 'MpiRunpodSettings',
    css: ['js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.css'],

    template: () => `
                <div class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">RunPod Remote Engine</h3>
                    <div class="mpi-settings__runpod-referral">
                        <div class="mpi-settings__runpod-referral-copy">
                            <span class="mpi-settings__runpod-referral-kicker">New to RunPod?</span>
                            <span class="mpi-settings__runpod-referral-text">Create an account with Cubric's referral link. You can get a $5 credit bonus after signing up and adding $10 for the first time, and Cubric receives referral credit too.</span>
                        </div>
                        <a class="mpi-settings__runpod-referral-link" href="https://runpod.io?ref=slmzn8qv" target="_blank" rel="noopener noreferrer">Create RunPod account</a>
                    </div>

                    <div class="mpi-settings__subgroup">
                        <span class="mpi-settings__subgroup-title">Account</span>
                        <span class="mpi-settings__hint">Cubric's remote engine runs on your own RunPod account. Generation stays on your local engine until you Connect — GPU and storage billing happen on your RunPod account, your responsibility, not Cubric's.</span>
                        <span class="mpi-settings__hint">To unlock the RunPod controls, save a RunPod API key with read + write access in the box below.</span>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">RunPod API key</label>
                            <div class="mpi-settings__folder-row">
                                <div id="mpiSettingsRunpodKeySlot" class="mpi-settings__folder-input"></div>
                                <div id="mpiSettingsRunpodKeySaveSlot"></div>
                                <div id="mpiSettingsRunpodKeyClearSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodKeyStatus"></span>
                        </div>
                    </div>

                    <div class="mpi-settings__plate" id="mpiSettingsRunpodAutoConnectGroup">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Automatically connect on app start</span>
                            <span class="mpi-settings__plate-desc">When on, the app connects (and starts billing) a Pod at launch. Off by default — start local, Connect when you want cloud generation.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsRunpodAutoConnectSlot"></div>
                    </div>

                    <div class="mpi-settings__plate" id="mpiSettingsRunpodAutoRetryGroup">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Auto-retry connection</span>
                            <span class="mpi-settings__plate-desc">Pick a GPU even if it's out of stock — Connect keeps checking until it frees, then connects. You can keep working locally while it waits.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsRunpodAutoRetrySlot"></div>
                    </div>

                    <div class="mpi-settings__plate" id="mpiSettingsRunpodStageOnConnectGroup">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Stage all models on connect</span>
                            <span class="mpi-settings__plate-desc">When on, every installed model is copied to the Pod's fast disk as soon as it connects, so the first generation is instant. Off by default — models are staged on first use instead, copying only what you actually generate with.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsRunpodStageOnConnectSlot"></div>
                    </div>

                    <div class="mpi-settings__runpod-body" id="mpiSettingsRunpodBody">
                        <div class="mpi-settings__subgroup">
                            <span class="mpi-settings__subgroup-title">Storage</span>
                            <div class="mpi-settings__form-group">
                                <label class="mpi-settings__field-label">Data Center</label>
                                <div id="mpiSettingsRunpodDcSlot"></div>
                                <span class="mpi-settings__hint">A network volume is locked to one data center. Switching later means deleting the volume and re-downloading models.</span>
                            </div>
                            <div class="mpi-settings__form-group">
                                <label class="mpi-settings__field-label">Network Volume</label>
                                <div id="mpiSettingsRunpodVolumeSlot"></div>
                                <span class="mpi-settings__hint">Stores your models so they survive between Pods — one volume per data center. Stopped Pods keep billing volume storage until you delete it.</span>
                            </div>
                        </div>

                        <div class="mpi-settings__subgroup">
                            <span class="mpi-settings__subgroup-title">Machine</span>
                            <div class="mpi-settings__form-group">
                                <label class="mpi-settings__field-label">GPU</label>
                                <div id="mpiSettingsRunpodGpuSlot"></div>
                                <span class="mpi-settings__hint">Secure Cloud only (Community Cloud unsupported). Stock is a live hint — availability drifts; the RunPod console is ground truth.</span>
                                <div id="mpiSettingsRunpodMinRamSlot"></div>
                            </div>
                        </div>

                        <div class="mpi-settings__subgroup mpi-settings__subgroup--connect">
                            <div class="mpi-settings__runpod-connect-row">
                                <span class="mpi-settings__runpod-status" id="mpiSettingsRunpodEngineStatus">Remote engine: —</span>
                                <div id="mpiSettingsRunpodConnectSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodConnectHint"></span>
                            <a class="mpi-settings__runpod-console-link" id="mpiSettingsRunpodConsoleLink" href="https://console.runpod.io/pods" target="_blank" rel="noopener noreferrer">Open in RunPod console</a>
                            <span class="mpi-settings__hint">Check Pod state, telemetry, logs, and spend on RunPod. Opens the active Pod when connected, otherwise your Pods list.</span>
                            ${APP_CONFIG.dev_mode ? `
                            <a class="mpi-settings__runpod-console-link" id="mpiSettingsRunpodComfyLink" href="#" target="_blank" rel="noopener noreferrer" hidden>Open ComfyUI (dev)</a>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodComfyHint" hidden>Dev-only: opens the Pod's raw ComfyUI web UI (no auth). Available once the engine is ready.</span>` : ''}
                        </div>

                        <div class="mpi-settings__plate" id="mpiSettingsRunpodDeleteOnQuitPlate">
                            <div class="mpi-settings__plate-main">
                                <span class="mpi-settings__plate-label">Delete Pod on quit</span>
                                <span class="mpi-settings__plate-desc">When on, quitting the app deletes the Pod instead of keeping it warm. Frees GPU and container disk fully; your network volume and models are kept.</span>
                            </div>
                            <div class="mpi-settings__plate-ctrl" id="mpiSettingsRunpodDeleteOnQuitSlot"></div>
                        </div>
                    </div>
                </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];

        // Called by MpiSettings each time the slide-over opens — re-init with fresh values.
        el.onOpen = () => _initRunpodSection(el);

        // ── RunPod Remote Engine section ────────────────────────────────────
        // Non-secret prefs live in state.runpodConfig (localStorage-mirrored);
        // the API key is write-only through secretsClient (secrets:* IPC).

        let _runpodAvailability = null; // { gpuTypes, dataCenters } cache per panel open
        let _runpodVolumes = null;      // network volumes from the user's account, or null
        let _engineConnectInst = null;  // Connect/Disconnect MpiButton instance
        let _engineStatusTimer = null;  // setInterval id for the status poll
        let _podDiskBar = null;         // MPI-237: shared Pod disk-usage bar (volume OR ephemeral)
        let _engineBusy = false;        // true while a start/stop is in flight
        let _connectAbort = false;      // MPI-86: set by Cancel to break the in-flight connect poll
        let _destroyAborted = false;    // MPI-278: set by destroy() (panel close) — the connect is
                                        // NOT cancelled (Pod left booting, shell feed owns it), so the
                                        // finally must NOT emit local · offline and strand the connect.
        // MPI-110: the auto-retry wait LOOP lives in the shell (survives navigating
        // away from Settings); the panel reads `state.remoteWaitGpu` to know if one
        // is active. `_isWaiting()` is the single source of truth here.
        const _isWaiting = () => !!state.remoteWaitGpu;
        let _engineBtnLabel = 'Connect'; // tracks the button label (instance has no props getter)

        // MpiButton imperative API lives on the instance's `.el`, not the
        // instance itself (rule: callers use el.setLabel/el.setDisabled).
        function _engineBtnLabelSet(label) {
            _engineBtnLabel = label;
            _engineConnectInst?.el?.setLabel?.(label);
        }
        function _engineBtnDisabled(disabled) {
            _engineConnectInst?.el?.setDisabled?.(disabled);
        }

        function _runpodCfg() {
            return { ...(state.runpodConfig || {}) };
        }

        function _findRunpodVolume(volumeId) {
            if (!volumeId || !Array.isArray(_runpodVolumes)) return null;
            return _runpodVolumes.find(v => v?.id === volumeId) || null;
        }

        // The cubric-vision volume living in `dcId`, if any (one volume per DC).
        function _volumeForDc(dcId) {
            if (!dcId || !Array.isArray(_runpodVolumes)) return null;
            return _runpodVolumes.find(v => v?.dataCenterId === dcId) || null;
        }

        // Pull the human-readable error RunPod returns ({ error, status }) so the
        // user sees the real reason (e.g. a volume still attached to a Pod) instead
        // of a bare status code.
        function _runpodErrText(data, status) {
            const raw = (data && (data.error || data.message)) || '';
            if (/attached|in use|in-use|nonexistent/i.test(raw)) {
                return `${raw} — a network volume cannot be deleted while it is attached to a Pod. Delete the Pod first.`;
            }
            return raw || `RunPod refused the request (${status}).`;
        }

        // Re-fetch the account's network volumes into the cache. Shape is handled
        // defensively (array | .networkVolumes | .volumes) — same as initial load.
        async function _reloadRunpodVolumes() {
            try {
                const res = await fetch('/runpod/volumes');
                const data = res.ok ? await res.json() : null;
                const list = Array.isArray(data) ? data : (data?.networkVolumes || data?.volumes || null);
                _runpodVolumes = Array.isArray(list) ? list : null;
            } catch (_) {
                _runpodVolumes = null;
            }
        }

        async function _pushRemoteMode(cfg) {
            try {
                // Step 4.2: enabling remote mode no longer needs a podId — the Pod
                // is created on Connect. Pass podId only if one is already live.
                const body = cfg.enabled
                    ? (cfg.podId ? { active: true, podId: cfg.podId } : { active: true })
                    : { active: false };
                // Carry the delete-on-quit pref so the backend quit-teardown route
                // can choose stop vs delete (main.js can't read renderer state).
                body.deleteOnQuit = cfg.deleteOnQuit === true;
                await fetch('/remote/mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] remote mode sync failed', err);
            }
        }

        function _setRunpodStatus(root, text) {
            const status = qs('#mpiSettingsRunpodKeyStatus', root);
            if (status) status.textContent = text || '';
        }

        // ── Remote engine Connect / Disconnect (Step 4.2) ───────────────────
        // Connect CREATES a fresh Pod on the SELECTED GPU (volume + DC) — no
        // host-pinned resume — and Disconnect DELETES it (GPU billing ends, the
        // volume persists). Connect is blocked until a GPU is picked.

        function _setEngineStatusText(root, text) {
            const el = qs('#mpiSettingsRunpodEngineStatus', root);
            if (el) el.textContent = `Remote engine: ${text}`;
        }

        function _setEngineHint(root, text, isWarn = false) {
            const el = qs('#mpiSettingsRunpodConnectHint', root);
            if (!el) return;
            el.textContent = text || '';
            el.classList.toggle('mpi-settings__hint--warn', !!isWarn);
        }

        // Point the console link at the live Pod when one is active (telemetry/logs
        // tab is where the user looks), else the static Pods list so they can still
        // spot/kill an orphan or stalled Pod. podId is the renderer-side app-managed id.
        function _setConsoleLinkHref(root) {
            const a = qs('#mpiSettingsRunpodConsoleLink', root);
            if (!a) return;
            const podId = _runpodCfg().podId;
            a.href = podId
                ? `https://console.runpod.io/pods?id=${encodeURIComponent(podId)}`
                : 'https://console.runpod.io/pods';
        }

        // MPI-203 (dev_mode only): point the "Open ComfyUI" link at the live Pod's
        // raw ComfyUI web UI (RunPod proxy on 8188, exposed dev-side by
        // remotePodLifecycle.js). Shown only when the engine is READY — the port
        // isn't reachable before the Pod boots. Hidden otherwise. Element only
        // exists in dev builds (template gate), so bail early on release.
        function _setComfyLink(root, ready) {
            const a = qs('#mpiSettingsRunpodComfyLink', root);
            const hint = qs('#mpiSettingsRunpodComfyHint', root);
            if (!a) return; // release build — link not rendered
            const podId = _runpodCfg().podId;
            const show = !!(ready && podId);
            if (show) a.href = `https://${podId}-8188.proxy.runpod.net`;
            a.hidden = !show;
            if (hint) hint.hidden = !show;
        }

        // Reflect the latest known status on the button + label. `status` is the
        // /remote/comfy/status shape ({ running, ready }) or null when we have
        // not polled yet. Connect requires a picked GPU; once a Pod is running it
        // tracks the live readiness so the label flips to Disconnect.
        function _applyEngineStatus(root, status) {
            if (!_engineConnectInst) return;
            const cfg = _runpodCfg();
            _setConsoleLinkHref(root);
            _setComfyLink(root, !!(status && status.ready)); // MPI-203 dev-only door
            if (!cfg.enabled) {
                _setEngineStatusText(root, 'disabled');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(true);
                return;
            }
            if (_engineBusy) return; // a create/delete is mid-flight in THIS panel; leave the label alone
            // MPI-110: a shell-owned auto-retry wait is live (possibly started before
            // this panel mounted, or while it was closed) — surface waiting…/Cancel so
            // the panel reflects reality. No Pod exists yet; the create begins when the
            // GPU frees. Takes priority over the status shape (which is still local).
            if (_isWaiting()) {
                _applyWaitState(root, state.remoteWaitGpu || cfg.gpuType || 'the selected GPU');
                return;
            }
            const ready = !!(status && status.ready);
            const running = !!(status && status.running);
            const connecting = !!(status && status.connecting);
            // A create/reconnect started elsewhere (or before this panel remounted)
            // — the backend's _connecting flag survives a panel close/reopen, AND an
            // auto-connect-on-start boot (shell.js _initRemoteBoot) connects with no
            // panel involvement at all. Honour it by surfacing an ENABLED Cancel (not
            // a dead Connect): _cancelConnect deletes the active Pod backend-side, so
            // it aborts the boot connect just as well as a panel-started one. Without
            // this, a boot auto-connect left the user with a disabled Connect and no
            // way to stop a Pod that's already billing.
            if (connecting && !ready) {
                _setEngineStatusText(root, 'connecting…');
                _engineBtnLabelSet('Cancel');
                _engineBtnDisabled(false);
                return;
            }
            if (ready) {
                _setEngineStatusText(root, 'ready');
                _engineBtnLabelSet('Disconnect');
                _engineBtnDisabled(false);
                // MPI-88: a no-GPU "download mode" Pod is ready, but only for model
                // downloads — generation is blocked. Surface a persistent hint so
                // the user knows to switch to a GPU before generating.
                if (status && status.noGpu) {
                    _setEngineHint(root, 'Download mode (no GPU): install models, then pick a GPU and Connect to generate.');
                }
            } else if (running) {
                // MPI-135 C: Pod is running but ComfyUI not ready yet — connecting,
                // not creating (the Pod already exists). Match the hero phase.
                _setEngineStatusText(root, 'connecting…');
                _engineBtnLabelSet('Disconnect');
                _engineBtnDisabled(false);
            } else {
                // No Pod yet — Connect creates one once a GPU is picked. A volume-backed
                // Pod also needs its volume (DC-locked, persists models); an "Any region"
                // ephemeral Pod (MPI-78) needs only the GPU — the disk size has a default.
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                const needsVolume = !_isAnyRegion(cfg);
                _engineBtnDisabled(!cfg.gpuType || (needsVolume && !cfg.volumeId));
                // MPI-110: clear a stale "Waiting for…/connecting…" hint left behind when
                // a shell wait ended (won→sniped, or stopped) — otherwise the hint
                // disagrees with the "stopped"+Connect state the user sees. Only clears
                // the transient wait/connect hints, never a warning.
                const hintEl = qs('#mpiSettingsRunpodConnectHint', root);
                if (hintEl && !hintEl.classList.contains('mpi-settings__hint--warn')
                    && /Waiting for|checking every|connect the moment/i.test(hintEl.textContent || '')) {
                    _setEngineHint(root, '');
                }
            }
        }

        async function _pollEngineStatus(root) {
            const cfg = _runpodCfg();
            if (!cfg.enabled) { _applyEngineStatus(root, null); return; }
            try {
                const res = await fetch('/remote/comfy/status');
                const status = res.ok ? await res.json() : null;
                _applyEngineStatus(root, status);
            } catch (_) {
                _applyEngineStatus(root, { running: false, ready: false });
            }
        }

        // Poll /remote/comfy/status until ready or timeout. The backend returns
        // `starting` immediately after creating/resuming the Pod (no 504 on a long
        // first-image pull), so the renderer owns the wait. Fires `onSlow` once when
        // the wait crosses ~150s — the signal of a fresh image tag's first ~3 GB pull.
        // The first boot on a fresh volume/GPU arch also pays a one-time
        // sageattention compile (~5-15 min) that does not block readiness (SDPA
        // fallback) but extends the wait — hence the 20-min timeout.
        // MPI-86: `onWatchdog` fires once when the wait crosses `watchdogAfterMs`
        // (~5 min) — well past the normal first-boot sageattention compile (MPI-64
        // L3), so it only prompts "taking too long, Cancel and try another GPU"; it
        // never auto-cancels (a healthy slow boot must complete). The loop also
        // checks `_connectAbort` each tick so the Cancel button can break it.
        async function _pollEngineReady(onSlow, onWatchdog, onNotRunning, onMaintenance, { timeoutMs = 1200000, intervalMs = 4000, slowAfterMs = 150000, watchdogAfterMs = 300000, notRunningGraceMs = 30000 } = {}) {
            const start = Date.now();
            let slowFired = false;
            let watchdogFired = false;
            // MPI-87: elapsed→% estimate (RunPod's API has no real image-pull
            // progress); heroStats paints it in the project-page GPU slot while
            // connecting. ~4 min covers a fresh ~3 GB image pull; clamp 0–99 until
            // ready, then 100. Mirrors _connectPct in shell.js.
            const _pct = (ms) => Math.max(0, Math.min(99, Math.round((ms / 240000) * 100)));
            // MPI-96: RunPod can accept createPod (201) but never start the container
            // on the host — the Pod sits EXITED/TERMINATED while the wrapper /health
            // stays silent, so the old loop crawled to 99% on a Pod that isn't
            // running. The status route now reports the Pod's runtime status; a
            // terminal not-running status past a short grace = a dead host, not a
            // slow boot, so bail early instead of faking progress.
            const _NOT_RUNNING = new Set(['EXITED', 'TERMINATED', 'DEAD']);
            while (Date.now() - start < timeoutMs) {
                if (_connectAbort) return false; // MPI-86: Cancel pressed — stop polling
                if (!slowFired && Date.now() - start >= slowAfterMs) {
                    slowFired = true;
                    try { onSlow && onSlow(); } catch (_) { /* best-effort */ }
                }
                if (!watchdogFired && Date.now() - start >= watchdogAfterMs) {
                    watchdogFired = true;
                    try { onWatchdog && onWatchdog(); } catch (_) { /* best-effort */ }
                }
                Events.emit('remote:connect-progress', { pct: _pct(Date.now() - start) });
                try {
                    const res = await fetch('/remote/comfy/status');
                    const s = res.ok ? await res.json() : null;
                    if (s && s.ready) { Events.emit('remote:connect-progress', { pct: 100 }); return true; }
                    // MPI-96: Pod reports a terminal not-running status after the grace
                    // window (a normal CREATED→RUNNING transition is never flagged) —
                    // the host failed to start it. Stop the fake bar and bail.
                    if (s && s.podStatus && _NOT_RUNNING.has(String(s.podStatus).toUpperCase())
                        && Date.now() - start >= notRunningGraceMs) {
                        try { onNotRunning && onNotRunning(s.podStatus); } catch (_) { /* best-effort */ }
                        return false;
                    }
                    // MPI-135 (C): host under maintenance (draining) — it won't come
                    // ready. Bail past the grace window so the user isn't stuck until
                    // the 5-min watchdog on a doomed host.
                    if (s && s.maintenance && Date.now() - start >= notRunningGraceMs) {
                        try { onMaintenance && onMaintenance(s.maintenance); } catch (_) { /* best-effort */ }
                        return false;
                    }
                } catch (_) { /* transient during cold pull / proxy 404 window */ }
                await new Promise((r) => setTimeout(r, intervalMs));
            }
            return false;
        }

        async function _connectEngine(root) {
            const cfg = _runpodCfg();
            if (!cfg.enabled || _engineBusy) return;
            if (!cfg.gpuType) {
                _setEngineHint(root, 'Pick a GPU first.', true);
                return;
            }
            // A volume-backed Pod needs its volume; an "Any region" ephemeral Pod
            // (MPI-78) does not — models download to the sized container disk instead.
            if (!_isAnyRegion(cfg) && !cfg.volumeId) {
                _setEngineHint(root, 'Create or select a network volume first — it stores ComfyUI and your models.', true);
                return;
            }
            // MPI-110: auto-retry on + the picked GPU is out of stock right now → don't
            // attempt a doomed create. Ask the shell to wait (non-blocking, survives
            // navigating away); it kicks the create when the GPU frees. A warm saved
            // Pod (podId) resumes regardless — that's a reconnect, not a fresh grab.
            if (cfg.autoRetry === true && !cfg.podId && !_isPickedGpuInStock(cfg)) {
                _startWait(root);
                return;
            }
            _engineBusy = true;
            _connectAbort = false; // MPI-86: fresh attempt — clear any prior Cancel flag
            // MPI-86: while connecting, the button becomes an enabled "Cancel" (was
            // disabled, trapping the user when a Pod stuck initializing). Click →
            // _cancelConnect aborts the poll + deletes the half-started Pod.
            _engineBtnLabelSet('Cancel');
            _engineBtnDisabled(false);
            // MPI-73: surface the transition app-wide (hero card → "connecting ·
            // offline" with no card; status bar → "IDLE · Connecting"). Resolved by
            // the connected:true emit on success or connected:false on failure.
            Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: 'connecting' });
            // A saved podId → warm-resume (reconnect) the stopped Pod; otherwise
            // create fresh. Reconnect self-heals to delete+create if the host is
            // full or the GPU is gone (Step 4.3).
            const warm = !!cfg.podId;
            clientLogger.info('settings', `[RunPod] Connect: ${warm ? 'reconnect' : 'create'} gpu=${cfg.gpuType} dc=${cfg.datacenter || 'none'} vol=${cfg.volumeId || 'none'} podId=${cfg.podId || 'none'}`);
            _setEngineStatusText(root, warm ? 'resuming…' : 'creating…');
            _setEngineHint(root, warm
                ? 'Resuming your Pod — a warm resume is fast; if its host is full it recreates fresh.'
                : 'Creating a fresh Pod on the selected GPU — first boot can take 90–120s.');
            // sound:false — immediate feedback of pressing Connect; a click must not ring.
            Events.emit('ui:info', { message: warm ? 'Connecting to your Pod…' : 'Creating a Pod…', sound: false });
            let _connectSucceeded = false; // MPI-73: resolves the 'connecting' phase
            let _handoffToWait = false;    // MPI-110: sniped mid-create → re-enter wait loop in finally
            try {
                const endpoint = warm ? '/remote/pod/reconnect' : '/remote/pod/create';
                // MPI-78: "Any region" is a UI sentinel, not a real DC — send a null
                // datacenter so the backend auto-places, and carry the chosen ephemeral
                // container-disk size. A real DC sends its id and ignores containerDiskGb.
                const anyRegion = _isAnyRegion(cfg);
                const datacenter = anyRegion ? null : (cfg.datacenter || null);
                const volumeId = anyRegion ? null : (cfg.volumeId || null);
                const containerDiskGb = anyRegion ? _diskGbFromCfg(cfg) : undefined;
                // MPI-160: optional system-RAM floor (0/empty = no floor). Not for the
                // CPU download Pod (RunPod ignores it there).
                const minMemoryInGb = (cfg.gpuType && cfg.gpuType !== '__cpu__' && Number(cfg.minRamGb) > 0)
                    ? Number(cfg.minRamGb) : undefined;
                const body = warm
                    ? { podId: cfg.podId, gpuTypeId: cfg.gpuType, volumeId, datacenter, containerDiskGb, minMemoryInGb }
                    : { gpuTypeId: cfg.gpuType, volumeId, datacenter, containerDiskGb, minMemoryInGb };
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                clientLogger.info('settings', `[RunPod] ${endpoint} -> http ${res.status} ready=${data.ready} podId=${data.podId || 'none'} unavailable=${!!data.unavailable}`);

                // Saved GPU no longer available — the stuck Pod was deleted server-side.
                if (data.unavailable) {
                    state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
                    // MPI-110: auto-retry on → the GPU was sniped between our poll and
                    // the create. Don't dead-end; drop back into the background wait
                    // (kicked off in finally so its state survives the cleanup below).
                    if (_runpodCfg().autoRetry === true) {
                        _handoffToWait = true;
                        return;
                    }
                    _setEngineHint(root, 'Your saved GPU is unavailable right now. Pick another card and Connect again.', true);
                    _setEngineStatusText(root, 'stopped');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: 'Selected GPU unavailable — pick another.' });
                    return;
                }
                // MPI-120: host is offline — backend pre-flight blocked the connect.
                // Expected, actionable state → warning toast, not the error dialog.
                if (data.offline) {
                    _setEngineHint(root, "You're offline — connect to the internet, then Connect again.", true);
                    _setEngineStatusText(root, 'stopped');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: "You're offline — check your internet connection." });
                    return;
                }
                if (data.podId) {
                    // Track the app-managed podId (a recreate yields a new one).
                    state.runpodConfig = { ..._runpodCfg(), podId: data.podId };
                }
                // Create/resume refused outright (out of stock, API error) — no Pod.
                if (!res.ok || (!data.starting && !data.ready)) {
                    const msg = data.message || data.error || 'Could not connect to a Pod.';
                    // MPI-160: the requested system-RAM floor could not be met — no host
                    // with >= N GB is free for this card in this DC right now. Blind retry
                    // is only useful if the DC EVER has such a host, so respect the wait
                    // toggle: auto-retry on → wait (a matching host may free up, flat
                    // price = free to wait); off → tell the user plainly and stop.
                    if (data.ramFloorMissed) {
                        const floor = Number(_runpodCfg().minRamGb) || 0;
                        const card = cfg.gpuType || 'this GPU';
                        const dcName = (_runpodAvailability?.dataCenters || []).find(d => d.id === cfg.datacenter)?.name || cfg.datacenter || 'this data center';
                        if (_runpodCfg().autoRetry === true) {
                            _handoffToWait = true;
                            Events.emit('ui:info', { message: `Waiting for a host with ≥${floor} GB RAM…` });
                            return;
                        }
                        _setEngineHint(root, `No host with ≥${floor} GB system RAM for ${card} in ${dcName} right now. Lower the floor, pick another data center, or enable auto-retry to wait.`, true);
                        _setEngineStatusText(root, 'stopped');
                        _engineBtnLabelSet('Connect');
                        Events.emit('ui:warning', { message: `No ≥${floor} GB host available — adjust the RAM floor or wait.` });
                        return;
                    }
                    // MPI-135: RunPod's REST create enum doesn't recognise this GPU
                    // (its create list lags the catalogue the picker reads from) — the
                    // card can never deploy, so never hand off to the auto-retry wait.
                    if (data.gpuUnsupported) {
                        _setEngineHint(root, `${msg}`, true);
                        _setEngineStatusText(root, 'stopped');
                        _engineBtnLabelSet('Connect');
                        Events.emit('ui:warning', { message: 'This GPU can\'t be deployed — pick another card.' });
                        return;
                    }
                    const outOfStock = isStockRefusal(msg);
                    // MPI-110: auto-retry on + an out-of-stock refusal with no Pod left
                    // behind → re-enter the background wait instead of asking the user
                    // to pick another card. A non-stock error (real API failure) still
                    // surfaces. A partial Pod (data.podId) is left to the normal path.
                    if (outOfStock && !data.podId && _runpodCfg().autoRetry === true) {
                        _handoffToWait = true;
                        return;
                    }
                    _setEngineHint(root, outOfStock
                        ? `${msg} — that GPU is out of stock right now. Pick another card and Connect again.`
                        : msg, true);
                    _setEngineStatusText(root, data.podId ? 'creating…' : 'stopped');
                    _engineBtnLabelSet(data.podId ? 'Disconnect' : 'Connect');
                    Events.emit('ui:warning', { message: 'Could not connect to a Pod.' });
                    return;
                }

                // The Pod is starting — the backend returns immediately now (no 504
                // on a long first-image pull). Poll /remote/comfy/status to ready,
                // surfacing a "downloading the engine" message when the wait runs
                // long (a fresh image tag's first ~3 GB pull onto a host).
                // MPI-135 C: the Pod now EXISTS (podId stored above) and we're polling
                // it to ready — that is the CONNECTING phase, not "creating". The hero
                // already shows 'connecting'; the panel text said "creating…" for this
                // whole window, contradicting it. Flip to "connecting…" so both surfaces
                // agree. ("creating…" = before the create returns a Pod; "resuming…" =
                // warm-resume of an existing Pod, left as-is.)
                _setEngineStatusText(root, warm ? 'resuming…' : 'connecting…');
                let _slowShown = false;
                let _notRunning = false; // MPI-96: RunPod host failed to start the Pod
                let _maintenance = false; // MPI-135 (C): host under maintenance (draining)
                const ready = await _pollEngineReady(() => {
                    if (_slowShown) return;
                    _slowShown = true;
                    _setEngineHint(root, 'First-time setup: downloading the engine and optimising it for your GPU (one time, a few minutes — much faster next time). Hang tight…');
                    Events.emit('ui:info', { message: 'Setting up the engine for your GPU (one time)…' });
                }, () => {
                    // MPI-86 boot watchdog: past ~5 min the Pod may be stuck on a bad
                    // RunPod host/volume. Prompt the user to bail — the Cancel button
                    // is already live, so this only nudges; it never auto-cancels.
                    _setEngineHint(root, 'This is taking longer than usual — the Pod may be stuck on a bad host. Press Cancel to stop and try another GPU.', true);
                    Events.emit('ui:warning', { message: 'Pod taking too long — you can Cancel and try another GPU.' });
                }, (podStatus) => {
                    // MPI-96: RunPod reported the Pod EXITED/TERMINATED — created but
                    // never started on the host. _pollEngineReady has already stopped;
                    // flag it so we surface a host-failure (not "still preparing").
                    _notRunning = true;
                    clientLogger.warn('settings', `[RunPod] Pod not running on host (status=${podStatus}) — aborting connect`);
                }, (maint) => {
                    // MPI-135 (C): RunPod placed the Pod on a host under maintenance.
                    _maintenance = true;
                    clientLogger.warn('settings', `[RunPod] host under maintenance — aborting connect (${(maint && maint.note) || 'no note'})`);
                });
                // MPI-86: user pressed Cancel mid-poll — _cancelConnect already tore
                // down the Pod + reset the UI; bail without the "still preparing" path.
                if (_connectAbort) return;
                // MPI-96: the Pod never started on its host (EXITED/TERMINATED). Tell
                // the user it's a bad host and reap the dead Pod so it stops billing
                // container disk; leave Connect live to retry on another GPU.
                if (_notRunning) {
                    Events.emit('remote:connect-progress', { pct: 0 });
                    // Delete the dead Pod — an EXITED Pod still bills container disk,
                    // and it's the tracked Pod (delete-active targets it, unlike the
                    // name-based orphan sweep which spares the tracked id). Clear the
                    // saved podId + wasConnected so the next Connect creates fresh and
                    // boot won't auto-reconnect to the dead host (mirrors _cancelConnect).
                    fetch('/remote/pod/delete-active', { method: 'POST' }).catch(() => {});
                    state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
                    _setEngineHint(root, 'The Pod failed to start on its RunPod host — this usually means a bad or busy host, not a problem with your setup. Pick another GPU (or try again) and Connect.', true);
                    _setEngineStatusText(root, 'stopped');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: 'Pod failed to start on host — pick another GPU and Connect.' });
                    return;
                }
                // MPI-135 (C): the Pod landed on a host going down for maintenance —
                // it'll never come ready. Same teardown as a dead host: reap it (a
                // stuck Pod still bills container disk) and clear the saved ids so the
                // next Connect creates fresh on another host.
                if (_maintenance) {
                    Events.emit('remote:connect-progress', { pct: 0 });
                    fetch('/remote/pod/delete-active', { method: 'POST' }).catch(() => {});
                    state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
                    _setEngineHint(root, 'RunPod placed your Pod on a host going down for maintenance, so it will not come ready. We deleted it — Connect again to land on a fresh host.', true);
                    _setEngineStatusText(root, 'stopped');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: 'Host under maintenance — Connect again for a fresh one.' });
                    return;
                }
                if (!ready) {
                    _setEngineHint(root, 'The Pod is taking longer than expected. It may still be preparing — press Connect again in a minute to resume it.', true);
                    _setEngineStatusText(root, 'creating…');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: 'Pod still preparing — try Connect again shortly.' });
                    // Billing guardrail: reap any STRAY Pod (a prior leaked one) now,
                    // not just on success. The still-preparing Pod is tracked
                    // server-side and spared; only non-keeper 'cubric-vision' Pods die.
                    fetch('/remote/pod/cleanup-orphans', { method: 'POST' }).catch(() => {});
                    return;
                }
                // MPI-88: a no-GPU "download mode" Pod runs the wrapper only — there
                // is no ComfyUI and therefore no binary-preview WS to open. Skip the
                // WS gate entirely; wrapper-ready IS fully connected for a download
                // Pod. Without this the WS handshake never completes and the connect
                // hangs in the "Almost ready" half-state below (hero stays OFFLINE).
                const _downloadMode = cfg.gpuType === '__cpu__';
                // Wrapper health is ready (ComfyUI up), but the binary-preview WS
                // opens lazily at generation time — flipping to "ready" now lets the
                // user queue a job before the WS handshake, hanging it in STARTING
                // (MPI-73 Bug 1). Open the WS and gate "ready" on the real handshake.
                // MPI-135 C: still the connecting phase (Pod up, WS handshaking) — not
                // "creating". Keep the panel text consistent with the hero.
                _setEngineStatusText(root, warm ? 'resuming…' : 'connecting…');
                let _wsOk = _downloadMode; // download Pods have no WS — ready == connected
                if (!_downloadMode) {
                    try {
                        const { ComfyUIController } = await import('../../../../services/comfyController.js');
                        _wsOk = await ComfyUIController.ensureWsConnected();
                    } catch (_) { /* fall through to the still-connecting notice */ }
                }
                if (!_wsOk) {
                    _setEngineHint(root, 'Almost ready — finishing the connection to the engine. Give it a moment, then try generating.', true);
                    _setEngineStatusText(root, 'connecting…');
                    _engineBtnLabelSet('Disconnect');
                    state.runpodConfig = { ..._runpodCfg(), wasConnected: true };
                    Events.emit('ui:info', { message: 'Almost ready — finishing the connection.' });
                    fetch('/remote/pod/cleanup-orphans', { method: 'POST' }).catch(() => {});
                    return;
                }
                // Connected — remember so boot can auto-reconnect (Step 4.3).
                state.runpodConfig = { ..._runpodCfg(), wasConnected: true };
                // A (re)connect restarts ComfyUI on Pod boot, so it re-scans
                // custom_nodes and loads any per-model node installed this session
                // — clear the pending REMOTE-restart gate (comfyController
                // ._ensureRemoteReady restarts the Pod's ComfyUI while it is set; see
                // MPI-64 B1). Local flag is untouched — local engine is unaffected by
                // a Pod (re)connect.
                if (state.remoteComfyNeedsRestart) state.remoteComfyNeedsRestart = false;
                _setEngineHint(root, data.recreated
                    ? 'Remote engine ready (your Pod was recreated on the same GPU).'
                    : 'Remote engine ready.');
                _setEngineStatusText(root, 'ready');
                _engineBtnLabelSet('Disconnect');
                // MPI-73: resolve the 'connecting' phase → flip the hero card to the
                // Pod + the status bar to "IDLE · Remote" immediately (don't wait for
                // the 5s connection-feed tick). Specs are best-effort for the card.
                _connectSucceeded = true;
                let _specs = { gpuName: cfg.gpuType || null, vramGb: null, ramGb: null };
                try {
                    const _qp = cfg.gpuType ? `?gpuTypeId=${encodeURIComponent(cfg.gpuType)}` : '';
                    const _sr = await fetch(`/remote/pod/specs${_qp}`);
                    if (_sr.ok) _specs = await _sr.json();
                } catch (_) { /* keep the fallback */ }
                Events.emit('remote:connection', { connected: true, ..._specs, phase: null });
                Events.emit('ui:success', { message: 'Remote engine ready' });
                // Reap any stranded EXITED Pods from a prior session (Step 4.3.3).
                // A create already swept server-side; a warm resume did not, so
                // do it here — fire-and-forget, the live Pod is kept server-side.
                fetch('/remote/pod/cleanup-orphans', { method: 'POST' }).catch(() => {});
                // MPI-74 P6: KEEP local ComfyUI warm on connect. The old behavior
                // stopped it here to free VRAM ("redundant once we generate
                // remotely") — but true concurrency means a per-gen "Run locally"
                // override can run on local ComfyUI WHILE the cloud Pod generates.
                // Killing it forced a blocking cold-boot on the first force-local
                // gen. Leaving it up costs idle local VRAM/RAM only when local was
                // already running; the user opted into concurrency. (Local still
                // lazy-starts on demand if it was not running.)
            } catch (err) {
                _setEngineHint(root, 'Could not reach the Pod connect endpoint.', true);
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                Events.emit('ui:warning', { message: 'Could not reach the Pod connect endpoint.' });
            } finally {
                _engineBusy = false;
                // MPI-73: if the connect did NOT fully succeed (refused, timed out,
                // WS never handshook, threw), clear the transient 'connecting' phase
                // back to local · offline so the hero/status bar don't stay stuck.
                // MPI-278: BUT not when the panel was just CLOSED mid-connect. destroy()
                // sets _connectAbort to stop this poll while deliberately LEAVING the Pod
                // booting (shell feed owns the live connect). Emitting local here strands
                // that connect — the hero flashed 'local · offline' then recovered on the
                // next 5s feed tick. A real Cancel (_cancelConnect) deletes the Pod and
                // emits local itself, so it is unaffected by this guard.
                if (!_connectSucceeded && !_destroyAborted) {
                    Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
                }
                // MPI-110: sniped mid-create with auto-retry on → re-enter the
                // background wait (shell-owned) now that this attempt's state is torn
                // down. _startWait repaints the button to Cancel, so skip the reset below.
                if (_handoffToWait) {
                    _startWait(root);
                } else if (_engineBtnLabel === 'Connect') {
                    // MPI-86: when the label is back on "Connect" (failed/cancelled), gate
                    // it on a picked GPU + volume like the other reset branches — don't
                    // blanket-enable, or Cancel leaves an enabled Connect with no GPU.
                    _engineBtnDisabled(!_runpodCfg().gpuType || !_runpodCfg().volumeId);
                } else {
                    _engineBtnDisabled(false);
                }
            }
        }

        // MPI-86: Cancel an in-flight create/reconnect. Breaks _pollEngineReady via
        // _connectAbort, then deletes the half-started Pod through the SAME path as
        // Disconnect's Delete (/remote/pod/delete-active → _deleteTrackedPod: stops
        // GPU billing, clears the token + ids, flips remote mode OFF, clears the
        // backend _starting flag) so nothing orphan-bills. Does NOT touch _engineBusy
        // — the still-running _connectEngine owns it and its finally resets it.
        async function _cancelConnect(root) {
            _connectAbort = true;
            // MPI-110: cancelling while waiting for an out-of-stock GPU — no Pod was
            // ever created (the shell wait only polls availability), so skip the
            // delete-active teardown and just stop the shell loop. Cheaper, and it
            // never touched remote mode to begin with.
            if (_isWaiting()) {
                Events.emit('remote:wait-cancel');
                _setEngineStatusText(root, 'stopped');
                _setEngineHint(root, 'Stopped waiting. Pick a GPU and Connect again, or try another card.');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(!_runpodCfg().gpuType || !_runpodCfg().volumeId);
                Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
                Events.emit('ui:info', { message: 'Stopped waiting for the GPU.' });
                return;
            }
            _setEngineStatusText(root, 'cancelling…');
            _setEngineHint(root, 'Cancelling — deleting the half-started Pod so it stops billing…');
            try {
                await fetch('/remote/pod/delete-active', { method: 'POST' });
            } catch (_) { /* best-effort — the backend idle watchdog is the backstop */ }
            // Forget any tracked podId so the next Connect creates fresh, and clear
            // the auto-reconnect intent (a cancelled attempt is not a connection).
            state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
            _setEngineStatusText(root, 'stopped');
            _setEngineHint(root, 'Connection cancelled. Pick a GPU and Connect again, or try another card.');
            _engineBtnLabelSet('Connect');
            _engineBtnDisabled(!_runpodCfg().gpuType || !_runpodCfg().volumeId);
            // Resolve the transient 'connecting' phase → local · offline.
            Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
            Events.emit('ui:info', { message: 'Connection cancelled.' });
        }

        // ── Auto-retry wait loop (MPI-110) ───────────────────────────────────
        // Is the picked GPU available RIGHT NOW in the current _runpodAvailability
        // snapshot? Mirrors the availMap logic in _buildGpuOptions (Any-region =
        // any DC has it available; a real DC = that DC's gpuAvailability). The CPU
        // download Pod has effectively-infinite capacity → always "in stock".
        function _isPickedGpuInStock(cfg) {
            const gpuType = cfg.gpuType;
            if (!gpuType) return false;
            if (gpuType === '__cpu__') return true;
            const dcs = _runpodAvailability?.dataCenters || [];
            if (_isAnyRegion(cfg)) {
                return dcs.some(d => (d.gpuAvailability || [])
                    .some(g => g.gpuTypeId === gpuType && g.available));
            }
            const dc = dcs.find(d => d.id === cfg.datacenter);
            return !!dc && (dc.gpuAvailability || [])
                .some(g => g.gpuTypeId === gpuType && g.available);
        }

        // Start an auto-retry wait for the picked (out-of-stock) GPU. The wait LOOP
        // lives in the shell (so it survives navigating away from Settings); this just
        // asks it to start and paints the panel's "waiting…" state. The shell kicks the
        // create + drives the connect when the GPU frees; `state.remoteWaitGpu` mirrors
        // the wait so a re-mounted panel re-paints it (see _applyWaitState).
        function _startWait(root) {
            const gpuLabel = _runpodCfg().gpuType || 'the selected GPU';
            Events.emit('remote:wait-start', {
                gpuType: _runpodCfg().gpuType,
                datacenter: _runpodCfg().datacenter,
            });
            _applyWaitState(root, gpuLabel);
        }

        // Paint the panel into "waiting…" mode (Cancel button + hint). Called both when
        // the user starts a wait and when a panel re-mounts while a shell wait is live.
        function _applyWaitState(root, gpuLabel) {
            _setEngineStatusText(root, 'waiting…');
            _setEngineHint(root, `Waiting for ${gpuLabel} to become available — checking every 15s. You can keep generating locally; we'll connect the moment it frees.`);
            _engineBtnLabelSet('Cancel');
            _engineBtnDisabled(false);
        }

        async function _disconnectEngine(root) {
            if (_engineBusy) return;
            _engineBusy = true;
            _engineBtnDisabled(true);
            _setEngineStatusText(root, 'stopping…');
            _setEngineHint(root, 'Stopping the Pod (GPU billing ends; the Pod stays so it resumes fast next time). Delete it to free storage and allow the volume to be deleted.');
            // MPI-73: hero card → "disconnecting · online" (no card); status bar →
            // "IDLE · Disconnecting". connected:true keeps the label base "online"
            // mid-teardown. Resolved to local · offline in finally.
            Events.emit('remote:connection', { connected: true, gpuName: null, vramGb: null, ramGb: null, phase: 'disconnecting' });
            try {
                // Step 4.3: STOP, not delete — keeps the Pod warm-resumable. Clear
                // wasConnected so boot does NOT auto-reconnect after an explicit
                // Disconnect; KEEP the podId so a manual Connect can warm-resume it.
                const res = await fetch('/remote/pod/stop-active', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.stopped === false) {
                    _setEngineHint(root, 'Could not stop the Pod — check the RunPod console.', true);
                    Events.emit('ui:warning', { message: 'Could not terminate the Pod.' });
                } else {
                    _setEngineHint(root, 'Pod stopped (GPU billing ended).');
                    Events.emit('ui:success', { message: 'Pod terminated (kept warm)' });
                }
                state.runpodConfig = { ..._runpodCfg(), wasConnected: false };
            } catch (err) {
                _setEngineHint(root, 'Could not reach the Pod stop endpoint.', true);
            } finally {
                _engineBusy = false;
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(!_runpodCfg().gpuType || !_runpodCfg().volumeId);
                // MPI-73: resolve the 'disconnecting' phase → local · offline.
                Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
            }
        }

        // Delete (not stop) the active Pod — the "Delete Pod" choice on Disconnect.
        // Frees the GPU + reserved container disk and clears the saved podId so a
        // later Connect creates fresh; the volume + its models persist (Step 4.3.2).
        async function _deletePodAndDisconnect(root) {
            if (_engineBusy) return;
            _engineBusy = true;
            _engineBtnDisabled(true);
            _setEngineStatusText(root, 'deleting…');
            _setEngineHint(root, 'Deleting the Pod (GPU + container-disk billing ends; the next Connect creates a fresh Pod). Your volume and models persist.');
            // MPI-73: hero → "disconnecting · online" (no card); status bar →
            // "IDLE · Disconnecting". Resolved to local · offline in finally.
            Events.emit('remote:connection', { connected: true, gpuName: null, vramGb: null, ramGb: null, phase: 'disconnecting' });
            try {
                const res = await fetch('/remote/pod/delete-active', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.deleted === false) {
                    _setEngineHint(root, 'Could not delete the Pod — check the RunPod console.', true);
                    Events.emit('ui:warning', { message: 'Could not delete the Pod.' });
                } else {
                    _setEngineHint(root, 'Pod deleted (all billing ended; volume kept).');
                    Events.emit('ui:success', { message: 'Pod deleted' });
                }
                // Clear podId so a later Connect creates fresh, and the intent so
                // boot does not auto-reconnect.
                state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
            } catch (err) {
                _setEngineHint(root, 'Could not reach the Pod delete endpoint.', true);
            } finally {
                _engineBusy = false;
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(!_runpodCfg().gpuType || !_runpodCfg().volumeId);
                // MPI-73: resolve the 'disconnecting' phase → local · offline.
                Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
            }
        }

        // Disconnect popup (Step 4.3.2): the user chooses how to release the Pod.
        //   Terminate (primary) → STOP/EXITED, warm-resumable, bills only volume +
        //     reserved container disk (a small fee), no GPU.
        //   Delete → remove the Pod, frees the card + container disk, lets the
        //     volume be deleted later; next Connect is a cold create.
        function _openDisconnectChoice(root) {
            if (_engineBusy) return;
            const modal = MpiModal.mount(ce('div'), { width: 'min(460px, 92vw)' });
            const box = ce('div', { className: 'mpi-settings__disconnect' });
            box.appendChild(ce('div', {
                className: 'mpi-settings__disconnect-title',
                textContent: 'Disconnect remote engine',
            }));
            box.appendChild(ce('div', {
                className: 'mpi-settings__disconnect-text',
                textContent:
                    'Terminate keeps the Pod ready to resume quickly and bills only storage ' +
                    '(volume + reserved container disk) — a small fee. Delete removes the Pod, ' +
                    'ending all billing except the volume, but the next connection is a slower ' +
                    'cold start. Your volume and installed models are kept either way.',
            }));
            const actions = ce('div', { className: 'mpi-settings__disconnect-actions' });
            box.appendChild(actions);
            modal.el.appendChild(box);

            const close = () => modal.el.hide();
            const terminateBtn = MpiButton.mount(ce('div'), { text: 'Terminate', variant: 'primary', size: 'sm' });
            const deleteBtn = MpiButton.mount(ce('div'), { text: 'Delete Pod', variant: 'danger', size: 'sm' });
            const cancelBtn = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'secondary', size: 'sm' });
            terminateBtn.on('click', () => { close(); _disconnectEngine(root); });
            deleteBtn.on('click', () => { close(); _deletePodAndDisconnect(root); });
            cancelBtn.on('click', close);
            // Enter confirms the primary (Terminate) action.
            modal.on('confirm', () => { close(); _disconnectEngine(root); });
            actions.appendChild(cancelBtn.el);
            actions.appendChild(deleteBtn.el);
            actions.appendChild(terminateBtn.el);
            modal.el.show();
        }

        function _refreshEngineConnect(root) {
            _applyEngineStatus(root, null);
            _pollEngineStatus(root);
        }

        function _initEngineConnect(root) {
            const slot = qs('#mpiSettingsRunpodConnectSlot', root);
            if (!slot || _engineConnectInst) return;
            slot.innerHTML = '';
            _engineConnectInst = MpiButton.mount(slot, {
                text: 'Connect',
                variant: 'primary',
                size: 'sm',
            });
            _engineConnectInst.on('click', () => {
                if (_engineBtnLabel === 'Cancel') _cancelConnect(root); // MPI-86: in-flight connect
                else if (_engineBtnLabel === 'Disconnect') _openDisconnectChoice(root);
                else _connectEngine(root);
            });
            _refreshEngineConnect(root);
            // Poll status while the panel is open so the label tracks reality
            // (e.g. background boot finishing, or a quit-stop elsewhere).
            _engineStatusTimer = setInterval(() => {
                if (!_engineBusy) _pollEngineStatus(root);
            }, 5000);
        }

        const _stockRank = { High: 3, Medium: 2, Low: 1 };

        // MPI-78: sentinel datacenter value for the no-volume "Any region" ephemeral
        // mode. Picking it clears the volume, lets RunPod auto-place the Pod, lists
        // GPUs DC-unbound, and exposes a container-disk size input. Distinct from a
        // bare null (no DC chosen yet) so the UI can tell "not picked" from "Any region".
        const ANY_REGION = '__any__';
        function _isAnyRegion(cfg) { return (cfg || _runpodCfg()).datacenter === ANY_REGION; }
        // Ephemeral container-disk size clamp (mirrors storage.js + remoteProxy.js).
        const DISK_DEFAULT_GB = 100;
        const DISK_MIN_GB = 20;
        const DISK_MAX_GB = 500;
        function _diskGbFromCfg(cfg) {
            const n = Math.round(Number((cfg || _runpodCfg()).containerDiskGb));
            if (!Number.isFinite(n)) return DISK_DEFAULT_GB;
            return Math.min(DISK_MAX_GB, Math.max(DISK_MIN_GB, n));
        }

        function _renderRunpodPickers(root) {
            const cfg = _runpodCfg();
            const dcSlot = qs('#mpiSettingsRunpodDcSlot', root);
            const gpuSlot = qs('#mpiSettingsRunpodGpuSlot', root);
            if (!dcSlot || !gpuSlot) return;
            dcSlot.innerHTML = '';
            gpuSlot.innerHTML = '';

            const dcs = _runpodAvailability?.dataCenters || [];
            const gpus = _runpodAvailability?.gpuTypes || [];
            if (!dcs.length) {
                dcSlot.appendChild(ce('div', {
                    className: 'mpi-settings__empty-row',
                    textContent: 'Save a valid API key to load live availability.',
                }));
                return;
            }

            const dcRealOptions = dcs
                .filter(dc => dc.storageSupport)
                .map(dc => {
                    const count = (dc.gpuAvailability || []).filter(g => g.available).length;
                    const mine = _volumeForDc(dc.id) ? ' · volume' : '';
                    return { value: dc.id, label: dc.name || dc.id, meta: `${count} GPUs${mine}` };
                });
            // MPI-78: "Any region (no volume)" leads the list — RunPod auto-places the
            // Pod and models download to ephemeral container disk (mirrors the console's
            // "Any region" + Network volume "none"). Picking a real DC keeps the
            // existing volume-backed flow.
            const dcOptions = [
                { value: ANY_REGION, label: 'Any region (no volume)', meta: 'Ephemeral — models download per session, no storage bill between sessions' },
                ...dcRealOptions,
            ];
            const dcInst = MpiDropdown.mount(dcSlot, {
                options: dcOptions,
                value: cfg.datacenter || '',
                placeholder: 'Select data center...',
                extraClasses: 'mpi-dropdown--runpod',
            });
            dcInst.on('change', async ({ value }) => {
                // MPI-78: "Any region" → no DC-lock, no volume; gpuType cleared so the
                // picker re-lists DC-unbound. A real DC drives its cubric-vision volume.
                const anyRegion = value === ANY_REGION;
                const vol = anyRegion ? null : _volumeForDc(value);
                state.runpodConfig = {
                    ..._runpodCfg(),
                    datacenter: value,
                    gpuType: null,
                    volumeId: vol ? vol.id : null,
                };
                // Re-fetch availability scoped to the new DC so GPU RAM reflects
                // that DC (lowestPrice is per-DC), not the previous DC's snapshot.
                try {
                    const res = await fetch(_availabilityUrl());
                    if (res.ok) _runpodAvailability = await res.json();
                } catch (_) { /* keep the last snapshot on a failed refresh */ }
                _renderRunpodPickers(root);
                _renderRunpodVolume(root);
                _refreshEngineConnect(root);
            });

            const anyRegion = _isAnyRegion(cfg);
            const dc = anyRegion ? null : dcs.find(d => d.id === cfg.datacenter);
            // Any-region lists DC-unbound; a real DC needs to be picked first.
            if (!anyRegion && !dc) {
                gpuSlot.appendChild(ce('div', {
                    className: 'mpi-settings__empty-row',
                    textContent: 'Pick a data center first.',
                }));
                return;
            }
            const gpuOptions = _buildGpuOptions(anyRegion ? ANY_REGION : dc.id);
            const gpuInst = MpiDropdown.mount(gpuSlot, {
                options: gpuOptions,
                value: cfg.gpuType || '',
                placeholder: 'Select GPU...',
                extraClasses: 'mpi-dropdown--runpod',
                // Opens upward — the GPU picker sits low in the panel and the long
                // option list was clipped at the viewport bottom when opening down.
                direction: 'up',
            });
            gpuInst.on('change', async ({ value }) => {
                const prev = _runpodCfg();
                // MPI-110: switching GPU while an auto-retry WAIT is live → switch the
                // wait to the new card. Stop the shell loop (no Pod exists yet — nothing
                // to tear down), adopt the new GPU, and if it's also out of stock start
                // a fresh wait for it; if it's in stock, leave Connect ready so the user
                // connects immediately. Without this the wait kept polling the OLD GPU.
                if (_isWaiting() && value && value !== prev.gpuType) {
                    Events.emit('remote:wait-cancel');
                    state.runpodConfig = { ...prev, gpuType: value };
                    if (value !== '__cpu__' && !_isPickedGpuInStock(_runpodCfg())) {
                        _startWait(root);
                    } else {
                        _setEngineHint(root, 'Switched GPU — it’s available now. Connect to create a Pod on the new card.');
                        _refreshEngineConnect(root);
                    }
                    return;
                }
                // MPI-86: switching GPU while a connect is IN FLIGHT auto-cancels it —
                // the in-flight Pod is pinned to the old card, so kill it (stops
                // billing) before adopting the new GPU. This is the out-of-stock /
                // bad-host pivot (MPI-64 L1): bail and immediately Connect another.
                if (_engineBusy && value && value !== prev.gpuType) {
                    await _cancelConnect(root);
                    state.runpodConfig = { ..._runpodCfg(), gpuType: value };
                    _setEngineHint(root, 'Switched GPU — the in-flight connection was cancelled. Connect to create a Pod on the new card.');
                    _refreshEngineConnect(root);
                    return;
                }
                // Switching GPU while a (stopped/saved) Pod exists: that Pod is
                // pinned to the old card, so delete it — the next Connect creates
                // fresh on the new GPU (Step 4.3 GPU-switch path).
                if (prev.podId && value && value !== prev.gpuType) {
                    try { await fetch('/remote/pod/delete-active', { method: 'POST' }); } catch (_) { /* best-effort */ }
                    state.runpodConfig = { ...prev, gpuType: value, podId: null, wasConnected: false };
                    _setEngineHint(root, 'Switched GPU — your previous Pod was deleted. Connect to create one on the new card.');
                } else {
                    state.runpodConfig = { ...prev, gpuType: value };
                }
                // MPI-160: the min-RAM input shows for a real GPU but not the CPU download
                // Pod — re-render the pickers when the pick crosses that boundary so the
                // input appears/disappears. (Only on the boundary → no needless re-mount.)
                const wasCpu = prev.gpuType === '__cpu__';
                const nowCpu = value === '__cpu__';
                if (wasCpu !== nowCpu) _renderRunpodPickers(root);
                // Connect is gated on a picked GPU (Step 4.2) — refresh its state.
                _refreshEngineConnect(root);
            });
            // Re-fetch live stock whenever the picker opens — RunPod availability
            // drifts, and a stale "LOW" hint made users keep trying out-of-stock
            // cards. Re-list the GPU options in place (keeps the panel open).
            gpuInst.on('open', async () => {
                const dcId = _runpodCfg().datacenter;
                if (!dcId) return;
                try {
                    const res = await fetch(_availabilityUrl());
                    if (res.ok) _runpodAvailability = await res.json();
                } catch (_) { /* keep the last options on a failed refresh */ }
                gpuInst.el.setOptions(_buildGpuOptions(dcId), _runpodCfg().gpuType || '');
            });

            // MPI-160: optional minimum system-RAM floor. RunPod honors minMemoryInGb as
            // a hard placement filter, so a user whose model needs a high-RAM host sets a
            // floor and RunPod only lands a host with >= that much system RAM. Hidden for
            // the CPU download Pod and Any-region (RunPod ignores the floor there). 0 = no
            // floor. Shown whenever a real DC is selected and the pick isn't the CPU Pod —
            // a floor is a pre-set that applies to whichever GPU is chosen.
            const minRamSlot = qs('#mpiSettingsRunpodMinRamSlot', root);
            if (minRamSlot) {
                minRamSlot.innerHTML = '';
                const pickedCpu = cfg.gpuType === '__cpu__';
                if (!anyRegion && !pickedCpu) {
                    // Inline row: "Min System RAM [ 90 ] GB"
                    const row = ce('div', { className: 'mpi-settings__minram-row' });
                    const label = ce('span', {
                        className: 'mpi-settings__minram-label',
                        textContent: 'Min System RAM',
                    });
                    const inputHost = ce('div', { className: 'mpi-settings__minram-input' });
                    const unit = ce('span', { className: 'mpi-settings__minram-unit', textContent: 'GB' });
                    row.appendChild(label);
                    row.appendChild(inputHost);
                    row.appendChild(unit);
                    minRamSlot.appendChild(row);
                    const ramHint = ce('span', {
                        className: 'mpi-settings__hint',
                        textContent: 'Optional. RunPod only places on a host with at least this much system RAM. Leave 0 for any. Heavy video models perform better with high RAM (ComfyUI offloads weights to system RAM). If no matching host is free, connect will say so.',
                    });
                    minRamSlot.appendChild(ramHint);
                    const ramInst = MpiInput.mount(inputHost, {
                        type: 'number',
                        min: 0,
                        max: 2000,
                        step: 10,
                        value: Number(cfg.minRamGb) > 0 ? Number(cfg.minRamGb) : 0,
                        size: 'sm',
                    });
                    ramInst.on('change', ({ value }) => {
                        const gb = Math.max(0, Math.min(2000, Math.round(Number(value) || 0)));
                        state.runpodConfig = { ..._runpodCfg(), minRamGb: gb };
                    });
                }
            }
        }

        // Build the GPU picker options for a data center from the current
        // _runpodAvailability snapshot (stock-led meta, $/hr, ranked High→Low).
        function _buildGpuOptions(dcId) {
            const dcs = _runpodAvailability?.dataCenters || [];
            const gpus = _runpodAvailability?.gpuTypes || [];
            const anyRegion = dcId === ANY_REGION;
            // MPI-110: with auto-retry on, also surface out-of-stock GPUs so the user
            // can pick the exact card to WAIT for. `unavailSet` holds GPU type ids
            // that exist in the scope but have no available stock right now.
            const autoRetry = _runpodCfg().autoRetry === true;
            // MPI-78: "Any region" aggregates availability across EVERY DC (best stock
            // wins per GPU) so the user sees the full Secure-Cloud catalogue like the
            // RunPod console; a real DC scopes to that DC's gpuAvailability only.
            let availMap;
            const unavailSet = new Set();
            if (anyRegion) {
                availMap = new Map();
                for (const d of dcs) {
                    for (const g of (d.gpuAvailability || [])) {
                        if (!g.available) { if (!availMap.has(g.gpuTypeId)) unavailSet.add(g.gpuTypeId); continue; }
                        unavailSet.delete(g.gpuTypeId);
                        const cur = availMap.get(g.gpuTypeId);
                        if (!cur || (_stockRank[g.stockStatus] || 0) > (_stockRank[cur] || 0)) {
                            availMap.set(g.gpuTypeId, g.stockStatus);
                        }
                    }
                }
            } else {
                const dc = dcs.find(d => d.id === dcId);
                if (!dc) return [];
                availMap = new Map(
                    (dc.gpuAvailability || [])
                        .filter(g => g.available)
                        .map(g => [g.gpuTypeId, g.stockStatus])
                );
                for (const g of (dc.gpuAvailability || [])) {
                    if (!g.available && !availMap.has(g.gpuTypeId)) unavailSet.add(g.gpuTypeId);
                }
            }
            // MPI-88: first option is the no-GPU "download mode" Pod. Picking it sets
            // gpuType to the CPU sentinel, which satisfies the Connect guard and
            // creates a CPU-only Pod (computeType:'CPU') — install models to the
            // volume with no GPU billing, then switch to a real card to generate.
            // It needs a volume to download onto, so it is hidden in Any-region mode.
            const cpuOption = {
                value: '__cpu__',
                label: 'No GPU — download only',
                meta: 'CPU instance · install models to the volume, no GPU billing',
            };
            // Stock leads the meta so it survives truncation in narrow panels.
            // N/A mirrors the RunPod console's label for unrated stock.
            const gpuOptions = gpus
                .filter(g => g.secureCloud && (availMap.has(g.id) || (autoRetry && unavailSet.has(g.id))))
                .map(g => {
                    const inStock = availMap.has(g.id);
                    const stock = availMap.get(g.id);
                    const price = (typeof g.securePrice === 'number')
                        ? ` · $${g.securePrice.toFixed(2)}/hr`
                        : '';
                    // System RAM (lowest-tier offering floor). Wan video needs
                    // ≥64GB — flag low-RAM cards so the user knows video may OOM
                    // (image gen is fine on less). No hard block.
                    const ram = (typeof g.minMemory === 'number' && g.minMemory > 0)
                        ? ` · ${g.minMemory}GB RAM${g.minMemory < 64 ? ' ⚠ video' : ''}`
                        : '';
                    // MPI-110: out-of-stock card shown only because auto-retry is on —
                    // label it so the user knows Connect will wait for it. Ranked below
                    // every in-stock card.
                    const stockLabel = inStock ? (stock || 'N/A') : 'Unavailable — will wait';
                    return {
                        value: g.id,
                        label: g.displayName || g.id,
                        meta: `${stockLabel} · ${g.memoryInGb}GB VRAM${ram}${price}`,
                        _rank: inStock ? (_stockRank[stock] || 0) : -1,
                    };
                })
                .sort((a, b) => b._rank - a._rank);
            // MPI-180: always include the currently-selected card, even when its
            // stock just flipped unavailable (and auto-retry is off). Without this
            // the dropdown re-renders to the "Select GPU..." placeholder while a
            // Pod may be RUNNING on that very card — the selection looks lost.
            const selected = _runpodCfg().gpuType;
            if (selected && selected !== '__cpu__' && !gpuOptions.some(o => o.value === selected)) {
                const g = gpus.find(x => x.id === selected);
                gpuOptions.push({
                    value: selected,
                    label: g?.displayName || selected,
                    meta: 'Unavailable right now · selected card',
                });
            }
            return anyRegion ? gpuOptions : [cpuOption, ...gpuOptions];
        }

        // Availability URL, scoped to the selected DC so GPU RAM (lowestPrice) is
        // per-DC accurate instead of a global floor. No DC (or "Any region", MPI-78)
        // -> global call: the un-scoped lowestPrice floor across all DCs.
        function _availabilityUrl() {
            const dcId = _runpodCfg().datacenter;
            return (dcId && dcId !== ANY_REGION)
                ? `/runpod/gpu-availability?dataCenterId=${encodeURIComponent(dcId)}`
                : '/runpod/gpu-availability';
        }

        async function _loadRunpodAvailability(root) {
            try {
                const res = await fetch(_availabilityUrl());
                if (!res.ok) throw new Error(`availability returned ${res.status}`);
                _runpodAvailability = await res.json();
            } catch (err) {
                _runpodAvailability = null;
                clientLogger.warn('settings', '[MpiSettings] RunPod availability load failed');
            }
            try {
                const res = await fetch('/runpod/volumes');
                const data = res.ok ? await res.json() : null;
                const list = Array.isArray(data) ? data : (data?.networkVolumes || data?.volumes || null);
                _runpodVolumes = Array.isArray(list) ? list : null;
            } catch (_) {
                _runpodVolumes = null;
            }

            // Adopt the saved volume's data center when none is chosen yet.
            const cfg = _runpodCfg();
            const vol = _findRunpodVolume(cfg.volumeId);
            if (vol?.dataCenterId && !cfg.datacenter) {
                state.runpodConfig = { ...cfg, datacenter: vol.dataCenterId };
            }
            _renderRunpodPickers(root);
            _renderRunpodVolume(root);
        }

        // Volume is derived from the selected data center: the cubric-vision volume
        // in that DC (a badge), or None. No dropdown — one volume per DC. Create
        // provisions one in the selected DC; once it exists, Create swaps to Delete.
        function _renderRunpodVolume(root) {
            const volumeSlot = qs('#mpiSettingsRunpodVolumeSlot', root);
            if (!volumeSlot) return;
            volumeSlot.innerHTML = '';
            const cfg = _runpodCfg();

            // MPI-237: any re-render orphans a prior disk bar + poll — tear it down
            // once here so BOTH the ephemeral and volume branches start clean.
            _teardownDiskBar();

            // MPI-78: "Any region" mode has no network volume — instead the user sizes
            // the ephemeral container disk the models download into (lost on Terminate).
            if (_isAnyRegion(cfg)) {
                if (cfg.volumeId) state.runpodConfig = { ..._runpodCfg(), volumeId: null };
                const wrap = ce('div', { className: 'mpi-settings__volume-row' });
                const label = ce('label', {
                    className: 'mpi-settings__field-label',
                    textContent: 'Container disk (GB)',
                });
                const inputHost = ce('div');
                wrap.appendChild(label);
                wrap.appendChild(inputHost);
                volumeSlot.appendChild(wrap);
                const diskInst = MpiInput.mount(inputHost, {
                    type: 'number',
                    min: DISK_MIN_GB,
                    max: DISK_MAX_GB,
                    step: 10,
                    value: _diskGbFromCfg(cfg),
                    size: 'sm',
                });
                diskInst.on('change', ({ value }) => {
                    const gb = Math.min(DISK_MAX_GB, Math.max(DISK_MIN_GB, Math.round(Number(value) || 0)));
                    state.runpodConfig = { ..._runpodCfg(), containerDiskGb: gb };
                });
                const warn = ce('div', {
                    className: 'mpi-settings__hint mpi-settings__hint--warn',
                    textContent: 'Ephemeral — models download each session and are deleted when you Terminate the Pod. No storage bill between sessions. Size the disk for the models you plan to install. First generation includes a one-time accelerator compile (a few minutes).',
                });
                volumeSlot.appendChild(warn);
                // MPI-237: ephemeral pods use the container disk (/cubric-data), not a
                // network volume — but the disk bar still applies. The helper resolves
                // its total server-side and hides until a Pod reports usage.
                _mountDiskBar(volumeSlot);
                return;
            }

            const vol = cfg.datacenter ? _volumeForDc(cfg.datacenter) : null;

            // Keep the saved volumeId in lock-step with the derived volume so the
            // Connect gate + create-spec always reference the DC's actual volume.
            if ((vol ? vol.id : null) !== (cfg.volumeId || null)) {
                state.runpodConfig = { ..._runpodCfg(), volumeId: vol ? vol.id : null };
            }

            const volRow = ce('div', { className: 'mpi-settings__volume-row' });
            volumeSlot.appendChild(volRow);

            // Badge (volume present) or None.
            const badge = ce('div', { className: 'mpi-settings__volume-badge mpi-settings__volume-drop' });
            if (vol) {
                badge.textContent = `✓ ${vol.name || vol.id} · ${vol.size ? `${vol.size} GB · ` : ''}Ready`;
            } else {
                badge.classList.add('mpi-settings__volume-badge--none');
                badge.textContent = cfg.datacenter
                    ? 'None — create one to store ComfyUI + models.'
                    : 'Pick a data center, then create a volume.';
            }
            volRow.appendChild(badge);

            // Create (no volume in this DC) ↔ Delete (one exists). Both small.
            if (vol) {
                const delBtn = MpiButton.mount(ce('div'), {
                    text: 'Delete',
                    variant: 'secondary',
                    size: 'sm',
                    extraClasses: 'mpi-settings__volume-delete',
                });
                delBtn.on('click', () => _confirmDeleteVolume(root, vol));
                volRow.appendChild(delBtn.el);
            } else {
                const createBtn = MpiButton.mount(ce('div'), {
                    text: '+ Create',
                    variant: 'primary',
                    size: 'sm',
                    extraClasses: 'mpi-settings__volume-create',
                });
                createBtn.on('click', () => _promptCreateVolume(root));
                volRow.appendChild(createBtn.el);
            }

            // MPI-237: live disk-usage bar for the volume. Fed by the connected Pod's
            // wrapper (du) via /remote/pod/disk; total now resolved server-side. Mount
            // unconditionally — the helper hides itself until a Pod reports usage. (An
            // idle/unconnected DC → total-only badge above, bar stays hidden.)
            _mountDiskBar(volumeSlot);
        }

        // MPI-237: mount the shared Pod disk-usage bar into `host`, tearing down any
        // prior instance first. Used by both the volume slot and the ephemeral slot.
        function _mountDiskBar(host) {
            _teardownDiskBar();
            _podDiskBar = mountPodDiskBar(host);
        }

        function _teardownDiskBar() {
            _podDiskBar?.destroy?.();
            _podDiskBar = null;
        }

        // Prompt for size, then POST /runpod/volumes in the configured data center.
        function _promptCreateVolume(root) {
            const cfg = _runpodCfg();
            if (!cfg.datacenter) {
                Events.emit('ui:error', {
                    title: 'Pick a data center',
                    message: 'Choose a data center first — a network volume is locked to one.',
                });
                return;
            }
            const dc = (_runpodAvailability?.dataCenters || []).find(d => d.id === cfg.datacenter);
            const dcName = dc?.name || cfg.datacenter;
            const RATE = 0.07; // USD per GB per month (RunPod network-volume storage)

            // Live cost line for a given size. Reads as "150 GB → $10.50/mo · $0.35/day".
            const costLine = (raw) => {
                const size = parseInt(String(raw || '').trim(), 10);
                if (!Number.isInteger(size) || size <= 0) return 'Enter a size in GB to see the cost.';
                const perMonth = size * RATE;
                const perDay = perMonth / 30;
                return `${size} GB → $${perMonth.toFixed(2)}/mo · $${perDay.toFixed(2)}/day`;
            };

            const baseText = `Creates a RunPod network volume in ${dcName}. Storage bills on your RunPod account until you delete it (~$${RATE.toFixed(2)}/GB per month).`;
            const dialog = MpiOkCancel.mount(ce('div'), {
                title: 'Create network volume',
                text: `${baseText}\n\n${costLine('150')}`,
                inputPlaceholder: 'Size in GB (e.g. 150)',
                inputValue: '150',
                okLabel: 'Create',
            });
            // Update the cost line live as the size changes.
            dialog.on('input', ({ value }) => {
                const textSlot = qs('#text-slot', dialog.el);
                if (textSlot) textSlot.textContent = `${baseText}\n\n${costLine(value)}`;
            });
            dialog.on('ok', async ({ inputValue }) => {
                const size = parseInt(String(inputValue || '').trim(), 10);
                if (!Number.isInteger(size) || size <= 0) {
                    Events.emit('ui:error', { title: 'Invalid size', message: 'Enter a positive whole number of GB.' });
                    return;
                }
                await _createRunpodVolume(root, size, cfg.datacenter, dcName);
            });
            dialog.el.show();
            // Honour the \n\n split between the base copy and the live cost line
            // (scoped to this dialog so the shared MpiOkCancel style is untouched).
            const textSlot = qs('#text-slot', dialog.el);
            if (textSlot) textSlot.style.whiteSpace = 'pre-line';
        }

        async function _createRunpodVolume(root, size, dataCenterId, dcName) {
            try {
                const res = await fetch('/runpod/volumes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: `cubric-vision-${dataCenterId}`, size, dataCenterId }),
                });
                const data = await res.json().catch(() => null);
                const newId = data?.id || data?.networkVolume?.id || null;
                if (!res.ok || !newId) {
                    Events.emit('ui:error', { title: 'Volume not created', message: _runpodErrText(data, res.status) });
                    return;
                }
                await _reloadRunpodVolumes();
                const next = { ..._runpodCfg(), volumeId: newId, datacenter: dataCenterId, gpuType: null };
                state.runpodConfig = next;
                _renderRunpodPickers(root);
                _renderRunpodVolume(root);
                // A volume now exists — let Connect re-evaluate its gate.
                _refreshEngineConnect(root);
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] volume create failed', err);
                Events.emit('ui:error', { title: 'Volume not created', message: 'Could not reach RunPod.' });
            }
        }

        function _confirmDeleteVolume(root, vol) {
            // A Pod we manage may be attached to this volume. RunPod refuses a
            // volume-delete while ANY Pod is attached (even EXITED), so warn that
            // the Pod goes too when we are about to delete it (Step 4.3.1).
            const cfg = _runpodCfg();
            const podAttached = !!cfg.podId;
            const dialog = MpiOkCancel.mount(ce('div'), {
                title: 'Delete network volume',
                text: `Delete volume "${vol.name || vol.id}"?${podAttached
                    ? ' Your connected Pod is attached to it and will be deleted first.'
                    : ''} Storage billing stops, but every model stored on it must be re-downloaded. This cannot be undone.`,
                okLabel: 'Delete',
            });
            dialog.on('ok', async () => {
                try {
                    // RunPod blocks deleting a volume with an attached Pod. Delete
                    // the tracked Pod first, then clear its saved id + intent so a
                    // later Connect creates fresh (Step 4.3.1).
                    if (podAttached) {
                        try {
                            await fetch('/remote/pod/delete-active', { method: 'POST' });
                        } catch (_) { /* fall through; volume-delete reports the real error */ }
                        state.runpodConfig = { ..._runpodCfg(), podId: null, wasConnected: false };
                        _refreshEngineConnect(root);
                    }
                    const res = await fetch(`/runpod/volumes/${vol.id}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const data = await res.json().catch(() => null);
                        Events.emit('ui:error', { title: 'Delete failed', message: _runpodErrText(data, res.status) });
                        return;
                    }
                    await _reloadRunpodVolumes();
                    if (_runpodCfg().volumeId === vol.id) {
                        state.runpodConfig = { ..._runpodCfg(), volumeId: null };
                    }
                    _renderRunpodVolume(root);
                } catch (err) {
                    clientLogger.error('settings', '[MpiSettings] volume delete failed', err);
                    Events.emit('ui:error', { title: 'Delete failed', message: 'Could not reach RunPod.' });
                }
            });
            dialog.el.show();
        }

        // The RunPod controls are gated on a saved API key (the Enable toggle was
        // dropped — a key IS the opt-in). `enabled` here mirrors ONLY "a key is
        // saved": it shows/hides the body + auto-connect/retry plates and persists
        // so the drop-recovery guard (shell.js) knows RunPod is in use.
        //
        // It does NOT push remote-mode {active:true}. Remote mode = "route
        // generation to the Pod", which must follow the ACTUAL Pod connection
        // (Connect turns it on, Disconnect off) — never key presence. Pushing it
        // active at boot with no Pod made ensureServerRunning fall back to local
        // and fire the "No Pod connected — running locally" toast on every launch.
        function _applyEnabled(root, enabled) {
            const body = qs('#mpiSettingsRunpodBody', root);
            const autoConnectGroup = qs('#mpiSettingsRunpodAutoConnectGroup', root);
            const autoRetryGroup = qs('#mpiSettingsRunpodAutoRetryGroup', root);
            body?.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
            autoConnectGroup?.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
            autoRetryGroup?.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
            if (_runpodCfg().enabled !== enabled) {
                state.runpodConfig = { ..._runpodCfg(), enabled };
            }
            _refreshEngineConnect(root);
        }

        async function _initRunpodSection(root) {
            const body = qs('#mpiSettingsRunpodBody', root);
            if (!body) return;

            const cfg = _runpodCfg();

            // ── Auto-connect on app start (MPI-85) ───────────────────────────
            // Owns the boot auto-connect lifecycle, decoupled from `enabled`. Default
            // OFF so a relaunch never spins a billed Pod by surprise. Persist-only —
            // boot reads it via Storage.getRunpodConfig(); no remote-mode push here.
            const autoConnectSlot = qs('#mpiSettingsRunpodAutoConnectSlot', root);
            if (autoConnectSlot) {
                autoConnectSlot.innerHTML = '';
                const acPlate = autoConnectSlot.closest('.mpi-settings__plate');
                acPlate?.classList.toggle('mpi-settings__plate--on', cfg.autoConnectOnStart === true);
                const acInst = MpiCheckbox.mount(autoConnectSlot, {
                    checked: cfg.autoConnectOnStart === true,
                    variant: 'switch',
                });
                acInst.on('change', ({ checked }) => {
                    state.runpodConfig = { ..._runpodCfg(), autoConnectOnStart: checked === true };
                    acPlate?.classList.toggle('mpi-settings__plate--on', checked === true);
                });
            }

            // ── Auto-retry connection (MPI-110) ──────────────────────────────
            // When ON: the GPU picker also lists out-of-stock cards, and Connect
            // becomes a background availability poll that waits for the picked GPU
            // to free, then hands off to the normal create path — WITHOUT entering
            // the blocking "connecting" state (local generation stays usable).
            // Persist-only; boot reads it via Storage.getRunpodConfig().
            const autoRetrySlot = qs('#mpiSettingsRunpodAutoRetrySlot', root);
            if (autoRetrySlot) {
                autoRetrySlot.innerHTML = '';
                const arPlate = autoRetrySlot.closest('.mpi-settings__plate');
                arPlate?.classList.toggle('mpi-settings__plate--on', cfg.autoRetry === true);
                const arInst = MpiCheckbox.mount(autoRetrySlot, {
                    checked: cfg.autoRetry === true,
                    variant: 'switch',
                });
                arInst.on('change', ({ checked }) => {
                    state.runpodConfig = { ..._runpodCfg(), autoRetry: checked === true };
                    arPlate?.classList.toggle('mpi-settings__plate--on', checked === true);
                    // Re-list GPUs so out-of-stock cards appear/disappear immediately.
                    _renderRunpodPickers(root);
                });
            }

            // ── Stage all models on connect (MPI-329) ────────────────────────
            // When ON, the hot-store prefetch stages EVERY installed model's weights
            // to the Pod's fast disk on connect (first gen instant). OFF (default):
            // weights stage lazily on first generation (gen-preflight), copying only
            // what's actually used. Persist-only; commandExecutor reads it via
            // Storage on the remote:connection flip and runs the prefetch there.
            const stageOnConnectSlot = qs('#mpiSettingsRunpodStageOnConnectSlot', root);
            if (stageOnConnectSlot) {
                stageOnConnectSlot.innerHTML = '';
                const soPlate = stageOnConnectSlot.closest('.mpi-settings__plate');
                soPlate?.classList.toggle('mpi-settings__plate--on', cfg.stageOnConnect === true);
                const soInst = MpiCheckbox.mount(stageOnConnectSlot, {
                    checked: cfg.stageOnConnect === true,
                    variant: 'switch',
                });
                soInst.on('change', ({ checked }) => {
                    state.runpodConfig = { ..._runpodCfg(), stageOnConnect: checked === true };
                    soPlate?.classList.toggle('mpi-settings__plate--on', checked === true);
                });
            }

            // ── API key (write-only; field is cleared after save) ───────────
            const keySlot = qs('#mpiSettingsRunpodKeySlot', root);
            const saveSlot = qs('#mpiSettingsRunpodKeySaveSlot', root);
            const clearSlot = qs('#mpiSettingsRunpodKeyClearSlot', root);
            if (keySlot && saveSlot && clearSlot) {
                keySlot.innerHTML = '';
                saveSlot.innerHTML = '';
                clearSlot.innerHTML = '';

                const keyInst = MpiInput.mount(keySlot, {
                    type: 'password',
                    placeholder: secretsClient.isAvailable() ? 'rpa_...' : 'Desktop app only',
                    disabled: !secretsClient.isAvailable(),
                });

                const saveInst = MpiButton.mount(saveSlot, {
                    text: 'Save',
                    variant: 'secondary',
                    size: 'sm',
                });
                saveInst.on('click', async () => {
                    const field = qs('.mpi-input__field', keyInst.el);
                    const key = (field?.value || '').trim();
                    if (!key) return;
                    const res = await secretsClient.setApiKey(key);
                    if (field) field.value = '';
                    if (!res?.ok) {
                        _setRunpodStatus(root, 'Failed to save the API key.');
                        return;
                    }
                    if (res.weakEncryption) {
                        Events.emit('ui:error', {
                            title: 'Security Notice',
                            message: 'No OS secure key store was detected (GNOME Keyring / KWallet). '
                                + 'Your RunPod API key is saved with app-level encryption instead of '
                                + 'OS-backed encryption. It is still encrypted on disk, but for best '
                                + 'security enable a desktop keyring.',
                        });
                    }
                    // A saved key IS the opt-in — unlock the RunPod controls now.
                    _applyEnabled(root, true);
                    _setRunpodStatus(root, 'Key saved. Validating...');
                    try {
                        const check = await fetch('/runpod/account/validate').then(r => r.json());
                        _setRunpodStatus(root, check.valid
                            ? 'Key saved and validated with RunPod.'
                            : 'Key saved, but RunPod rejected it — check the key.');
                        if (check.valid) _loadRunpodAvailability(root);
                    } catch (_) {
                        _setRunpodStatus(root, 'Key saved. Could not reach RunPod to validate.');
                    }
                });

                const clearInst = MpiButton.mount(clearSlot, {
                    text: 'Clear',
                    variant: 'secondary',
                    size: 'sm',
                });
                clearInst.on('click', async () => {
                    await secretsClient.clearApiKey();
                    _runpodAvailability = null;
                    // No key → lock the RunPod controls back down (remote mode off).
                    _applyEnabled(root, false);
                    _setRunpodStatus(root, 'No API key saved.');
                    _renderRunpodPickers(root);
                });
            }

            // ── Volume (non-secret) ──────────────────────────────────────────
            // The Pod ID field is gone (Step 4.2): the Pod is created on Connect
            // and its podId is app-managed, not user-entered.
            _renderRunpodVolume(root);

            // ── Remote engine Connect / Disconnect + status ──────────────────
            _initEngineConnect(root);

            // ── Delete-on-quit pref (non-secret) ─────────────────────────────
            const deleteOnQuitSlot = qs('#mpiSettingsRunpodDeleteOnQuitSlot', root);
            if (deleteOnQuitSlot) {
                deleteOnQuitSlot.innerHTML = '';
                const dqPlate = deleteOnQuitSlot.closest('.mpi-settings__plate');
                dqPlate?.classList.toggle('mpi-settings__plate--on', cfg.deleteOnQuit === true);
                const dqInst = MpiCheckbox.mount(deleteOnQuitSlot, {
                    checked: cfg.deleteOnQuit === true,
                    variant: 'switch',
                });
                dqInst.on('change', async ({ checked }) => {
                    const next = { ..._runpodCfg(), deleteOnQuit: checked === true };
                    state.runpodConfig = next;
                    dqPlate?.classList.toggle('mpi-settings__plate--on', checked === true);
                    await _pushRemoteMode(next);
                });
            }

            // ── Initial status + availability ────────────────────────────────
            // A saved API key gates the controls (the Enable toggle was removed).
            if (!secretsClient.isAvailable()) {
                _applyEnabled(root, false);
                _setRunpodStatus(root, 'RunPod settings require the desktop app.');
                _renderRunpodPickers(root);
                return;
            }
            const has = await secretsClient.hasApiKey();
            _applyEnabled(root, has);
            _setRunpodStatus(root, has ? 'API key is saved.' : 'No API key saved.');
            if (has) _loadRunpodAvailability(root);
            else _renderRunpodPickers(root);
        }

        // MPI-110: the shell-owned auto-retry wait flips `remoteWaitGpu` when it
        // starts/ends (won → create, or cancelled). Repaint the engine button so the
        // panel tracks it — e.g. wait ends → drop "waiting…" → next status poll paints
        // connecting/stopped. Re-derives from the last known status (null = re-poll).
        _unsubs.push(Events.onState('remoteWaitGpu', () => {
            _applyEngineStatus(el, null);
            if (!_isWaiting()) _pollEngineStatus(el);
        }));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            if (_engineStatusTimer) { clearInterval(_engineStatusTimer); _engineStatusTimer = null; }
            _teardownDiskBar(); // MPI-169/237
            // MPI-86: break any in-flight _pollEngineReady loop so it doesn't keep
            // fetching after the panel unmounts. The Pod is left booting on purpose
            // (backend _starting tracks it; the idle watchdog backstops) — destroy is
            // not a Cancel, so it must not delete a Pod the user may still want.
            _connectAbort = true;
            _destroyAborted = true; // MPI-278: panel close ≠ connect failure — don't let the
                                    // _connectEngine finally emit local · offline (shell owns the connect).
            _engineConnectInst?.destroy?.();
            _engineConnectInst = null;
        };
    },
});
