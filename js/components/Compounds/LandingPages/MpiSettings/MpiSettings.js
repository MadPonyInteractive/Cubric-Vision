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

// MPI-110: does a Pod create refusal message mean "out of stock / no host could
// place it" (retryable → hand off to the auto-retry wait) vs. a real failure?
// Mirrors `_isStockRefusal` in shell.js — RunPod returns several wordings for the
// same stock condition, notably "does not have the resources to deploy your pod"
// on a scarce card (RTX 5090), which the older narrower pattern missed, so the
// refusal dead-ended to a toast instead of re-entering the wait. Keep in sync.
function _isStockRefusal(msg) {
    return /not enough|unavailable|no .*available|out of stock|insufficient|does not have the resources|no longer any instances|try a different machine|no instances? available|something went wrong|try again later/i
        .test(msg || '');
}

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
                        <div class="mpi-settings__checkbox-slot" id="mpiSettingsPlayAudioOnHoverSlot"></div>
                        <span class="mpi-settings__hint">Hovering a video or audio card in the gallery plays its sound. Turn off for silent hover.</span>
                    </div>
                    <div class="mpi-settings__form-group">
                        <label class="mpi-settings__field-label">Desktop Notifications</label>
                        <div class="mpi-settings__checkbox-slot" id="mpiSettingsNotifyGenerationSlot"></div>
                        <div class="mpi-settings__checkbox-slot" id="mpiSettingsNotifyDownloadsSlot"></div>
                        <span class="mpi-settings__hint">Show an OS notification when these finish (only while the app is in the background). In-app messages are unaffected.</span>
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
                        <span class="mpi-settings__hint">Your RunPod account, API key, GPU billing, and storage billing are your responsibility, not Cubric's.</span>
                        <span class="mpi-settings__hint">Makes the RunPod cloud GPU panel available. Generation runs on your local engine until you Connect. GPU and storage billing happen on your RunPod account.</span>
                    </div>
                    <div class="mpi-settings__form-group mpi-settings__runpod-suboption" id="mpiSettingsRunpodAutoConnectGroup">
                        <div id="mpiSettingsRunpodAutoConnectSlot"></div>
                        <span class="mpi-settings__hint">Leave this off unless you want a billed Pod to start automatically when the app launches.</span>
                        <span class="mpi-settings__hint">When enabled, the app connects (and starts billing) a Pod automatically at launch. Off by default — start local, Connect when you want cloud generation.</span>
                    </div>
                    <div class="mpi-settings__form-group mpi-settings__runpod-suboption" id="mpiSettingsRunpodAutoRetryGroup">
                        <div id="mpiSettingsRunpodAutoRetrySlot"></div>
                        <span class="mpi-settings__hint">Pick the exact GPU you want — even if it's out of stock right now — and Connect keeps checking until it frees, then connects. You can keep working locally while it waits.</span>
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
                            <span class="mpi-settings__hint">Stopped Pods still leave volume storage billing on your RunPod account until you delete the volume.</span>
                            <span class="mpi-settings__hint">Stores your models so they survive between Pods — one volume per data center. Connect attaches it to the new Pod.</span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">GPU</label>
                            <div id="mpiSettingsRunpodGpuSlot"></div>
                            <span class="mpi-settings__hint">Community Cloud is unsupported for Cubric's remote engine.</span>
                            <span class="mpi-settings__hint">Secure Cloud only. Stock is a live hint (High / Medium / Low / N/A) — availability drifts; the RunPod console is ground truth.</span>
                        </div>
                        <div class="mpi-settings__form-group">
                            <div class="mpi-settings__runpod-connect-row">
                                <span class="mpi-settings__runpod-status" id="mpiSettingsRunpodEngineStatus">Remote engine: —</span>
                                <div id="mpiSettingsRunpodConnectSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsRunpodConnectHint"></span>
                            <a class="mpi-settings__runpod-console-link" id="mpiSettingsRunpodConsoleLink" href="https://console.runpod.io/pods" target="_blank" rel="noopener noreferrer">Open in RunPod console</a>
                            <span class="mpi-settings__hint">Check Pod state, telemetry, logs, and spend on RunPod. Opens the active Pod when connected, otherwise your Pods list.</span>
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

            // ── Play audio on hover checkbox ─────────────────────────────────
            const hoverAudioSlot = qs('#mpiSettingsPlayAudioOnHoverSlot', root);
            if (hoverAudioSlot) {
                hoverAudioSlot.innerHTML = '';
                MpiCheckbox.mount(hoverAudioSlot, {
                    checked: Storage.getPlayAudioOnHover(),
                    label: 'Play audio on hover',
                }).on('change', ({ checked }) =>
                    Storage.setPlayAudioOnHover(checked));
            }

            // ── Desktop notification prefs (per-type OS opt-out) ─────────────
            const notifyGenSlot = qs('#mpiSettingsNotifyGenerationSlot', root);
            const notifyDlSlot = qs('#mpiSettingsNotifyDownloadsSlot', root);
            const _saveNotifyPref = (key, checked) => {
                state.notificationPrefs = { ...state.notificationPrefs, [key]: checked === true };
            };
            if (notifyGenSlot) {
                notifyGenSlot.innerHTML = '';
                MpiCheckbox.mount(notifyGenSlot, {
                    checked: state.notificationPrefs?.generation !== false,
                    label: 'Generation complete',
                }).on('change', ({ checked }) => _saveNotifyPref('generation', checked));
            }
            if (notifyDlSlot) {
                notifyDlSlot.innerHTML = '';
                MpiCheckbox.mount(notifyDlSlot, {
                    checked: state.notificationPrefs?.downloads !== false,
                    label: 'Download complete',
                }).on('change', ({ checked }) => _saveNotifyPref('downloads', checked));
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
        let _connectAbort = false;      // MPI-86: set by Cancel to break the in-flight connect poll
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

        // Reflect the latest known status on the button + label. `status` is the
        // /remote/comfy/status shape ({ running, ready }) or null when we have
        // not polled yet. Connect requires a picked GPU; once a Pod is running it
        // tracks the live readiness so the label flips to Disconnect.
        function _applyEngineStatus(root, status) {
            if (!_engineConnectInst) return;
            const cfg = _runpodCfg();
            _setConsoleLinkHref(root);
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
            Events.emit('ui:info', { message: warm ? 'Connecting to your Pod…' : 'Creating a Pod…' });
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
                const body = warm
                    ? { podId: cfg.podId, gpuTypeId: cfg.gpuType, volumeId, datacenter, containerDiskGb }
                    : { gpuTypeId: cfg.gpuType, volumeId, datacenter, containerDiskGb };
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
                    const outOfStock = _isStockRefusal(msg);
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
                if (!_connectSucceeded) {
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
            // The auto-connect sub-option (MPI-85) sits between the Enable toggle and
            // the body; show/hide it with the body so it only appears when enabled.
            const autoConnectGroup = qs('#mpiSettingsRunpodAutoConnectGroup', root);
            const autoRetryGroup = qs('#mpiSettingsRunpodAutoRetryGroup', root);
            const syncBodyVisibility = (enabled) => {
                body.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
                autoConnectGroup?.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
                autoRetryGroup?.classList.toggle('mpi-settings__runpod-body--hidden', !enabled);
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

            // ── Auto-connect on app start (MPI-85) ───────────────────────────
            // Owns the boot auto-connect lifecycle, decoupled from `enabled`. Default
            // OFF so a relaunch never spins a billed Pod by surprise. Persist-only —
            // boot reads it via Storage.getRunpodConfig(); no remote-mode push here.
            const autoConnectSlot = qs('#mpiSettingsRunpodAutoConnectSlot', root);
            if (autoConnectSlot) {
                autoConnectSlot.innerHTML = '';
                const acInst = MpiCheckbox.mount(autoConnectSlot, {
                    checked: cfg.autoConnectOnStart === true,
                    label: 'Automatically connect on app start',
                });
                acInst.on('change', ({ checked }) => {
                    state.runpodConfig = { ..._runpodCfg(), autoConnectOnStart: checked === true };
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
                const arInst = MpiCheckbox.mount(autoRetrySlot, {
                    checked: cfg.autoRetry === true,
                    label: 'Auto-retry connection (wait for an out-of-stock GPU)',
                });
                arInst.on('change', ({ checked }) => {
                    state.runpodConfig = { ..._runpodCfg(), autoRetry: checked === true };
                    // Re-list GPUs so out-of-stock cards appear/disappear immediately.
                    _renderRunpodPickers(root);
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
        // MPI-110: the shell-owned auto-retry wait flips `remoteWaitGpu` when it
        // starts/ends (won → create, or cancelled). Repaint the engine button so the
        // panel tracks it — e.g. wait ends → drop "waiting…" → next status poll paints
        // connecting/stopped. Re-derives from the last known status (null = re-poll).
        _unsubs.push(Events.onState('remoteWaitGpu', () => {
            const r = qs('.mpi-settings', el) || el;
            _applyEngineStatus(r, null);
            if (!_isWaiting()) _pollEngineStatus(r);
        }));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _clearExtraFolderControls();
            if (_engineStatusTimer) { clearInterval(_engineStatusTimer); _engineStatusTimer = null; }
            // MPI-86: break any in-flight _pollEngineReady loop so it doesn't keep
            // fetching after the panel unmounts. The Pod is left booting on purpose
            // (backend _starting tracks it; the idle watchdog backstops) — destroy is
            // not a Cancel, so it must not delete a Pod the user may still want.
            _connectAbort = true;
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
                // ComfyUI only reads extra_model_paths.yaml at startup, so a running
                // process still has the OLD (empty) checkpoint list after a path
                // change → generation fails with "ckpt_name not in []". Flag a
                // restart so comfyController restarts ComfyUI and it re-scans the
                // new root. Reuses the same mechanism as custom-node installs. (MPI-118)
                state.comfyNeedsRestart = true;
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
