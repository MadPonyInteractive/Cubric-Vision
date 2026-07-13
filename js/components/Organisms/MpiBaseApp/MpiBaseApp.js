import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import { submitAppGeneration } from '../../../services/appService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiBaseApp — the shared App frame (MPI-256, Phase 4).
 *
 * COMPOSITION, not inheritance (the MpiCompareOverlay/MpiModelManager precedent):
 * setup mounts a `main-area` MpiOverlay (covers #tool-container + #prompt-box-mount,
 * spares the sticky #shell-info-bar so the status bar + queue stay live) and renders
 * the shared chrome — a header (app title + Back-to-Library), an empty content slot the
 * per-app component fills imperatively, a Run button, and a progress/result line.
 *
 * FLEXIBLE INPUTS (MPI-259): BaseApp is a generic HOST, not an image-in tool. The source
 * media slot is rendered ONLY when the app's `inputSchema` declares a `media` array
 * (schema-driven polymorphic groups); an app with no media declaration shows no upload
 * slot. The one constant is OUTPUT: every app produces ≥1 image or video. Per-app
 * component exposes `el.getInputs()` → fields BaseApp merges with media before Run.
 * See docs/playbooks/add-app/02-media-io.md.
 *
 * media group schema (inputSchema.media[]):
 *   { type: 'image'|'video'|'audio', mode: 'upto'|'fixed', max: number, roles: string[] }
 *   roles[i] → assigned to the i-th filled item; models reference by role key.
 *
 * Run = submitAppGeneration(app, { mediaItems, ...perAppInputs }). Results land as
 * normal gallery cards (the universal-op queue path), so there's no bespoke result
 * canvas here — Run shows progress, then a "landed in the gallery" note.
 *
 * State: BaseApp seeds from and writes `state.s_appInputs[appId]` (top-level replace)
 * so inputs survive close→reopen AND the Overlays.reset() force-close on navigation.
 *
 * Props: { app: AppDef, uiComponent: Blueprint|null, initialInputs?: Object }.
 */

/**
 * Returns the declared media groups from the app's inputSchema, or [] for media-free apps.
 * @param {import('../../../data/appsRegistry.js').AppDef} [app]
 * @returns {Array<{type:string,mode:string,max:number,roles:string[]}>}
 */
function _getMediaGroups(app) {
    const schema = app?.inputSchema;
    if (!schema || !Array.isArray(schema.media) || schema.media.length === 0) return [];
    return schema.media;
}

/**
 * Build the label for an empty drop zone.
 * @param {string} type  'image'|'video'|'audio'
 * @param {number} remaining  slots still free
 * @returns {string}
 */
function _dropLabel(type, remaining) {
    const noun = type === 'image' ? 'image' : type === 'video' ? 'video' : 'audio file';
    const plural = remaining > 1 ? `${noun}s` : noun;
    return remaining > 1
        ? `Drop up to ${remaining} ${plural}, or click to choose`
        : `Drop 1 ${noun}, or click to choose`;
}

/**
 * Build the accept attribute value for a file input.
 * @param {string} type
 * @returns {string}
 */
function _acceptFor(type) {
    if (type === 'image') return 'image/*';
    if (type === 'video') return 'video/*';
    return 'audio/*';
}

export const MpiBaseApp = ComponentFactory.create({
    name: 'MpiBaseApp',
    css: ['js/components/Organisms/MpiBaseApp/MpiBaseApp.css'],

    template: (props) => {
        const mediaGroups = _getMediaGroups(props.app);
        const mediaHtml = mediaGroups.map((group, gi) => `
            <div class="mpi-base-app__field">
                <span class="mpi-base-app__label">Source ${group.type}${group.max > 1 ? 's' : ''}</span>
                <div class="mpi-base-app__media-group" data-group-index="${gi}" data-type="${group.type}" data-max="${group.max}">
                    <!-- slots rendered imperatively in setup -->
                </div>
            </div>`).join('');

        return `
        <div class="mpi-base-app">
            <div class="mpi-base-app__head">
                <button class="mpi-base-app__back" id="app-back" type="button">${renderIcon('back', 'sm')}<span>Apps</span></button>
                <h1 class="mpi-base-app__title">${props.app?.title || 'App'}</h1>
            </div>
            <div class="mpi-base-app__body">
                ${mediaHtml}
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
        </div>`;
    },

    setup: (el, props) => {
        const app = props.app;
        const _unsubs = [];

        // ── main-area overlay frame (spares the status bar; queue rides above) ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'main-area',
        });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { el.close(); });

        const statusEl = qs('#app-status', el);
        const contentSlot = qs('#app-content', el);
        const resultWrap = qs('#app-result', el);
        const resultMedia = qs('#app-result-media', el);

        // The placeholder tempId of the currently-running job, so live latent
        // previews can be matched to THIS app's gen (not a concurrent gallery gen).
        let _myTempId = null;

        // Paint a single URL (a live latent preview) into the result pane so the user
        // never has to leave the App overlay to watch the gen.
        function _paintResult(url, { label } = {}) {
            if (!url) return;
            resultMedia.innerHTML = '';
            resultMedia.appendChild(ce('img', { src: url, alt: label || 'result' }));
            resultWrap.hidden = false;
        }
        // Paint ALL final results (multi-output apps produce N cards — MPI-259). Each
        // item is an image/video item; show every one in the in-app pane, not just the
        // first. Falls back to the single-item shape for older callers.
        function _showResults(items) {
            const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
            const withPath = list.map(it => ({ it, path: it?.filePath || it?.url })).filter(x => x.path);
            // Always clear first: the pane may still hold a live-latent preview whose
            // blob: URL is revoked the moment the gen ends. Leaving it in the DOM logs a
            // GET blob:… ERR_FILE_NOT_FOUND. Clear even when there's nothing to paint.
            resultMedia.innerHTML = '';
            if (!withPath.length) { resultWrap.hidden = true; return; }
            for (const { it, path } of withPath) {
                const url = resolveMediaUrl(path);
                const isVideo = it?.type === 'video' || it?.mediaType === 'video';
                resultMedia.appendChild(isVideo
                    ? ce('video', { src: url, controls: true, muted: true, loop: true })
                    : ce('img', { src: url, alt: 'result' }));
            }
            resultWrap.hidden = false;
        }

        // Live latents (MPI-271): subscribe to the unified preview:frame bus, resolve
        // the frame to its generation by server-truth promptId, and paint when it's
        // OUR running job (tempId match). Seeding from getLastPreview on run-start
        // (see _run) keeps the pane showing the current latent through frame gaps.
        _unsubs.push(Events.on('preview:frame', ({ promptId, url }) => {
            if (!_myTempId || !url) return;
            const entry = activeGenerations.byPromptId(promptId);
            if (entry?.tempId === _myTempId) _paintResult(url, { label: 'generating' });
        }));

        // Seed from persisted session inputs (survives reopen + navigation reset).
        const seeded = state.s_appInputs?.[app.id] || props.initialInputs || {};

        // ── Polymorphic media groups ─────────────────────────────────────────────
        // Each group tracks its own array of filled items and renders its own slots.
        // _mediaGroups[gi] = { group: GroupDef, items: FilledItem[] }
        // FilledItem = { url, mediaType, source, role }

        const mediaGroupDefs = _getMediaGroups(app);

        /**
         * One entry per declared media group.
         * @type {Array<{group:{type:string,mode:string,max:number,roles:string[]}, items:Array, containerEl:Element}>}
         */
        const _mediaGroups = [];

        mediaGroupDefs.forEach((group, gi) => {
            const containerEl = qs(`[data-group-index="${gi}"]`, el);
            if (!containerEl) return;

            const entry = { group, items: [], containerEl };
            _mediaGroups.push(entry);

            // Seed from saved mediaItems — assign by position within this type group.
            if (Array.isArray(seeded.mediaItems)) {
                const seededForType = seeded.mediaItems.filter(m => m.mediaType === group.type);
                for (let i = 0; i < Math.min(seededForType.length, group.max); i++) {
                    entry.items.push({ ...seededForType[i], role: group.roles[i] });
                }
            }

            _renderGroup(entry);
        });

        /**
         * Re-render the slot list for a group entry. Idempotent — clears and rebuilds.
         * @param {{group,items,containerEl}} entry
         */
        function _renderGroup(entry) {
            const { group, items, containerEl } = entry;

            // Detach old slot-level unsubs (tracked per group via data attribute).
            const old = containerEl.__slotUnsubs;
            if (Array.isArray(old)) old.forEach(fn => fn());
            containerEl.__slotUnsubs = [];

            containerEl.innerHTML = '';

            const remaining = group.max - items.length;

            // ── Filled slots ─────────────────────────────────────────────────────
            items.forEach((item, idx) => {
                const slotEl = ce('div', { className: 'mpi-base-app__slot mpi-base-app__slot--filled' });

                // Numbered badge
                const badge = ce('span', { className: 'mpi-base-app__slot-badge' });
                badge.textContent = String(idx + 1);
                slotEl.appendChild(badge);

                // Thumbnail or filename
                if (group.type === 'image') {
                    const img = ce('img', { className: 'mpi-base-app__slot-thumb', src: item.url, alt: `source ${idx + 1}` });
                    slotEl.appendChild(img);
                } else {
                    // video / audio — show filename (last segment of the path)
                    const name = item.url.split(/[/\\]/).pop() || item.url;
                    const nameEl = ce('span', { className: 'mpi-base-app__slot-name' });
                    nameEl.textContent = name;
                    slotEl.appendChild(nameEl);
                }

                // Remove button
                const removeBtn = ce('button', {
                    className: 'mpi-base-app__slot-remove',
                    type: 'button',
                    title: 'Remove',
                });
                removeBtn.innerHTML = renderIcon('close', 'xs');
                slotEl.appendChild(removeBtn);

                const removeFn = on(removeBtn, 'click', () => {
                    entry.items.splice(idx, 1);
                    // Reassign roles by position after removal.
                    entry.items.forEach((it, i) => { it.role = group.roles[i]; });
                    _renderGroup(entry);
                });
                containerEl.__slotUnsubs.push(removeFn);

                containerEl.appendChild(slotEl);
            });

            // ── Empty drop zone (when not at cap) ────────────────────────────────
            if (remaining > 0) {
                const label = ce('label', { className: 'mpi-base-app__drop' });

                // Hidden file input
                const fileInput = ce('input', {
                    type: 'file',
                    accept: _acceptFor(group.type),
                    hidden: true,
                    multiple: true,
                });
                label.appendChild(fileInput);

                const inner = ce('div', { className: 'mpi-base-app__drop-inner' });
                const hint = ce('span');
                hint.textContent = _dropLabel(group.type, remaining);
                inner.appendChild(hint);
                label.appendChild(inner);
                containerEl.appendChild(label);

                // Dragover highlight
                const dragoverFn = on(label, 'dragover', (e) => {
                    e.preventDefault();
                    label.classList.add('mpi-base-app__drop--dragover');
                });
                const dragleaveFn = on(label, 'dragleave', () => {
                    label.classList.remove('mpi-base-app__drop--dragover');
                });
                const dropFn = on(label, 'drop', async (e) => {
                    e.preventDefault();
                    label.classList.remove('mpi-base-app__drop--dragover');
                    const files = Array.from(e.dataTransfer?.files || []);
                    const typed = files.filter(f => f.type.startsWith(group.type + '/'));
                    await _handleFiles(entry, typed);
                });
                const changeFn = on(fileInput, 'change', async () => {
                    const files = Array.from(fileInput.files || []);
                    fileInput.value = '';
                    await _handleFiles(entry, files);
                });

                containerEl.__slotUnsubs.push(dragoverFn, dragleaveFn, dropFn, changeFn);
            }
        }

        /**
         * Place one dropped file into the project's content-addressed preview-assets
         * store and return its /project-file URL (or null on failure). Mirrors the
         * server's placeContentAsset (dedup by sha256); no gallery card is created.
         * @param {File} file
         * @param {string} mediaType  'image'|'video'|'audio'
         * @param {{folderPath:string,id:string}} project
         * @returns {Promise<string|null>}
         */
        async function _placePreviewAsset(file, mediaType, project) {
            try {
                const dataUrl = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(/** @type {string} */ (r.result));
                    r.onerror = reject;
                    r.readAsDataURL(file);
                });
                const ext = '.' + (file.name.split('.').pop()
                    || (mediaType === 'image' ? 'png' : mediaType === 'video' ? 'mp4' : 'wav'));
                const res = await fetch(
                    `/project-media/${project.id}/place-preview-asset?folderPath=${encodeURIComponent(project.folderPath)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataUrl, ext }),
                    },
                );
                if (!res.ok) throw new Error(`place failed: ${res.status}`);
                const data = await res.json();
                return data?.success ? data.filePath : null;
            } catch (e) {
                clientLogger.warn('MpiBaseApp', 'preview-asset place failed', e);
                return null;
            }
        }

        /**
         * Upload one or more files into a media group, up to its cap.
         * @param {{group,items,containerEl}} entry
         * @param {File[]} files
         */
        async function _handleFiles(entry, files) {
            const { group } = entry;
            const available = group.max - entry.items.length;
            if (files.length === 0) return;
            if (files.length > available) {
                clientLogger.warn(`MpiBaseApp: dropped ${files.length} ${group.type}(s) but only ${available} slot(s) free — ignoring extras`);
                files = files.slice(0, available);
            }

            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) {
                Events.emit('ui:warning', { message: 'Open a project first.' });
                return;
            }

            statusEl.textContent = 'Uploading…';
            for (const file of files) {
                // App inputs go into the content-addressed preview-assets store (MPI-227),
                // NOT the visible gallery — keeps the gallery clean while persisting the
                // file durably so a later Reuse can resolve it (the user imports to the
                // gallery himself if he wants a card). Deduped by content hash server-side.
                const placedUrl = await _placePreviewAsset(file, group.type, project);
                if (!placedUrl) {
                    Events.emit('ui:warning', { message: `Could not add ${group.type} file.` });
                    continue;
                }
                const idx = entry.items.length;
                entry.items.push({
                    url: placedUrl,
                    mediaType: group.type,
                    source: 'app-upload',
                    role: group.roles[idx],
                });
                // Re-render after each file so the slot count updates before next file.
                _renderGroup(entry);
            }
            statusEl.textContent = '';
        }

        // ── Per-app controls (composition): mount the uiComponent into the slot ──
        let _perApp = null;
        if (props.uiComponent) {
            _perApp = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
        }

        // ── Run ─────────────────────────────────────────────────────────────────
        let _running = false;
        const runBtn = MpiButton.mount(qs('#app-run-slot', el), { text: 'Run', variant: 'primary', size: 'md' });

        function _setRunning(isRunning) {
            _running = isRunning;
            if (isRunning) {
                runBtn.el.setAttribute?.('loading', 'true');
                statusEl.textContent = 'Generating…';
            } else {
                runBtn.el.removeAttribute?.('loading');
            }
        }

        const _run = () => {
            if (_running) return;

            // Collect all filled media items across every group, in group order.
            const mediaItems = _mediaGroups.flatMap(entry => entry.items);

            const extra = _perApp?.el?.getInputs?.() || {};
            const inputs = { ...(mediaItems.length ? { mediaItems } : {}), ...extra };

            // Empty-run guard: an app that declares media slots but has NONE filled and
            // no prompt has nothing to run — every branch self-gates → zero outputs →
            // a silent "no output returned". Warn and bail before enqueue. Media-free
            // apps (no declared slots) skip this — their Run button is the whole input.
            const hasPrompt = typeof extra.positive === 'string' && extra.positive.trim() !== '';
            if (_mediaGroups.length > 0 && mediaItems.length === 0 && !hasPrompt) {
                Events.emit('ui:warning', {
                    message: `${app.title} needs at least one input before it can run.`,
                });
                return;
            }

            // Persist the input snapshot so Reuse/reopen restores media + controls.
            state.s_appInputs = { ...state.s_appInputs, [app.id]: inputs };

            _setRunning(true);
            _myTempId = null;
            const res = submitAppGeneration(app, inputs, {
                onComplete: ({ item, items } = {}) => {
                    _setRunning(false);
                    _myTempId = null;
                    statusEl.textContent = 'Done — added to your gallery.';
                    _showResults(items || item);
                },
                onError: () => {
                    _setRunning(false);
                    _myTempId = null;
                    _showResults([]);   // drop the now-revoked live-latent preview
                    statusEl.textContent = 'Generation failed.';
                },
                onCancel: () => {
                    _setRunning(false);
                    _myTempId = null;
                    _showResults([]);   // drop the now-revoked live-latent preview
                    statusEl.textContent = 'Cancelled.';
                },
            });
            // Guard aborted before enqueue (missing model / no media) → reset immediately.
            if (!res) { _setRunning(false); return; }
            // Track this job's tempId so its live latents paint into the result pane.
            _myTempId = res.tempId || null;
            // MPI-271: seed from the last-held latent so a pane opened mid-gen (or
            // during a frame gap) shows the current latent immediately, not blank.
            if (_myTempId) {
                const entry = activeGenerations.list().find(e => e.tempId === _myTempId);
                const last = entry && activeGenerations.getLastPreview(entry.id);
                if (last?.url) _paintResult(last.url, { label: 'generating' });
            }
        };
        runBtn.on('click', _run);

        // Ctrl+Enter runs the OPEN app, not the PromptBox behind it. Both handlers
        // fire on this hotkey (bind() is all-handlers) — the PromptBox's own
        // generation.run handler bails while an app overlay is live (see MpiPromptBox).
        _unsubs.push(Hotkeys.bind('generation.run', _run));

        // ── Back to Library = close this overlay, reopen the App Library ────────
        _unsubs.push(on(qs('#app-back', el), 'click', () => {
            el.close();
            Events.emit('apps:open');
        }));

        // ── Open / close ─────────────────────────────────────────────────────────
        el.open = () => { overlay.el.show(); };
        el.close = () => { overlay.el.hide(); };
        el.onOpen = el.open;

        el.destroy = () => {
            // Clean up per-slot listeners collected inside each group's containerEl.
            _mediaGroups.forEach(({ containerEl }) => {
                const slotUnsubs = containerEl.__slotUnsubs;
                if (Array.isArray(slotUnsubs)) slotUnsubs.forEach(fn => fn());
            });
            _unsubs.forEach(fn => fn());
            _perApp?.el?.destroy?.();
            overlay?.el?.destroy?.();
        };
    },
});
