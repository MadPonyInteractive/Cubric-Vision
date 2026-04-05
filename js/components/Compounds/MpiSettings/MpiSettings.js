import { ComponentFactory } from '../../factory.js';
import { MpiProjectsPageOverlay } from '../../Primitives/MpiProjectsPageOverlay/MpiProjectsPageOverlay.js';
import { state } from '../../../state.js';
import { toggleTheme } from '../../../managers/themeManager.js';

/**
 * MpiSettings — Settings overlay compound for the landing page.
 *
 * Wraps MpiProjectsPageOverlay and renders the full settings UI.
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
    css: ['js/components/Compounds/MpiSettings/MpiSettings.css'],

    template: () => `<div class="mpi-settings"></div>`,

    setup: (el, props, emit) => {
        // ── Build content ────────────────────────────────────────────────────
        const content = document.createElement('div');
        content.className = 'mpi-settings__content';
        content.innerHTML = `
            <div class="mpi-settings__header">
                <h2 class="mpi-settings__title">Settings</h2>
                <p class="mpi-settings__desc">Configure Mpi AI Suite preferences and manage local models.</p>
            </div>

            <div class="mpi-settings__section">
                <h3 class="mpi-settings__section-title">App Behavior</h3>
                <div class="mpi-settings__form-group">
                    <label class="mpi-settings__checkbox-pill">
                        <input type="checkbox" id="mpiSettingsAutoStartComfy">
                        <span>Auto-start ComfyUI on Launch</span>
                    </label>
                    <span class="mpi-settings__hint">If enabled, the generation engine will start as soon as the app opens.</span>
                </div>
            </div>

            <div class="mpi-settings__section">
                <h3 class="mpi-settings__section-title">External Connections</h3>
                <div class="mpi-settings__form-group">
                    <label>Llama API URL</label>
                    <input type="text" id="mpiSettingsOllamaUrl" placeholder="http://localhost:8080">
                </div>
                <div class="mpi-settings__form-group">
                    <label>ComfyUI API URL</label>
                    <input type="text" id="mpiSettingsComfyUrl" placeholder="http://localhost:8188">
                </div>
                <div class="mpi-settings__form-group">
                    <label>ComfyUI Models Path</label>
                    <div class="mpi-settings__folder-row">
                        <input type="text" id="mpiSettingsComfyRootPath" placeholder="Default (internal engine)">
                        <button class="mpi-settings__browse-btn" id="mpiSettingsBrowseComfyBtn" type="button">Browse</button>
                    </div>
                    <span class="mpi-settings__hint">Optional: path to an external ComfyUI models folder.</span>
                </div>
            </div>

            `;

        // ── Mount overlay ────────────────────────────────────────────────────
        const overlay = MpiProjectsPageOverlay.mount(el, { closable: true });
        overlay.el.appendToContainer(content);

        overlay.on('close', () => emit('close', {}));

        el.show = () => {
            _initFields(content);
            overlay.el.show();
        };
        el.hide = () => overlay.el.hide();

        // ── Field initialisation (called each show so values are fresh) ──────
        function _initFields(root) {
            const ollamaUrl = root.querySelector('#mpiSettingsOllamaUrl');
            if (ollamaUrl) {
                ollamaUrl.value = localStorage.getItem('mpi_ollama_url') || 'http://localhost:8080';
                ollamaUrl.addEventListener('change', () =>
                    localStorage.setItem('mpi_ollama_url', ollamaUrl.value));
            }

            const comfyUrl = root.querySelector('#mpiSettingsComfyUrl');
            if (comfyUrl) {
                comfyUrl.value = localStorage.getItem('mpi_comfy_url') || 'http://localhost:8188';
                comfyUrl.addEventListener('change', () =>
                    localStorage.setItem('mpi_comfy_url', comfyUrl.value));
            }

            const autoStart = root.querySelector('#mpiSettingsAutoStartComfy');
            if (autoStart) {
                autoStart.checked = localStorage.getItem('mpi_auto_start_comfy') === 'true';
                autoStart.addEventListener('change', () =>
                    localStorage.setItem('mpi_auto_start_comfy', autoStart.checked));
            }

            const comfyPath = root.querySelector('#mpiSettingsComfyRootPath');
            if (comfyPath) {
                const saved = localStorage.getItem('mpi_comfy_root_path') || '';
                // Clear temp paths (legacy guard)
                if (saved.toLowerCase().includes('temp') || saved.toLowerCase().includes('tmp')) {
                    localStorage.removeItem('mpi_comfy_root_path');
                    comfyPath.value = '';
                    _setComfyPath('');
                } else {
                    comfyPath.value = saved;
                }
                const sync = () => {
                    if (comfyPath.value !== localStorage.getItem('mpi_comfy_root_path')) {
                        _setComfyPath(comfyPath.value);
                    }
                };
                comfyPath.addEventListener('change', sync);
                comfyPath.addEventListener('blur', sync);
                comfyPath.addEventListener('keydown', (e) => { if (e.key === 'Enter') sync(); });
            }

            const browseBtn = root.querySelector('#mpiSettingsBrowseComfyBtn');
            if (browseBtn && comfyPath) {
                browseBtn.addEventListener('click', async () => {
                    try {
                        const res  = await fetch('/choose-folder', { method: 'POST' });
                        const data = await res.json();
                        if (!data.cancelled && data.path) {
                            comfyPath.value = data.path;
                            _setComfyPath(data.path);
                        }
                    } catch (err) {
                        console.error('[MpiSettings] choose-folder failed:', err);
                    }
                });
            }
        }

        async function _setComfyPath(path) {
            localStorage.setItem('mpi_comfy_root_path', path);
            state.comfyRootPath = path;
            try {
                const res  = await fetch('/comfy/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path }),
                });
                const data = await res.json();
                if (data.success) {
                    const { refreshComfyWorkflowRegistry } = await import('../../../comfyModelManager.js');
                    await refreshComfyWorkflowRegistry();
                } else {
                    console.error('[MpiSettings] Failed to sync ComfyUI path:', data.error);
                }
            } catch (err) {
                console.error('[MpiSettings] Error syncing ComfyUI path:', err);
            }
        }

    }
});
