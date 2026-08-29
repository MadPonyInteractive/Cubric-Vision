import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiProgressBar } from '../../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiLevelMeter, meterAnalyser } from '../../../Primitives/MpiLevelMeter/MpiLevelMeter.js';
import { MpiFolderDrop } from '../../../Primitives/MpiFolderDrop/MpiFolderDrop.js';
import { MpiRunpodSettings } from '../MpiRunpodSettings/MpiRunpodSettings.js';
import { state } from '../../../../state.js';
import { Events } from '../../../../events.js';
import { Storage } from '../../../../core/storage.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { loadAll as loadAssets } from '../../../../services/assetService.js';
import { reSyncInstalledModels } from '../../../../data/modelRegistry.js';
import { getPendingUpdate, runUpdate } from '../../../../services/updateChecker.js';
import { ce, qs } from '../../../../utils/dom.js';

const REUSE_PARTS = [
    { key: 'prompt', label: 'Use Prompt' },
    { key: 'settings', label: 'Use Settings' },
    { key: 'model', label: 'Use Model' },
    { key: 'images', label: 'Use Images' },
    { key: 'video', label: 'Use Video' },
    { key: 'audio', label: 'Use Audio' },
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
                <!-- MPI-629: first section on purpose, and present ONLY while an
                     update is due. Nothing to check, nothing to configure — if it is
                     here there is a newer version, and this is the way to get it. -->
                <section class="mpi-settings__section" id="mpiSettingsUpdateSection" hidden>
                    <h3 class="mpi-settings__section-title">Update</h3>
                    <div class="mpi-settings__plate mpi-settings__plate--on">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">A new version is available</span>
                            <span class="mpi-settings__plate-desc" id="mpiSettingsUpdateDesc"></span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsUpdateSlot"></div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">App Behavior</h3>
                    <div class="mpi-settings__plate" id="mpiSettingsAutoStartPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Auto-start ComfyUI on launch</span>
                            <span class="mpi-settings__plate-desc">Start the generation engine as soon as the app opens.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsAutoStartSlot"></div>
                    </div>
                    <div class="mpi-settings__plate" id="mpiSettingsRecycleBinPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Uninstall to the Recycle Bin</span>
                            <span class="mpi-settings__plate-desc">Off, uninstalling deletes a model's files for good. On, they are recoverable from the bin, but the disk space comes back only when you empty it &mdash; and a weight over the bin's quota is deleted anyway. Models on a remote Pod are always deleted.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsRecycleBinSlot"></div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">Desktop Notifications</h3>
                    <div class="mpi-settings__plate" id="mpiSettingsNotifyGenerationPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Generation complete</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsNotifyGenerationSlot"></div>
                    </div>
                    <div class="mpi-settings__plate" id="mpiSettingsNotifyDownloadsPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Download complete</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsNotifyDownloadsSlot"></div>
                    </div>
                    <div class="mpi-settings__plate" id="mpiSettingsNotifyConnectionPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Pod connected</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsNotifyConnectionSlot"></div>
                    </div>
                    <div class="mpi-settings__plate" id="mpiSettingsToastSoundPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Play sound on notification</span>
                            <span class="mpi-settings__plate-desc">Fires only while the app is in the background. In-app messages are unaffected.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsToastSoundSlot"></div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">Display</h3>
                    <div class="mpi-settings__plate" id="mpiSettingsFloatLatentPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Floating latents when minimized</span>
                            <span class="mpi-settings__plate-desc">Show a small always-on-top window with the live latents while the app is minimized. Close it with the X, or click a preview to reopen the app.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsFloatLatentSlot"></div>
                    </div>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Pixel rendering</span>
                            <span class="mpi-settings__plate-desc">Auto shows individual pixels past 300% zoom. Pixel-perfect always shows pixels; Smooth never does.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsPixelModeSlot"></div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">Audio Input</h3>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Microphone</span>
                            <span class="mpi-settings__plate-desc">Used by the Record button on any audio slot.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsAudioDeviceSlot"></div>
                    </div>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Input gain</span>
                            <span class="mpi-settings__plate-desc">Boost a quiet microphone. Test below and keep peaks out of the red — above 0 dB the recording is clipped.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl mpi-settings__audio-gain">
                            <div class="mpi-settings__audio-gain-slider" id="mpiSettingsAudioGainSlot"></div>
                            <span class="mpi-settings__audio-gain-value" id="mpiSettingsAudioGainValue">0.0 dB</span>
                        </div>
                    </div>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Test microphone</span>
                            <span class="mpi-settings__plate-desc">Watch the level while you speak. Peaks reaching the amber are healthy; red is distortion.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl mpi-settings__audio-test">
                            <div id="mpiSettingsAudioTestSlot"></div>
                            <div class="mpi-settings__audio-test-meter" id="mpiSettingsAudioMeterSlot"></div>
                        </div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">Reuse Prompt</h3>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Copied on reuse</span>
                            <span class="mpi-settings__plate-desc">Choose what carries over when Reuse Prompt is clicked.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl mpi-settings__reuse-grid" id="mpiSettingsReusePartsSlot"></div>
                    </div>
                    <div class="mpi-settings__plate" id="mpiSettingsReuseAskPlate">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Ask each time</span>
                            <span class="mpi-settings__plate-desc">Prompt for what to reuse on every click.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsReuseAskSlot"></div>
                    </div>
                    <div class="mpi-settings__plate mpi-settings__plate--stack">
                        <div class="mpi-settings__plate-main">
                            <span class="mpi-settings__plate-label">Gallery reuse source</span>
                            <span class="mpi-settings__plate-desc">Original uses the first reusable generation in a card. Current uses the selected gallery entry.</span>
                        </div>
                        <div class="mpi-settings__plate-ctrl" id="mpiSettingsReuseSourceSlot"></div>
                    </div>
                </section>

                <section class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">External Connections</h3>
                    <div class="mpi-settings__subgroup">
                        <span class="mpi-settings__subgroup-title">ComfyUI Models Path</span>
                        <div class="mpi-settings__form-group">
                            <div class="mpi-settings__folder-row">
                                <div id="mpiSettingsComfyRootPathSlot" class="mpi-settings__folder-input"></div>
                                <div id="mpiSettingsBrowseBtnSlot"></div>
                            </div>
                            <span class="mpi-settings__hint">Optional: point Cubric at an existing external ComfyUI models folder. Leave blank to use the internal engine.</span>
                        </div>
                    </div>
                    <div class="mpi-settings__subgroup">
                        <div class="mpi-settings__extra-folder-head">
                            <span class="mpi-settings__subgroup-title">LoRA folders</span>
                            <div id="mpiSettingsAddLoraFolderSlot"></div>
                        </div>
                        <div id="mpiSettingsLoraPrimarySlot"></div>
                        <div class="mpi-settings__extra-folder-list" id="mpiSettingsLoraFoldersSlot"></div>
                        <div class="mpi-settings__drop-zones" id="mpiSettingsLoraDropSlot"></div>
                    </div>
                    <div class="mpi-settings__subgroup">
                        <div class="mpi-settings__extra-folder-head">
                            <span class="mpi-settings__subgroup-title">Upscale-model folders</span>
                            <div id="mpiSettingsAddUpscaleFolderSlot"></div>
                        </div>
                        <div id="mpiSettingsUpscalePrimarySlot"></div>
                        <div class="mpi-settings__extra-folder-list" id="mpiSettingsUpscaleFoldersSlot"></div>
                        <div class="mpi-settings__drop-zones" id="mpiSettingsUpscaleDropSlot"></div>
                    </div>
                    <span class="mpi-settings__hint">Extra folders are read-only and additive — Cubric reads models from them but only installs, updates, and removes files in the primary managed folder (the first row in each group).</span>
                </section>

                <div id="mpiSettingsRunpodMount"></div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];
        let _syncReuseControls = null;
        let _syncReuseSource = null;
        let _extraFolders = { loras: [], upscale_models: [] };
        // Live mic-test handles (MPI-573). Null whenever the test is off.
        let _monitor = null;
        let _testMeter = null;
        // Closing the slide-over destroys this component, and a mic left open keeps the
        // OS recording indicator lit long after the panel is gone. Registered once at
        // setup, not per open — the panel re-inits its fields on every open.
        _unsubs.push(() => _stopMicTest());
        const _extraFolderControls = [];
        let _ipcRenderer = null;

        try {
            if (typeof window.require === 'function') {
                _ipcRenderer = window.require('electron')?.ipcRenderer || null;
            }
        } catch (err) {
            clientLogger.warn('settings', '[MpiSettings] Electron IPC unavailable for folder picker', err);
        }

        // RunPod Remote Engine section — own Compound since MPI-177; mounted once
        // here, onOpen forwarded so it re-inits with fresh values on every open.
        const _runpodInst = MpiRunpodSettings.mount(qs('#mpiSettingsRunpodMount', el), {});

        // Called by MpiSlideOver each time panel opens — re-init fields with fresh values.
        el.onOpen = () => { _initFields(el); _runpodInst?.el?.onOpen?.(); };

        /**
         * Mount a right-aligned toggle switch into a plate's ctrl slot and keep
         * the plate's --on heat outline in sync with the switch state. The plate
         * is the slot's closest .mpi-settings__plate ancestor. Returns the inst.
         */
        function _mountSwitchPlate(slotId, checked, onChange) {
            const slot = qs(slotId, el);
            if (!slot) return null;
            slot.innerHTML = '';
            const plate = slot.closest('.mpi-settings__plate');
            const syncOn = (v) => plate?.classList.toggle('mpi-settings__plate--on', v === true);
            const inst = MpiCheckbox.mount(slot, { checked: checked === true, variant: 'switch' });
            syncOn(checked === true);
            inst.on('change', ({ checked: v }) => { syncOn(v); onChange(v); });
            return inst;
        }

        /**
         * Microphone device + input gain (MPI-573).
         *
         * `enumerateDevices` only returns real device LABELS once the page holds a
         * media permission — before that every entry comes back as an empty string,
         * which would render a list of identical blank rows. So the list falls back
         * to "System default" alone until the user has recorded once and granted it;
         * the recorder itself works on the default device meanwhile.
         *
         * The stored id is deliberately NOT validated against the list on load: a
         * device unplugged today is usually back tomorrow, and clearing the setting
         * silently would lose a choice the user made. `getUserMedia` asks with
         * `ideal`, so a missing device degrades to the default instead of throwing.
         */
        async function _initAudioInput(root) {
            const deviceSlot = qs('#mpiSettingsAudioDeviceSlot', root);
            const gainSlot = qs('#mpiSettingsAudioGainSlot', root);

            // The slider is in dB, the stored value stays the linear multiplier every
            // consumer already reads. A linear 0.5–4x scale spends three quarters of
            // its travel above unity, so the useful part is unusably cramped; dB is
            // how the number is thought about anyway, and it is what the meter reads.
            const gainValueEl = qs('#mpiSettingsAudioGainValue', root);
            const _showGainDb = (db) => {
                if (gainValueEl) gainValueEl.textContent = `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
            };
            if (gainSlot) {
                gainSlot.innerHTML = '';
                const startDb = 20 * Math.log10(Storage.getAudioInputGain() || 1);
                _showGainDb(startDb);
                const gainInst = MpiProgressBar.mount(gainSlot, {
                    min: -6, max: 12, step: 0.5,
                    value: Math.max(-6, Math.min(12, startDb)),
                    interactive: true, handle: true,
                    info: 'Input gain: {value} dB',
                });
                gainInst.on('input', ({ value }) => {
                    _showGainDb(value);
                    // Live, not on release: the whole point of the test below is to
                    // hear the slider move the meter as you drag it.
                    const linear = 10 ** (value / 20);
                    if (_monitor) _monitor.gain.gain.value = linear;
                });
                gainInst.on('change', ({ value }) => Storage.setAudioInputGain(10 ** (value / 20)));
            }

            _initMicTest(root);

            if (!deviceSlot) return;
            deviceSlot.innerHTML = '';
            let inputs = [];
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                inputs = devices.filter(d => d.kind === 'audioinput' && d.label);
            } catch (err) {
                clientLogger.warn('settings', `[MpiSettings] enumerateDevices failed: ${err?.message || err}`);
            }
            const deviceInst = MpiDropdown.mount(deviceSlot, {
                options: [
                    { label: 'System default', value: '' },
                    ...inputs.map(d => ({ label: d.label, value: d.deviceId })),
                ],
                value: Storage.getAudioInputDevice(),
                placeholder: 'System default',
            });
            deviceInst.on('change', ({ value }) => Storage.setAudioInputDevice(value));
            // A device change mid-test would keep metering the OLD mic, which reads as
            // the new one being dead. Drop the monitor and let the user press again.
            deviceInst.on('change', () => _stopMicTest());
        }

        /**
         * The mic test (MPI-573): a toggling button and a live meter.
         *
         * An input-gain slider with nothing to check it against is a guess — the user
         * turns it up, records, and finds out afterwards. This is the check, and it
         * runs the SAME graph the recorder does (source → gain → analyser) so the
         * level shown here is the level that will be written.
         *
         * Nothing is connected to the destination on purpose: an open mic monitored
         * through the speakers is a feedback loop, and this answers "am I being
         * heard, and how hot" without needing to be audible.
         */
        function _initMicTest(root) {
            const btnSlot = qs('#mpiSettingsAudioTestSlot', root);
            const meterSlot = qs('#mpiSettingsAudioMeterSlot', root);
            if (!btnSlot || !meterSlot) return;

            // The panel re-inits on every open; a monitor from the last one would be
            // metering into an element that is about to be replaced.
            _stopMicTest();
            btnSlot.innerHTML = '';
            meterSlot.innerHTML = '';
            _testMeter = MpiLevelMeter.mount(meterSlot, { orientation: 'horizontal' });
            const testBtn = MpiButton.mount(btnSlot, {
                icon: 'mic', label: 'Test', variant: 'secondary', size: 'sm',
                toggleable: true,
            });

            testBtn.on('click', async () => {
                if (_monitor) { _stopMicTest(); return; }
                const deviceId = Storage.getAudioInputDevice();
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: deviceId ? { deviceId: { ideal: deviceId } } : true,
                    });
                } catch (err) {
                    clientLogger.warn('settings', `[MpiSettings] mic test failed: ${err?.name || err}`);
                    testBtn.el.setActive?.(false);
                    return;
                }
                const ctx = new AudioContext();
                const gain = ctx.createGain();
                gain.gain.value = Storage.getAudioInputGain();
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 1024;
                ctx.createMediaStreamSource(stream).connect(gain);
                gain.connect(analyser);
                _monitor = { stream, ctx, gain, btn: testBtn, stop: meterAnalyser(analyser, _testMeter.el) };
            });
        }

        /** Drop the test mic. Idempotent — toggle, device change and teardown all call it. */
        function _stopMicTest() {
            if (!_monitor) return;
            _monitor.stop();
            _monitor.stream.getTracks().forEach(t => t.stop());
            _monitor.ctx.close().catch(() => {});
            _monitor.btn?.el?.setActive?.(false);
            _monitor = null;
        }

        /**
         * MPI-629: the Update section. Shown only when the boot check found a newer
         * version — a permanently-present "check for updates" row would be a control
         * that does nothing on almost every open.
         *
         * `getPendingUpdate()` answers from the boot check, and it answers regardless
         * of the popup's mute: a user who ticked "Don't ask again" has said stop
         * asking, not stop offering, and this row is the place they were pointed at.
         */
        async function _initUpdate(root) {
            const section = qs('#mpiSettingsUpdateSection', root);
            const slot = qs('#mpiSettingsUpdateSlot', root);
            if (!section || !slot) return;
            section.hidden = true;              // re-hidden per open; the check may say no

            const info = await getPendingUpdate();
            if (!info) return;

            const desc = qs('#mpiSettingsUpdateDesc', root);
            if (desc) {
                desc.textContent = `You have v${info.current}, and v${info.latest} is out. `
                    + `The app will close, update, and reopen.`;
            }
            slot.innerHTML = '';
            const btn = MpiButton.mount(slot, {
                text: `Update to v${info.latest}`,
                variant: 'primary',
                size: 'sm',
            });
            btn.on('click', () => runUpdate(info.latest));
            section.hidden = false;
        }

        function _initFields(root) {
            // ── Update (MPI-629) — first section, only when one is due ───────
            _initUpdate(root);

            // ── Auto-start toggle ────────────────────────────────────────────
            _mountSwitchPlate('#mpiSettingsAutoStartSlot', Storage.getAutoStartComfy(),
                (v) => Storage.setAutoStartComfy(v));

            // ── MPI-500: uninstall to the Recycle Bin (default OFF) ──────────
            _mountSwitchPlate('#mpiSettingsRecycleBinSlot', Storage.getRecycleBinDelete(),
                (v) => Storage.setRecycleBinDelete(v));

            // ── Desktop notification prefs (per-type OS opt-out) ─────────────
            const _saveNotifyPref = (key, checked) => {
                state.notificationPrefs = { ...state.notificationPrefs, [key]: checked === true };
            };
            _mountSwitchPlate('#mpiSettingsNotifyGenerationSlot', state.notificationPrefs?.generation !== false,
                (v) => _saveNotifyPref('generation', v));
            _mountSwitchPlate('#mpiSettingsNotifyDownloadsSlot', state.notificationPrefs?.downloads !== false,
                (v) => _saveNotifyPref('downloads', v));
            _mountSwitchPlate('#mpiSettingsNotifyConnectionSlot', state.notificationPrefs?.connection !== false,
                (v) => _saveNotifyPref('connection', v));

            // ── In-app toast chime (default ON) ──────────────────────────────
            _mountSwitchPlate('#mpiSettingsToastSoundSlot', Storage.getToastSound(),
                (v) => Storage.setToastSound(v));

            // ── MPI-270: floating latent window when minimized (default ON) ──
            _mountSwitchPlate('#mpiSettingsFloatLatentSlot', state.floatLatentWindow === true,
                (v) => { state.floatLatentWindow = v === true; });

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

            // ── Audio input (MPI-573) ────────────────────────────────────────
            _initAudioInput(root);

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
                    video: state.promptReuseOptions?.video !== false,
                    audio: state.promptReuseOptions?.audio !== false,
                };
                const partChecks = new Map();
                let askCheck = null;
                const askPlate = reuseAskSlot.closest('.mpi-settings__plate');
                const syncChecks = () => {
                    for (const { key } of REUSE_PARTS) {
                        partChecks.get(key)?.el?.setChecked?.(options[key] === true);
                        partChecks.get(key)?.el?.setDisabled?.(options.ask === true);
                    }
                    askCheck?.el?.setChecked?.(options.ask === true);
                    askPlate?.classList.toggle('mpi-settings__plate--on', options.ask === true);
                };
                _syncReuseControls = (next = {}) => {
                    options.ask = next.ask === true;
                    options.prompt = next.prompt !== false;
                    options.settings = next.settings !== false;
                    options.model = next.model !== false;
                    options.images = next.images !== false;
                    options.video = next.video !== false;
                    options.audio = next.audio !== false;
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
                    variant: 'switch',
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
                // No mount-time guard here: a heuristic on the CACHED path must never
                // write server state. The old one matched 'temp'/'tmp' as a substring
                // anywhere and called _setComfyPath(''), which rewrites
                // extra_model_paths.yaml — the single source of truth — to the default
                // root, silently orphaning the user's real models folder (MPI-392).
                // _hydrateComfyPath() below already reconciles this field from the YAML.
                const saved = Storage.getComfyRootPath() || '';

                const pathInst = MpiInput.mount(pathSlot, {
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
            _runpodInst?.destroy?.();
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
                        // sound:false — confirmation of a user drop-import; no chime.
                        Events.emit('ui:success', { message: `Imported ${filename}.`, sound: false });
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
