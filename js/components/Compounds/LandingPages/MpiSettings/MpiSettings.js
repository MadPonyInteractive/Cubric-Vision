import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiFolderDrop } from '../../../Primitives/MpiFolderDrop/MpiFolderDrop.js';
import { MpiOkCancel } from '../../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModal } from '../../../Primitives/MpiModal/MpiModal.js';
import { state } from '../../../../state.js';
import { Events } from '../../../../events.js';
import { Storage } from '../../../../core/storage.js';
import { secretsClient } from '../../../../core/secretsClient.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { loadAll as loadAssets } from '../../../../services/assetService.js';
import { reSyncInstalledModels } from '../../../../data/modelRegistry.js';
import { ce, qs } from '../../../../utils/dom.js';

const REUSE_PARTS = [
    { key: 'prompt', label: 'Use Prompt' },
    { key: 'settings', label: 'Use Settings' },
    { key: 'model', label: 'Use Model' },
    { key: 'images', label: 'Use Images' },
];

/**
 * MpiSettings — Settings content for the MpiSlideOver panel.
 *
 * No longer owns overlay chrome. Renders body content only.
 * MpiSlideOver calls el.onOpen() each time the panel opens so fields
 * are initialised with fresh values.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings });
 */
export const MpiSettings = ComponentFactory.create({
    name: 'MpiSettings',
    css: ['js/components/Compounds/LandingPages/MpiSettings/MpiSettings.css'],

    template: () => `
        <div class="mpi-settings">
            <div class="mpi-settings__content">
                <div class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">App Behavior</h3>
                    <div class="mpi-settings__form-group">
                        <div class="mpi-settings__checkbox-slot" id="mpiSettingsAutoStartSlot"></div>
                        <span class="mpi-settings__hint">If enabled, the generation engine will start as soon as the app opens.</span>
                    </div>
                    <div class="mpi-settings__form-group">
                        <label class="mpi-settings__field-label">Pixel Rendering</label>
                        <div id="mpiSettingsPixelModeSlot"></div>
                        <span class="mpi-settings__hint">Auto shows smooth at fit-to-screen and individual pixels when zoomed past 300%. Pixel-perfect always shows pixels; Smooth never does.</span>
                    </div>
                    <div class="mpi-settings__form-group">
                        <label class="mpi-settings__field-label">Reuse Prompt</label>
                        <div class="mpi-settings__reuse-grid" id="mpiSettingsReusePartsSlot"></div>
                        <div id="mpiSettingsReuseAskSlot"></div>
                        <span class="mpi-settings__hint">Choose what gets copied when Reuse Prompt is clicked.</span>
                    </div>
                    <div class="mpi-settings__form-group">
                        <label class="mpi-settings__field-label">Gallery Reuse Source</label>
                        <div id="mpiSettingsReuseSourceSlot"></div>
                        <span class="mpi-settings__hint">Original uses the first reusable generation in a card. Current uses the selected gallery entry.</span>
                    </div>
                </div>

                <div class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">External Connections</h3>
                    <div class="mpi-settings__form-group">
                        <div class="mpi-settings__folder-row">
                            <div id="mpiSettingsComfyRootPathSlot" class="mpi-settings__folder-input"></div>
                            <div id="mpiSettingsBrowseBtnSlot"></div>
                        </div>
                        <span class="mpi-settings__hint">Optional: path to an external ComfyUI models folder.</span>
                    </div>
                    <div class="mpi-settings__form-group">
                        <label class="mpi-settings__field-label">Additional Model Folders</label>
                        <div class="mpi-settings__extra-folders">
                            <div class="mpi-settings__extra-folder-group">
                                <div class="mpi-settings__extra-folder-head">
                                    <span class="mpi-settings__extra-folder-title">LoRAs</span>
                                    <div id="mpiSettingsAddLoraFolderSlot"></div>
                                </div>
                                <div id="mpiSettingsLoraPrimarySlot"></div>
                                <div class="mpi-settings__extra-folder-list" id="mpiSettingsLoraFoldersSlot"></div>
                                <div class="mpi-settings__drop-zones" id="mpiSettingsLoraDropSlot"></div>
                            </div>
                            <div class="mpi-settings__extra-folder-group">
                                <div class="mpi-settings__extra-folder-head">
                                    <span class="mpi-settings__extra-folder-title">Upscale Models</span>
                                    <div id="mpiSettingsAddUpscaleFolderSlot"></div>
                                </div>
                                <div id="mpiSettingsUpscalePrimarySlot"></div>
                                <div class="mpi-settings__extra-folder-list" id="mpiSettingsUpscaleFoldersSlot"></div>
                                <div class="mpi-settings__drop-zones" id="mpiSettingsUpscaleDropSlot"></div>
                            </div>
                        </div>
                        <span class="mpi-settings__hint">Extras are read-only additive folders. Cubric only installs, updates, and removes files from the primary managed folders.</span>
                    </div>
                </div>

                <div class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">RunPod Remote Engine</h3>
                    <div class="mpi-settings__runpod-referral">
                        <div class="mpi-settings__runpod-referral-copy">
                            <span class="mpi-settings__runpod-referral-kicker">New to RunPod?</span>
                            <span class="mpi-settings__runpod-referral-text">Create an account with Cubric's referral link. You can get a $5 credit bonus after signing up and adding $10 for the first time, and Cubric receives referral credit too.</span>
                        </div>
                        <a class="mpi-settings__runpod-referral-link" href="https://runpod.io?ref=slmzn8qv" target="_blank" rel="noopener noreferrer">Create RunPod account</a>
                    </div>
                    <div class="mpi-settings__form-group">
                        <div id="mpiSettingsRunpodToggleSlot"></div>
                        <span class="mpi-settings__hint">Run generations on your own RunPod Secure Cloud GPU. GPU and storage billing happen on your RunPod account.</span>
                    </div>
                    <div class="mpi-settings__runpod-body" id="mpiSettingsRunpodBody">
                        <div class="mpi-settings__form-group">
                            <div class="mpi-settings__folder-row">
                                <div id="mpiSettingsRunpodKeySlot" class="mpi-settings__folder-input"></div>
                                <div id="mpiSettingsRunpodKeySaveSlot"></div>
                                <div id="mpiSettingsRunpodKeyClearSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodKeyStatus"></span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">Data Center</label>
                            <div id="mpiSettingsRunpodDcSlot"></div>
                            <span class="mpi-settings__hint">A network volume is locked to one data center. Switching later means deleting the volume and re-downloading models.</span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">Network Volume</label>
                            <div id="mpiSettingsRunpodVolumeSlot"></div>
                            <span class="mpi-settings__hint">Stores your models so they survive between Pods — one volume per data center. Connect attaches it to the new Pod.</span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">GPU</label>
                            <div id="mpiSettingsRunpodGpuSlot"></div>
                            <span class="mpi-settings__hint">Secure Cloud only. Stock is a live hint (High / Medium / Low / N/A) — availability drifts; the RunPod console is ground truth.</span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <div class="mpi-settings__runpod-connect-row">
                                <span class="mpi-settings__runpod-status" id="mpiSettingsRunpodEngineStatus">Remote engine: —</span>
                                <div id="mpiSettingsRunpodConnectSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodConnectHint"></span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <div id="mpiSettingsRunpodDeleteOnQuitSlot"></div>
                            <span class="mpi-settings__hint">When checked, quitting the app deletes the Pod instead of keeping it warm. Frees GPU and container disk fully; your network volume and its models are kept.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];
        let _syncReuseControls = null;
        let _syncReuseSource = null;
        let _extraFolders = { loras: [], upscale_models: [] };
        const _extraFolderControls = [];
        let _ipcRenderer = null;

        try {
            if (typeof window.require === 'function') {
                _ipcRenderer = window.require('electron')?.ipcRenderer || null;
            }
        } catch (err) {
            clientLogger.warn('settings', '[MpiSettings] Electron IPC unavailable for folder picker', err);
        }

        // Called by MpiSlideOver each time panel opens — re-init fields with fresh values.
        el.onOpen = () => _initFields(el);

        function _initFields(root) {
            // ── Auto-start checkbox ──────────────────────────────────────────
            const autoStartSlot = qs('#mpiSettingsAutoStartSlot', root);
            if (autoStartSlot) {
                autoStartSlot.innerHTML = '';
                const autoStartInst = MpiCheckbox.mount(autoStartSlot, {
                    checked: Storage.getAutoStartComfy(),
                    label: 'Auto-start ComfyUI on Launch',
                });
                autoStartInst.on('change', ({ checked }) =>
                    Storage.setAutoStartComfy(checked));
            }

            // ── Pixel rendering mode ─────────────────────────────────────────
            const pixelModeSlot = qs('#mpiSettingsPixelModeSlot', root);
            if (pixelModeSlot) {
                pixelModeSlot.innerHTML = '';
                const current = state.pixelMode || 'auto';
                const pixelInst = MpiRadioGroup.mount(pixelModeSlot, {
                    name: 'pixel-mode',
                    value: current,
                    options: [
                        { label: 'Auto', value: 'auto' },
                        { label: 'Smooth', value: 'smooth' },
                        { label: 'Pixel-perfect', value: 'pixel' },
                    ],
                });
                pixelInst.on('select', ({ value }) => { state.pixelMode = value; });
            }

            // ── Reuse Prompt behavior ───────────────────────────────────────
            const reusePartsSlot = qs('#mpiSettingsReusePartsSlot', root);
            const reuseAskSlot = qs('#mpiSettingsReuseAskSlot', root);
            const reuseSourceSlot = qs('#mpiSettingsReuseSourceSlot', root);
            if (reusePartsSlot && reuseAskSlot) {
                reusePartsSlot.innerHTML = '';
                reuseAskSlot.innerHTML = '';
                const options = {
                    ask: state.promptReuseOptions?.ask === true,
                    prompt: state.promptReuseOptions?.prompt !== false,
                    settings: state.promptReuseOptions?.settings !== false,
                    model: state.promptReuseOptions?.model !== false,
                    images: state.promptReuseOptions?.images !== false,
                };
                const partChecks = new Map();
                let askCheck = null;
                const syncChecks = () => {
                    for (const { key } of REUSE_PARTS) {
                        partChecks.get(key)?.el?.setChecked?.(options[key] === true);
                        partChecks.get(key)?.el?.setDisabled?.(options.ask === true);
                    }
                    askCheck?.el?.setChecked?.(options.ask === true);
                };
                _syncReuseControls = (next = {}) => {
                    options.ask = next.ask === true;
                    options.prompt = next.prompt !== false;
                    options.settings = next.settings !== false;
                    options.model = next.model !== false;
                    options.images = next.images !== false;
                    syncChecks();
                };
                const saveOptions = () => {
                    state.promptReuseOptions = { ...options };
                    syncChecks();
                };

                for (const { key, label } of REUSE_PARTS) {
                    const mount = document.createElement('div');
                    const inst = MpiCheckbox.mount(mount, {
                        checked: options[key] === true,
                        label,
                        name: `reuse-setting-${key}`,
                    });
                    inst.on('change', ({ checked }) => {
                        options.ask = false;
                        options[key] = checked === true;
                        saveOptions();
                    });
                    partChecks.set(key, inst);
                    reusePartsSlot.appendChild(inst.el);
                }

                askCheck = MpiCheckbox.mount(reuseAskSlot, {
                    checked: options.ask === true,
                    label: 'Ask each time',
                    name: 'reuse-setting-ask',
                });
                askCheck.on('change', ({ checked }) => {
                    options.ask = checked === true;
                    saveOptions();
                });
                syncChecks();
            }

            if (reuseSourceSlot) {
                reuseSourceSlot.innerHTML = '';
                const sourceInst = MpiRadioGroup.mount(reuseSourceSlot, {
                    name: 'reuse-source-setting',
                    value: state.promptReuseSource === 'current' ? 'current' : 'original',
                    size: 'sm',
                    options: [
                        { label: 'Original', value: 'original' },
                        { label: 'Current', value: 'current' },
                    ],
                });
                sourceInst.on('select', ({ value }) => {
                    state.promptReuseSource = value === 'current' ? 'current' : 'original';
                });
                _syncReuseSource = (value) => {
                    sourceInst.el.setValue?.(value === 'current' ? 'current' : 'original');
                };
            }

            // ── ComfyUI root path ────────────────────────────────────────────
            const pathSlot = qs('#mpiSettingsComfyRootPathSlot', root);
            const browseSlot = qs('#mpiSettingsBrowseBtnSlot', root);
            if (pathSlot) {
                pathSlot.innerHTML = '';
                let saved = Storage.getComfyRootPath() || '';
                // Clear temp paths (legacy guard)
                if (saved.toLowerCase().includes('temp') || saved.toLowerCase().includes('tmp')) {
                    Storage.removeComfyRootPath();
                    saved = '';
                    _setComfyPath('');
                }

                const pathInst = MpiInput.mount(pathSlot, {
                    label: 'ComfyUI Models Path',
                    placeholder: 'Default (internal engine)',
                    value: saved,
                });
                pathInst.on('change', ({ value }) => {
                    if (value !== Storage.getComfyRootPath()) _setComfyPath(value);
                });

                // Hydrate from backend canonical store (extra_model_paths.yaml).
                // localStorage can be empty when install ran in different session
                // or got cleared; YAML on disk is source of truth.
                _hydrateComfyPath(pathInst);

                if (browseSlot) {
                    browseSlot.innerHTML = '';
                    const browseInst = MpiButton.mount(browseSlot, {
                        text: 'Browse',
                        variant: 'secondary',
                        size: 'sm',
                        extraClasses: 'mpi-settings__browse-btn',
                    });
                    browseInst.on('click', async () => {
                        try {
                            const folderPath = await _chooseFolder();
                            if (folderPath) {
                                const field = qs('.mpi-input__field', pathInst.el);
                                if (field) field.value = folderPath;
                                _setComfyPath(folderPath);
                            }
                        } catch (err) {
                            clientLogger.error('settings', '[MpiSettings] choose-folder failed', err);
                        }
                    });
                }
            }

            _hydrateExtraFolders(root);
            _initRunpodSection(root);
        }

        // ── RunPod Remote Engine section ────────────────────────────────────
        // Non-secret prefs live in state.runpodConfig (localStorage-mirrored);
        // the API key is write-only through secretsClient (secrets:* IPC).

        let _runpodAvailability = null; // { gpuTypes, dataCenters } cache per panel open
        let _runpodVolumes = null;      // network volumes from the user's account, or null
        let _engineConnectInst = null;  // Connect/Disconnect MpiButton instance
        let _engineStatusTimer = null;  // setInterval id for the status poll
        let _engineBusy = false;        // true while a start/stop is in flight
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

        // Reflect the latest known status on the button + label. `status` is the
        // /remote/comfy/status shape ({ running, ready }) or null when we have
        // not polled yet. Connect requires a picked GPU; once a Pod is running it
        // tracks the live readiness so the label flips to Disconnect.
        function _applyEngineStatus(root, status) {
            if (!_engineConnectInst) return;
            const cfg = _runpodCfg();
            if (!cfg.enabled) {
                _setEngineStatusText(root, 'disabled');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(true);
                return;
            }
            if (_engineBusy) return; // a create/delete is mid-flight in THIS panel; leave the label alone
            const ready = !!(status && status.ready);
            const running = !!(status && status.running);
            const connecting = !!(status && status.connecting);
            // A create/reconnect started elsewhere (or before this panel remounted)
            // — the backend's _connecting flag survives a panel close/reopen, so
            // honour it: disable Connect to prevent a duplicate create (the bug
            // where status read "stopped" + Connect enabled mid-create).
            if (connecting && !ready) {
                _setEngineStatusText(root, 'connecting…');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(true);
                return;
            }
            if (ready) {
                _setEngineStatusText(root, 'ready');
                _engineBtnLabelSet('Disconnect');
                _engineBtnDisabled(false);
            } else if (running) {
                _setEngineStatusText(root, 'creating…');
                _engineBtnLabelSet('Disconnect');
                _engineBtnDisabled(false);
            } else {
                // No Pod yet — Connect creates one, but only once a GPU AND a
                // network volume are picked (a volumeless Pod cannot persist
                // ComfyUI or models, so a volume is required, not optional).
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                _engineBtnDisabled(!cfg.gpuType || !cfg.volumeId);
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
        async function _pollEngineReady(onSlow, { timeoutMs = 1200000, intervalMs = 4000, slowAfterMs = 150000 } = {}) {
            const start = Date.now();
            let slowFired = false;
            while (Date.now() - start < timeoutMs) {
                if (!slowFired && Date.now() - start >= slowAfterMs) {
                    slowFired = true;
                    try { onSlow && onSlow(); } catch (_) { /* best-effort */ }
                }
                try {
                    const res = await fetch('/remote/comfy/status');
                    const s = res.ok ? await res.json() : null;
                    if (s && s.ready) return true;
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
            if (!cfg.volumeId) {
                _setEngineHint(root, 'Create or select a network volume first — it stores ComfyUI and your models.', true);
                return;
            }
            _engineBusy = true;
            _engineBtnDisabled(true);
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
            Events.emit('ui:info', { message: warm ? 'Connecting to your Pod…' : 'Creating a Pod…' });
            let _connectSucceeded = false; // MPI-73: resolves the 'connecting' phase
            try {
                const endpoint = warm ? '/remote/pod/reconnect' : '/remote/pod/create';
                const body = warm
                    ? { podId: cfg.podId, gpuTypeId: cfg.gpuType, volumeId: cfg.volumeId || null, datacenter: cfg.datacenter || null }
                    : { gpuTypeId: cfg.gpuType, volumeId: cfg.volumeId || null, datacenter: cfg.datacenter || null };
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
                    _setEngineHint(root, 'Your saved GPU is unavailable right now. Pick another card and Connect again.', true);
                    _setEngineStatusText(root, 'stopped');
                    _engineBtnLabelSet('Connect');
                    Events.emit('ui:warning', { message: 'Selected GPU unavailable — pick another.' });
                    return;
                }
                if (data.podId) {
                    // Track the app-managed podId (a recreate yields a new one).
                    state.runpodConfig = { ..._runpodCfg(), podId: data.podId };
                }
                // Create/resume refused outright (out of stock, API error) — no Pod.
                if (!res.ok || (!data.starting && !data.ready)) {
                    const msg = data.message || data.error || 'Could not connect to a Pod.';
                    const outOfStock = /not enough|unavailable|no .*available|out of stock|insufficient/i.test(msg);
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
                _setEngineStatusText(root, warm ? 'resuming…' : 'creating…');
                let _slowShown = false;
                const ready = await _pollEngineReady(() => {
                    if (_slowShown) return;
                    _slowShown = true;
                    _setEngineHint(root, 'First-time setup: downloading the engine and optimising it for your GPU (one time, a few minutes — much faster next time). Hang tight…');
                    Events.emit('ui:info', { message: 'Setting up the engine for your GPU (one time)…' });
                });
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
                // Wrapper health is ready (ComfyUI up), but the binary-preview WS
                // opens lazily at generation time — flipping to "ready" now lets the
                // user queue a job before the WS handshake, hanging it in STARTING
                // (MPI-73 Bug 1). Open the WS and gate "ready" on the real handshake.
                _setEngineStatusText(root, warm ? 'resuming…' : 'creating…');
                let _wsOk = false;
                try {
                    const { ComfyUIController } = await import('../../../../services/comfyController.js');
                    _wsOk = await ComfyUIController.ensureWsConnected();
                } catch (_) { /* fall through to the still-connecting notice */ }
                if (!_wsOk) {
                    _setEngineHint(root, 'Almost ready — finishing the connection to the engine. Give it a moment, then try generating.', true);
                    _setEngineStatusText(root, 'creating…');
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
                // — clear the pending-restart gate (comfyController._ensureRemoteReady
                // blocks generation while it is set; see MPI-64 B1).
                if (state.comfyNeedsRestart) state.comfyNeedsRestart = false;
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
                // Free local VRAM: a locally-running ComfyUI is redundant once
                // we generate remotely. Stop it (no-op if not running). It lazy-
                // starts again on the next LOCAL generation after Disconnect.
                fetch('/comfy/stop', { method: 'POST' }).catch(() => {});
            } catch (err) {
                _setEngineHint(root, 'Could not reach the Pod connect endpoint.', true);
                _setEngineStatusText(root, 'stopped');
                _engineBtnLabelSet('Connect');
                Events.emit('ui:warning', { message: 'Could not reach the Pod connect endpoint.' });
            } finally {
                _engineBusy = false;
                _engineBtnDisabled(false);
                // MPI-73: if the connect did NOT fully succeed (refused, timed out,
                // WS never handshook, threw), clear the transient 'connecting' phase
                // back to local · offline so the hero/status bar don't stay stuck.
                if (!_connectSucceeded) {
                    Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
                }
            }
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
                if (_engineBtnLabel === 'Disconnect') _openDisconnectChoice(root);
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

            const dcOptions = dcs
                .filter(dc => dc.storageSupport)
                .map(dc => {
                    const count = (dc.gpuAvailability || []).filter(g => g.available).length;
                    const mine = _volumeForDc(dc.id) ? ' · volume' : '';
                    return { value: dc.id, label: dc.name || dc.id, meta: `${count} GPUs${mine}` };
                });
            const dcInst = MpiDropdown.mount(dcSlot, {
                options: dcOptions,
                value: cfg.datacenter || '',
                placeholder: 'Select data center...',
                extraClasses: 'mpi-dropdown--runpod',
            });
            dcInst.on('change', async ({ value }) => {
                // DC drives the volume: adopt the cubric-vision volume in the new DC
                // (or None). gpuType cleared so the picker re-filters for the DC.
                const vol = _volumeForDc(value);
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

            const dc = dcs.find(d => d.id === cfg.datacenter);
            if (!dc) {
                gpuSlot.appendChild(ce('div', {
                    className: 'mpi-settings__empty-row',
                    textContent: 'Pick a data center first.',
                }));
                return;
            }
            const gpuOptions = _buildGpuOptions(dc.id);
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
        }

        // Build the GPU picker options for a data center from the current
        // _runpodAvailability snapshot (stock-led meta, $/hr, ranked High→Low).
        function _buildGpuOptions(dcId) {
            const dcs = _runpodAvailability?.dataCenters || [];
            const gpus = _runpodAvailability?.gpuTypes || [];
            const dc = dcs.find(d => d.id === dcId);
            if (!dc) return [];
            const availMap = new Map(
                (dc.gpuAvailability || [])
                    .filter(g => g.available)
                    .map(g => [g.gpuTypeId, g.stockStatus])
            );
            // Stock leads the meta so it survives truncation in narrow panels.
            // N/A mirrors the RunPod console's label for unrated stock.
            return gpus
                .filter(g => g.secureCloud && availMap.has(g.id))
                .map(g => {
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
                    return {
                        value: g.id,
                        label: g.displayName || g.id,
                        meta: `${stock || 'N/A'} · ${g.memoryInGb}GB VRAM${ram}${price}`,
                        _rank: _stockRank[stock] || 0,
                    };
                })
                .sort((a, b) => b._rank - a._rank);
        }

        // Availability URL, scoped to the selected DC so GPU RAM (lowestPrice) is
        // per-DC accurate instead of a global floor. No DC yet -> global fallback.
        function _availabilityUrl() {
            const dcId = _runpodCfg().datacenter;
            return dcId
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

        async function _initRunpodSection(root) {
            const toggleSlot = qs('#mpiSettingsRunpodToggleSlot', root);
            const body = qs('#mpiSettingsRunpodBody', root);
            if (!toggleSlot || !body) return;

            const cfg = _runpodCfg();
            const syncBodyVisibility = (enabled) => {
                body.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
            };
            syncBodyVisibility(cfg.enabled);

            toggleSlot.innerHTML = '';
            const toggleInst = MpiCheckbox.mount(toggleSlot, {
                checked: cfg.enabled,
                label: 'Enable RunPod remote engine',
            });
            toggleInst.on('change', async ({ checked }) => {
                const next = { ..._runpodCfg(), enabled: checked === true };
                state.runpodConfig = next;
                syncBodyVisibility(next.enabled);
                await _pushRemoteMode(next);
                _refreshEngineConnect(root);
                if (next.enabled && !_runpodAvailability && await secretsClient.hasApiKey()) {
                    _loadRunpodAvailability(root);
                }
            });

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
                    label: 'RunPod API Key',
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
                const dqInst = MpiCheckbox.mount(deleteOnQuitSlot, {
                    checked: cfg.deleteOnQuit === true,
                    label: 'Delete Pod on quit',
                });
                dqInst.on('change', async ({ checked }) => {
                    const next = { ..._runpodCfg(), deleteOnQuit: checked === true };
                    state.runpodConfig = next;
                    await _pushRemoteMode(next);
                });
            }

            // ── Initial status + availability ────────────────────────────────
            if (!secretsClient.isAvailable()) {
                _setRunpodStatus(root, 'RunPod settings require the desktop app.');
                _renderRunpodPickers(root);
                return;
            }
            const has = await secretsClient.hasApiKey();
            _setRunpodStatus(root, has ? 'API key is saved.' : 'No API key saved.');
            if (has && cfg.enabled) _loadRunpodAvailability(root);
            else _renderRunpodPickers(root);
        }

        _unsubs.push(Events.onState('promptReuseOptions', (value) => {
            _syncReuseControls?.(value);
        }));
        _unsubs.push(Events.onState('promptReuseSource', (value) => {
            _syncReuseSource?.(value);
        }));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _clearExtraFolderControls();
            if (_engineStatusTimer) { clearInterval(_engineStatusTimer); _engineStatusTimer = null; }
            _engineConnectInst?.destroy?.();
            _engineConnectInst = null;
        };

        async function _hydrateComfyPath(pathInst) {
            try {
                const res = await fetch('/comfy/get-path');
                const data = await res.json();
                if (!data.success || !data.path) return;
                const canonical = data.path;
                const local = Storage.getComfyRootPath() || '';
                if (canonical !== local) {
                    Storage.setComfyRootPath(canonical);
                    state.comfyRootPath = canonical;
                    const field = qs('.mpi-input__field', pathInst.el);
                    if (field) field.value = canonical;
                    _renderExtraFolders(el);
                }
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] hydrate comfy path failed', err);
            }
        }

        async function _setComfyPath(path) {
            Storage.setComfyRootPath(path);
            state.comfyRootPath = path;
            _renderExtraFolders(el);
            try {
                const res = await fetch('/comfy/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path }),
                });
                const data = await res.json();
                if (!data.success) {
                    clientLogger.error('settings', '[MpiSettings] Failed to sync ComfyUI path', data.error);
                    return;
                }
                // Re-sync installed models against the NEW root so MODELS[].installed
                // reflects what is present at the changed path. Without this, the
                // in-memory flags stay stale and opening a project shows a false
                // "no models installed" popup until some other surface re-syncs.
                await reSyncInstalledModels();
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] Error syncing ComfyUI path', err);
            }
        }

        async function _hydrateExtraFolders(root) {
            try {
                const res = await fetch('/comfy/extra-folders');
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Failed to load extra folders');
                _extraFolders = {
                    loras: Array.isArray(data.folders?.loras) ? data.folders.loras : [],
                    upscale_models: Array.isArray(data.folders?.upscale_models) ? data.folders.upscale_models : [],
                };
                _renderExtraFolders(root);
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] hydrate extra folders failed', err);
            }
        }

        function _clearExtraFolderControls() {
            while (_extraFolderControls.length) {
                _extraFolderControls.pop()?.destroy?.();
            }
        }

        function _primaryFolderLabel(bucket) {
            const rootPath = state.comfyRootPath || Storage.getComfyRootPath() || '';
            if (!rootPath) return `Default internal engine models/${bucket}`;
            // Join with the root's own separator; trim any trailing slash/backslash
            // so we never produce mixed separators like "…/mpi_models/\loras".
            const trimmed = rootPath.replace(/[\\/]+$/, '');
            const sep = trimmed.includes('\\') ? '\\' : '/';
            return `${trimmed}${sep}${bucket}`;
        }

        function _renderPrimaryFolder(root, bucket, slotId, label) {
            const slot = qs(slotId, root);
            if (!slot) return;
            slot.innerHTML = '';
            const inst = MpiInput.mount(slot, {
                label,
                value: _primaryFolderLabel(bucket),
                readonly: true,
            });
            _extraFolderControls.push(inst);
        }

        function _renderExtraFolders(root) {
            _clearExtraFolderControls();
            _renderPrimaryFolder(root, 'loras', '#mpiSettingsLoraPrimarySlot', 'Primary LoRA folder');
            _renderPrimaryFolder(root, 'upscale_models', '#mpiSettingsUpscalePrimarySlot', 'Primary upscale folder');
            _renderExtraFolderBucket(root, 'loras', '#mpiSettingsLoraFoldersSlot', '#mpiSettingsAddLoraFolderSlot');
            _renderExtraFolderBucket(root, 'upscale_models', '#mpiSettingsUpscaleFoldersSlot', '#mpiSettingsAddUpscaleFolderSlot');
            _renderDropZones(root, 'loras', '#mpiSettingsLoraDropSlot');
            _renderDropZones(root, 'upscale_models', '#mpiSettingsUpscaleDropSlot');
        }

        /**
         * Render one MpiFolderDrop per CONFIGURED folder (primary + extras),
         * sourced from /comfy/model-folders so the absolute paths match the
         * import route's allow-list exactly. Dropping a model file copies it in
         * and refreshes the picker asset lists.
         */
        async function _renderDropZones(root, bucket, slotId) {
            const slot = qs(slotId, root);
            if (!slot) return;
            slot.innerHTML = '';
            let folders = [];
            try {
                const res = await fetch(`/comfy/model-folders?bucket=${bucket}`);
                const data = await res.json();
                folders = data.success ? (data.folders || []) : [];
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] model-folders fetch failed', err);
                return;
            }
            folders.forEach(({ path: folderPath, primary }) => {
                const inst = MpiFolderDrop.mount(ce('div'), {
                    folderPath,
                    bucket,
                    primary,
                    onImport: (filename) => {
                        Events.emit('ui:success', { message: `Imported ${filename}.` });
                        loadAssets();
                    },
                });
                slot.appendChild(inst.el);
                _extraFolderControls.push(inst);
            });
        }

        function _renderExtraFolderBucket(root, bucket, listSelector, addSelector) {
            const list = qs(listSelector, root);
            const addSlot = qs(addSelector, root);
            if (!list || !addSlot) return;

            list.innerHTML = '';
            addSlot.innerHTML = '';

            const addBtn = MpiButton.mount(addSlot, {
                icon: 'plus',
                label: 'Add',
                size: 'sm',
                variant: 'secondary',
                extraClasses: 'mpi-settings__extra-folder-add',
            });
            addBtn.on('click', () => _addExtraFolder(bucket));
            _extraFolderControls.push(addBtn);

            const folders = _extraFolders[bucket] || [];
            if (!folders.length) {
                list.appendChild(ce('div', { className: 'mpi-settings__empty-row', textContent: 'No extra folders configured.' }));
                return;
            }

            folders.forEach((folderPath, index) => {
                const row = ce('div', { className: 'mpi-settings__extra-folder-row' });
                const inputSlot = ce('div', { className: 'mpi-settings__folder-input' });
                const browseSlot = ce('div');
                const removeSlot = ce('div');
                const input = MpiInput.mount(inputSlot, {
                    value: folderPath,
                    readonly: true,
                });
                const browseBtn = MpiButton.mount(browseSlot, {
                    text: 'Browse',
                    size: 'sm',
                    variant: 'secondary',
                    extraClasses: 'mpi-settings__extra-folder-browse',
                });
                const removeBtn = MpiButton.mount(removeSlot, {
                    icon: 'minus',
                    size: 'sm',
                    variant: 'secondary',
                    extraClasses: 'mpi-settings__extra-folder-remove',
                    info: 'Remove folder',
                });
                browseBtn.on('click', () => _replaceExtraFolder(bucket, index));
                removeBtn.on('click', () => _removeExtraFolder(bucket, index));
                row.appendChild(inputSlot);
                row.appendChild(browseBtn.el);
                row.appendChild(removeBtn.el);
                list.appendChild(row);
                _extraFolderControls.push(input, browseBtn, removeBtn);
            });
        }

        async function _chooseFolder() {
            if (_ipcRenderer) {
                const data = await _ipcRenderer.invoke('choose-folder');
                return data?.cancelled ? null : (data?.path || null);
            }

            const res = await fetch('/choose-folder', { method: 'POST' });
            const data = await res.json();
            return data?.cancelled ? null : (data?.path || null);
        }

        function _dedupeFolders(paths) {
            const seen = new Set();
            return paths.filter(folderPath => {
                const key = String(folderPath || '').trim().toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        async function _addExtraFolder(bucket) {
            try {
                const folderPath = await _chooseFolder();
                if (!folderPath) return;
                _extraFolders = {
                    ..._extraFolders,
                    [bucket]: _dedupeFolders([ ...(_extraFolders[bucket] || []), folderPath ]),
                };
                await _saveExtraFolders();
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] add extra folder failed', err);
                Events.emit('ui:error', { message: err.message || 'Failed to add extra model folder.' });
            }
        }

        async function _removeExtraFolder(bucket, index) {
            try {
                _extraFolders = {
                    ..._extraFolders,
                    [bucket]: (_extraFolders[bucket] || []).filter((_, i) => i !== index),
                };
                await _saveExtraFolders();
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] remove extra folder failed', err);
                Events.emit('ui:error', { message: err.message || 'Failed to remove extra model folder.' });
            }
        }

        async function _replaceExtraFolder(bucket, index) {
            try {
                const folderPath = await _chooseFolder();
                if (!folderPath) return;
                const folders = [ ...(_extraFolders[bucket] || []) ];
                folders[index] = folderPath;
                _extraFolders = {
                    ..._extraFolders,
                    [bucket]: _dedupeFolders(folders),
                };
                await _saveExtraFolders();
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] replace extra folder failed', err);
                Events.emit('ui:error', { message: err.message || 'Failed to update extra model folder.' });
            }
        }

        async function _saveExtraFolders() {
            const res = await fetch('/comfy/extra-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(_extraFolders),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to save extra folders');
            _extraFolders = {
                loras: Array.isArray(data.folders?.loras) ? data.folders.loras : [],
                upscale_models: Array.isArray(data.folders?.upscale_models) ? data.folders.upscale_models : [],
            };
            _renderExtraFolders(el);
            await loadAssets();
        }
    },
});
