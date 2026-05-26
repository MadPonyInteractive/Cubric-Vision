import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { state } from '../../../../state.js';
import { Events } from '../../../../events.js';
import { Storage } from '../../../../core/storage.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { qs } from '../../../../utils/dom.js';

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
                        <div id="mpiSettingsComfyUrlSlot"></div>
                    </div>
                    <div class="mpi-settings__form-group">
                        <div class="mpi-settings__folder-row">
                            <div id="mpiSettingsComfyRootPathSlot" class="mpi-settings__folder-input"></div>
                            <div id="mpiSettingsBrowseBtnSlot"></div>
                        </div>
                        <span class="mpi-settings__hint">Optional: path to an external ComfyUI models folder.</span>
                    </div>
                </div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];
        let _syncReuseControls = null;
        let _syncReuseSource = null;

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

            // ── ComfyUI URL ──────────────────────────────────────────────────
            const comfyUrlSlot = qs('#mpiSettingsComfyUrlSlot', root);
            if (comfyUrlSlot) {
                comfyUrlSlot.innerHTML = '';
                const comfyUrlInst = MpiInput.mount(comfyUrlSlot, {
                    label: 'ComfyUI API URL',
                    placeholder: 'http://localhost:8188',
                    value: Storage.getComfyUrl() || 'http://localhost:8188',
                });
                comfyUrlInst.on('change', ({ value }) => Storage.setComfyUrl(value));
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
                            const res = await fetch('/choose-folder', { method: 'POST' });
                            const data = await res.json();
                            if (!data.cancelled && data.path) {
                                const field = qs('.mpi-input__field', pathInst.el);
                                if (field) field.value = data.path;
                                _setComfyPath(data.path);
                            }
                        } catch (err) {
                            clientLogger.error('settings', '[MpiSettings] choose-folder failed', err);
                        }
                    });
                }
            }
        }

        _unsubs.push(Events.onState('promptReuseOptions', (value) => {
            _syncReuseControls?.(value);
        }));
        _unsubs.push(Events.onState('promptReuseSource', (value) => {
            _syncReuseSource?.(value);
        }));

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
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
                }
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] hydrate comfy path failed', err);
            }
        }

        async function _setComfyPath(path) {
            Storage.setComfyRootPath(path);
            state.comfyRootPath = path;
            try {
                const res = await fetch('/comfy/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path }),
                });
                const data = await res.json();
                if (!data.success) {
                    clientLogger.error('settings', '[MpiSettings] Failed to sync ComfyUI path', data.error);
                }
            } catch (err) {
                clientLogger.error('settings', '[MpiSettings] Error syncing ComfyUI path', err);
            }
        }
    },
});
