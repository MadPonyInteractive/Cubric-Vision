import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { state } from '../../../../state.js';
import { Events } from '../../../../events.js';
import { Storage } from '../../../../core/storage.js';
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
                        <div id="mpiSettingsComfyUrlSlot"></div>
                    </div>
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
                            </div>
                            <div class="mpi-settings__extra-folder-group">
                                <div class="mpi-settings__extra-folder-head">
                                    <span class="mpi-settings__extra-folder-title">Upscale Models</span>
                                    <div id="mpiSettingsAddUpscaleFolderSlot"></div>
                                </div>
                                <div id="mpiSettingsUpscalePrimarySlot"></div>
                                <div class="mpi-settings__extra-folder-list" id="mpiSettingsUpscaleFoldersSlot"></div>
                            </div>
                        </div>
                        <span class="mpi-settings__hint">Extras are read-only additive folders. Cubric only installs, updates, and removes files from the primary managed folders.</span>
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
