import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiCheckbox } from '../../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../../state.js';
import { Storage } from '../../../../core/storage.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { qs } from '../../../../utils/dom.js';

/**
 * MpiSettings — Settings overlay compound for the landing page.
 *
 * Wraps MpiOverlay (body-mount) and renders the full settings UI.
 * All settings logic is self-contained; callers only call show()/hide().
 *
 * Usage:
 *   const settings = MpiSettings.mount(document.createElement('div'));
 *   settings.el.show();
 *
 * Emits:
 *   'close' {} — overlay closed
 */
export const MpiSettings = ComponentFactory.create({
    name: 'MpiSettings',
    css: ['js/components/Compounds/LandingPages/MpiSettings/MpiSettings.css'],

    template: () => `<div class="mpi-settings"></div>`,

    setup: (el, props, emit) => {
        // ── Build content ────────────────────────────────────────────────────
        const content = document.createElement('div');
        content.className = 'mpi-settings__content';
        content.innerHTML = `
            <div class="mpi-settings__header">
                <h2 class="mpi-settings__title">Settings</h2>
                <p class="mpi-settings__desc">Configure Cubric Studio preferences and manage local models.</p>
            </div>

            <div class="mpi-settings__section">
                <h3 class="mpi-settings__section-title">App Behavior</h3>
                <div class="mpi-settings__form-group">
                    <div class="mpi-settings__checkbox-slot" id="mpiSettingsAutoStartSlot"></div>
                    <span class="mpi-settings__hint">If enabled, the generation engine will start as soon as the app opens.</span>
                </div>
            </div>

            <div class="mpi-settings__section">
                <h3 class="mpi-settings__section-title">External Connections</h3>
                <div class="mpi-settings__form-group">
                    <div id="mpiSettingsOllamaUrlSlot"></div>
                </div>
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

            `;

        // ── Mount overlay ────────────────────────────────────────────────────
        const overlay = MpiOverlay.mount(el, { closable: true, mountTarget: 'body' });
        overlay.el.appendToContainer(content);

        overlay.on('close', () => emit('close', {}));

        el.show = () => {
            _initFields(content);
            overlay.el.show();
        };
        el.hide = () => overlay.el.hide();

        // ── Field initialisation (called each show so values are fresh) ──────
        // Primitive instances are created once per show; slots are cleared first.
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

            // ── Ollama URL ───────────────────────────────────────────────────
            const ollamaSlot = qs('#mpiSettingsOllamaUrlSlot', root);
            if (ollamaSlot) {
                ollamaSlot.innerHTML = '';
                const ollamaInst = MpiInput.mount(ollamaSlot, {
                    label: 'Llama API URL',
                    placeholder: 'http://localhost:8080',
                    value: Storage.getOllamaUrl() || 'http://localhost:8080',
                });
                ollamaInst.on('change', ({ value }) => Storage.setOllamaUrl(value));
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

                if (browseSlot) {
                    browseSlot.innerHTML = '';
                    const browseInst = MpiButton.mount(browseSlot, {
                        text: 'Browse',
                        variant: 'secondary',
                        size: 'md',
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

    }
});
