import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import { submitAppGeneration } from '../../../services/appService.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiBaseApp — the shared App frame (MPI-256, Phase 4).
 *
 * COMPOSITION, not inheritance (the MpiCompareOverlay/MpiModelManager precedent):
 * setup mounts a `main-area` MpiOverlay (covers #tool-container + #prompt-box-mount,
 * spares the sticky #shell-info-bar so the status bar + queue stay live) and renders
 * the shared chrome — a header (app title + Back-to-Library), a single image upload
 * slot, an empty content slot the per-app component fills imperatively, a Run button,
 * and a progress/result line. The per-app component is CONTROLS ONLY: it renders into
 * the content slot and exposes `el.getInputs()` → the extra fields (e.g. a positive
 * prompt) BaseApp merges with the uploaded image before Run.
 *
 * Run = submitAppGeneration(app, { mediaItems, ...perAppInputs }). Results land as
 * normal gallery cards (the universal-op queue path), so there's no bespoke result
 * canvas here — Run shows progress, then a "landed in the gallery" note.
 *
 * State: BaseApp seeds from and writes `state.s_appInputs[appId]` (top-level replace)
 * so inputs survive close→reopen AND the Overlays.reset() force-close on navigation
 * (which is why s_appInputs lives in state.js, not this closure). Back-to-Library =
 * close this overlay then re-emit `apps:open`.
 *
 * Props: { app: AppDef, uiComponent: Blueprint|null, initialInputs?: Object }.
 * The shell mounts this once per app:open with the resolved descriptor + uiComponent.
 */
export const MpiBaseApp = ComponentFactory.create({
    name: 'MpiBaseApp',
    css: ['js/components/Organisms/MpiBaseApp/MpiBaseApp.css'],

    template: (props) => `
        <div class="mpi-base-app">
            <div class="mpi-base-app__head">
                <button class="mpi-base-app__back" id="app-back" type="button">${renderIcon('back', 'sm')}<span>Apps</span></button>
                <h1 class="mpi-base-app__title">${props.app?.title || 'App'}</h1>
            </div>
            <div class="mpi-base-app__body">
                <div class="mpi-base-app__field">
                    <span class="mpi-base-app__label">Source image</span>
                    <label class="mpi-base-app__drop" id="app-drop">
                        <input type="file" accept="image/*" id="app-file" hidden>
                        <div class="mpi-base-app__drop-inner" id="app-drop-inner">
                            <span>Click to choose an image</span>
                        </div>
                    </label>
                </div>
                <div class="mpi-base-app__content" id="app-content"></div>
                <div class="mpi-base-app__result" id="app-result" hidden>
                    <span class="mpi-base-app__label">Result</span>
                    <div class="mpi-base-app__result-media" id="app-result-media"></div>
                </div>
            </div>
            <div class="mpi-base-app__foot">
                <div class="mpi-base-app__status" id="app-status"></div>
                <div class="mpi-base-app__run" id="app-run-slot"></div>
            </div>
        </div>`,

    setup: (el, props) => {
        const app = props.app;
        const _unsubs = [];

        // ── main-area overlay frame (spares the status bar; queue rides above) ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'main-area',
        });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { el.close(); });

        const dropInner = qs('#app-drop-inner', el);
        const fileInput = qs('#app-file', el);
        const statusEl = qs('#app-status', el);
        const contentSlot = qs('#app-content', el);
        const resultWrap = qs('#app-result', el);
        const resultMedia = qs('#app-result-media', el);

        // The placeholder tempId of the currently-running job, so live latent
        // previews can be matched to THIS app's gen (not a concurrent gallery gen).
        let _myTempId = null;

        // Paint a URL (a live latent preview OR the final result) into the result
        // pane so the user never has to leave the App overlay to watch the gen.
        function _paintResult(url, { label } = {}) {
            if (!url) return;
            resultMedia.innerHTML = '';
            resultMedia.appendChild(ce('img', { src: url, alt: label || 'result' }));
            resultWrap.hidden = false;
        }
        function _showResult(item) {
            const path = item?.filePath || item?.url;
            if (path) _paintResult(resolveMediaUrl(path), { label: 'result' });
        }

        // Live latents: generation:preview carries the regId → its activeGenerations
        // entry's tempId. When that matches our running job, show the latent in-app —
        // the gallery card shows it too, but the user is inside the overlay here.
        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myTempId || !url) return;
            const entry = activeGenerations.get(id);
            if (entry?.tempId === _myTempId) _paintResult(url, { label: 'generating' });
        }));

        // Seed from persisted session inputs (survives reopen + navigation reset).
        const seeded = state.s_appInputs?.[app.id] || props.initialInputs || {};

        // The uploaded source image, as an op-ready mediaItem { url, mediaType, source }.
        // Seeded from a prior run's snapshot so reopen keeps the image.
        let _imageItem = Array.isArray(seeded.mediaItems) ? seeded.mediaItems[0] || null : null;
        if (_imageItem?.url) dropInner.innerHTML = `<img src="${_imageItem.url}" alt="source">`;

        // ── Per-app controls (composition): mount the uiComponent into the slot ──
        let _perApp = null;
        if (props.uiComponent) {
            _perApp = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
        }

        // ── Upload ──────────────────────────────────────────────────────────
        _unsubs.push(on(fileInput, 'change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) {
                Events.emit('ui:warning', { message: 'Open a project first.' });
                return;
            }
            statusEl.textContent = 'Uploading…';
            const uploaded = await uploadMediaFile(file, 'image', project.folderPath, project.id);
            statusEl.textContent = '';
            if (!uploaded?.filePath) {
                Events.emit('ui:warning', { message: 'Could not upload that image.' });
                return;
            }
            _imageItem = { url: uploaded.filePath, mediaType: 'image', source: 'app-upload' };
            dropInner.innerHTML = `<img src="${uploaded.filePath}" alt="source">`;
        }));

        // ── Run ─────────────────────────────────────────────────────────────
        let _running = false;
        const runBtn = MpiButton.mount(qs('#app-run-slot', el), { text: 'Run', variant: 'primary', size: 'md' });
        function _setRunning(on) {
            _running = on;
            runBtn.el.setAttribute?.('loading', on ? 'true' : 'false');
            if (!on) runBtn.el.removeAttribute?.('loading');
            statusEl.textContent = on ? 'Generating…' : statusEl.textContent;
        }
        runBtn.on('click', () => {
            if (_running) return;
            if (!_imageItem) { Events.emit('ui:warning', { message: 'Choose a source image first.' }); return; }
            const extra = _perApp?.el?.getInputs?.() || {};
            const inputs = { mediaItems: [_imageItem], ...extra };

            // Persist the input snapshot (top-level replace) so Reuse/reopen restores it.
            state.s_appInputs = { ...state.s_appInputs, [app.id]: inputs };

            _setRunning(true);
            _myTempId = null;
            const res = submitAppGeneration(app, inputs, {
                onComplete: ({ item } = {}) => { _setRunning(false); _myTempId = null; statusEl.textContent = 'Done — added to your gallery.'; _showResult(item); },
                onError:    () => { _setRunning(false); _myTempId = null; statusEl.textContent = 'Generation failed.'; },
                onCancel:   () => { _setRunning(false); _myTempId = null; statusEl.textContent = 'Cancelled.'; },
            });
            // Guard aborted before enqueue (missing model / no media) → reset immediately.
            if (!res) { _setRunning(false); return; }
            // Track this job's tempId so its live latents paint into the result pane.
            _myTempId = res.tempId || null;
        });

        // ── Back to Library = close this overlay, reopen the App Library ──────
        _unsubs.push(on(qs('#app-back', el), 'click', () => {
            el.close();
            Events.emit('apps:open');
        }));

        // ── Open / close ─────────────────────────────────────────────────────
        el.open = () => { overlay.el.show(); };
        el.close = () => { overlay.el.hide(); };
        el.onOpen = el.open;

        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _perApp?.el?.destroy?.();
            overlay?.el?.destroy?.();
        };
    },
});
