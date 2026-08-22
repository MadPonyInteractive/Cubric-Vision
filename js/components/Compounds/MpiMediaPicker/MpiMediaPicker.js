import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton, mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';
import { recordAudioIntoProject } from '../MpiAudioRecorder/MpiAudioRecorder.js';

/**
 * MpiMediaPicker — pick media the project ALREADY holds, or bring one in (Compound)
 *
 * A Flow media slot could only ever be filled by importing a file from outside
 * the app, so a Flow could not use what the user had just generated. This is
 * that missing half: a blocking modal over `state.currentProject`'s own history,
 * returning the picked item's `filePath`.
 *
 * SCOPE: the CURRENT project only. Not a file manager — no cross-project
 * browsing. But it IS the single entry point for filling a slot: the upload card
 * is the first cell of the grid, so the user has ONE button to reach both their
 * own media and the filesystem (settled with the user 2026-08-16, replacing an
 * earlier two-button split).
 *
 * The picked media is already on disk and already recorded in the project, so
 * there is nothing to place or copy: the caller gets a path and uses it.
 *
 * ORDERING is the gallery's own, at the moment the picker opens — deliberately
 * NOT a sort control. The user has just been looking at the gallery; the order
 * they last saw is the order they are thinking in.
 *
 * Usage:
 *   const picker = MpiMediaPicker.mount(document.createElement('div'), {
 *       mediaType: 'video',
 *       onPick: (item) => { … },     // { filePath, mediaType }
 *       onImport: (files) => { … },  // File[] from the upload card
 *   });
 *   picker.el.show();
 *
 * Props:
 * @param {'image'|'video'|'audio'} [mediaType='image'] - The slot's type. Preselects
 *        the matching filter tab; the user can still widen it to see everything.
 * @param {Function} [onPick] - (item:{filePath:string,mediaType:string}) => void
 * @param {Function} [onImport] - (files:File[]) => void — from the upload card.
 *        Omit it and the upload card is not rendered.
 *
 * Emits:
 * 'pick'   { filePath, mediaType } — a tile was chosen (modal closes)
 * 'import' { files }               — files chosen from disk (modal closes)
 * 'cancel' {}                      — Cancel pressed (NOT on Escape/backdrop)
 */

const FILTERS = [
    { id: 'all', label: 'All media' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'audio', label: 'Audio' },
];

export const MpiMediaPicker = ComponentFactory.create({
    name: 'MpiMediaPicker',
    css: ['js/components/Compounds/MpiMediaPicker/MpiMediaPicker.css'],

    template: () => `
        <div class="mpi-media-picker" role="dialog" aria-modal="true" aria-label="Choose media">
            <div class="mpi-media-picker__head">
                <div class="mpi-media-picker__title">Choose media</div>
                <div class="mpi-media-picker__filters" id="filters-slot" role="tablist"></div>
            </div>
            <div class="mpi-media-picker__grid" id="grid-slot"></div>
            <div class="mpi-media-picker__actions" id="actions-slot"></div>
        </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];
        const slotType = props.mediaType || 'image';
        let _filter = slotType;
        let _preview = null;

        /** Real basename out of a `/project-file?path=<urlencoded absolute path>` URL. */
        function _basename(filePath) {
            const raw = String(filePath || '');
            const q = raw.indexOf('path=');
            const p = q === -1 ? raw : decodeURIComponent(raw.slice(q + 5).split('&')[0]);
            return p.split(/[/\\]/).pop() || '';
        }

        /** Drop the extension — the user names takes, not files. */
        function _stripExt(name) {
            return String(name || '').replace(/\.[^.\s]+$/, '');
        }

        /**
         * Every history item matching the active filter, in the GALLERY's order.
         *
         * `type` is the item's own field; a group may hold mixed types, so the
         * filter is per ITEM, never per group. Items with no `filePath` are
         * skipped — a pending or failed generation has a card but no file, and
         * handing one to a Flow slot would resolve to a broken URL.
         */
        function _collect() {
            const groups = state.currentProject?.itemGroups || [];
            const out = [];
            for (const group of groups) {
                for (const item of group.history || []) {
                    if (!item?.filePath) continue;
                    const type = item.type || item.mediaType || 'image';
                    if (_filter !== 'all' && type !== _filter) continue;
                    out.push({ item, type });
                }
            }
            return out;
        }

        // The MODAL wraps the content, not the other way round: MpiModal portals
        // its own element to document.body, so content nested inside `el` would
        // stay behind in the host and hide() would leave it on screen.
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(1040px, 94vw)',
        });
        modal.el.appendChild(el);

        const grid = qs('#grid-slot', el);

        // ── the upload card's input: the picker's second source, same accept
        //    filter as the slot behind it so the two never disagree ──
        let importInput = null;
        if (props.onImport) {
            // The one control here with no component answer: it is never rendered
            // (hidden), never styled, and exists only so a click can open the OS file
            // dialog. MpiInput has no file type and a Primitive for an invisible
            // handle would be a component that draws nothing (MPI-582 / MPI-588).
            // eslint-disable-next-line mpi/no-bare-form-control -- hidden OS file-dialog handle, never rendered
            importInput = ce('input', {
                type: 'file',
                accept: slotType === 'image' ? 'image/*' : slotType === 'video' ? 'video/*' : 'audio/*',
                hidden: true,
                multiple: true,
            });
            el.appendChild(importInput);
            _unsubs.push(on(importInput, 'change', () => {
                const files = Array.from(importInput.files || []);
                importInput.value = '';
                if (!files.length) return;
                props.onImport(files);
                emit('import', { files });
                modal.el.hide();
            }));
        }

        /** A large preview over the grid. Its own layer so the grid keeps its scroll. */
        function _openPreview(entry) {
            _closePreview();
            const { item, type } = entry;
            const layer = ce('div', { className: 'mpi-media-picker__preview' });
            const inner = ce('div', { className: 'mpi-media-picker__preview-inner' });

            if (type === 'video') {
                inner.appendChild(ce('video', {
                    src: resolveMediaUrl(item.filePath),
                    controls: true, autoplay: true, loop: true,
                }));
            } else if (type === 'audio') {
                inner.appendChild(ce('audio', {
                    src: resolveMediaUrl(item.filePath), controls: true, autoplay: true,
                }));
            } else {
                inner.appendChild(ce('img', { src: resolveMediaUrl(item.filePath), alt: '' }));
            }

            const close = mountButton({
                icon: 'close',
                size: 'sm',
                variant: 'ghost',
                extraClasses: 'mpi-media-picker__preview-close',
            });
            close.title = 'Close preview';
            _unsubs.push(on(close, 'click', _closePreview));
            inner.appendChild(close);

            // Click the ground to dismiss, but not a click on the media itself.
            _unsubs.push(on(layer, 'click', (e) => { if (e.target === layer) _closePreview(); }));

            layer.appendChild(inner);
            el.appendChild(layer);
            _preview = layer;
        }

        function _closePreview() {
            _preview?.remove();
            _preview = null;
        }
        el.isPreviewOpen = () => !!_preview;
        el.closePreview = _closePreview;

        function _buildUploadCard() {
            const card = mountButton({
                variant: 'ghost',
                size: 'sm',
                extraClasses: 'mpi-media-picker__tile mpi-media-picker__tile--upload',
            });
            card.title = 'Upload a file';
            const icon = ce('span', { className: 'mpi-media-picker__upload-icon' });
            icon.innerHTML = renderIcon('upload', 'lg');
            const label = ce('span', { className: 'mpi-media-picker__upload-label' });
            label.textContent = 'Upload file';
            card.appendChild(icon);
            card.appendChild(label);
            _unsubs.push(on(card, 'click', () => importInput.click()));
            return card;
        }

        /**
         * The mic card — audio slots only (MPI-573).
         *
         * It does NOT go through `onImport`. A recording is not an imported file: the
         * user just made it, it exists nowhere else, and it has to survive as project
         * media so any later slot (or Flow) can reach it. `recordAudioIntoProject`
         * saves it exactly as a gallery drop would; only then does it resolve as a
         * normal PICK, which is what it has become.
         */
        function _buildMicCard() {
            const card = mountButton({
                variant: 'ghost',
                size: 'sm',
                extraClasses: 'mpi-media-picker__tile mpi-media-picker__tile--mic',
            });
            card.title = 'Record from your microphone';
            const icon = ce('span', { className: 'mpi-media-picker__upload-icon' });
            icon.innerHTML = renderIcon('mic', 'lg');
            const label = ce('span', { className: 'mpi-media-picker__upload-label' });
            label.textContent = 'Record';
            card.appendChild(icon);
            card.appendChild(label);
            _unsubs.push(on(card, 'click', async () => {
                const uploaded = await recordAudioIntoProject();
                if (!uploaded) return;
                const picked = { filePath: uploaded.filePath, mediaType: 'audio' };
                props.onPick?.(picked);
                emit('pick', picked);
                modal.el.hide();
            }));
            return card;
        }

        function _buildTile(entry) {
            const { item, type } = entry;
            const name = _stripExt(item.displayName || _basename(item.filePath));

            const tile = ce('div', { className: 'mpi-media-picker__tile' });

            const media = mountButton({
                variant: 'ghost',
                size: 'sm',
                extraClasses: 'mpi-media-picker__tile-media',
            });
            media.title = name;

            // A project thumb wins for a still frame — cheaper than decoding the clip.
            // Video also gets a real <video>, hidden until hover, so hovering PLAYS it
            // (the user asked for this): the poster stays for the un-hovered state.
            if (type === 'video') {
                if (item.thumbPath) {
                    media.appendChild(ce('img', {
                        className: 'mpi-media-picker__poster',
                        src: resolveMediaUrl(item.thumbPath), alt: '', draggable: false,
                    }));
                }
                const vid = ce('video', {
                    className: 'mpi-media-picker__video',
                    src: resolveMediaUrl(item.filePath),
                    muted: true, loop: true, preload: 'metadata', playsInline: true,
                });
                media.appendChild(vid);
                // play/pause on hover, not autoplay-always: a grid of 90 clips all
                // decoding at once is what makes a picker like this crawl.
                _unsubs.push(on(media, 'mouseenter', () => { vid.play().catch(() => {}); }));
                _unsubs.push(on(media, 'mouseleave', () => { vid.pause(); vid.currentTime = 0; }));
            } else if (type === 'audio') {
                const icon = ce('span', { className: 'mpi-media-picker__tile-icon' });
                icon.innerHTML = renderIcon('audio', 'lg');
                media.appendChild(icon);
            } else {
                media.appendChild(ce('img', {
                    src: resolveMediaUrl(item.thumbPath || item.filePath),
                    alt: '', draggable: false,
                }));
            }

            _unsubs.push(on(media, 'click', () => {
                const picked = { filePath: item.filePath, mediaType: type };
                props.onPick?.(picked);
                emit('pick', picked);
                modal.el.hide();
            }));
            tile.appendChild(media);

            // Expand: preview large WITHOUT choosing. Deliberately a sibling of the
            // pick button, not a child — a button inside a button is invalid and the
            // click would pick the item on its way out.
            const expand = mountButton({
                icon: 'fullscreen',
                size: 'sm',
                variant: 'ghost',
                extraClasses: 'mpi-media-picker__expand',
            });
            expand.title = 'Preview';
            expand.setAttribute('aria-label', `Preview ${name}`);
            _unsubs.push(on(expand, 'click', (e) => {
                e.stopPropagation();
                _openPreview(entry);
            }));
            tile.appendChild(expand);

            const caption = ce('div', { className: 'mpi-media-picker__name' });
            caption.textContent = name;
            tile.appendChild(caption);

            return tile;
        }

        function _render() {
            grid.textContent = '';
            const entries = _collect();

            if (importInput) grid.appendChild(_buildUploadCard());
            // Gated on the SLOT's type, not the active filter: widening the filter to
            // "All media" is the user looking around, not a change of what the slot
            // takes, and a Record card under an image slot would be a dead end.
            if (slotType === 'audio') grid.appendChild(_buildMicCard());

            if (!entries.length) {
                const empty = ce('div', { className: 'mpi-media-picker__empty' });
                empty.textContent = _filter === 'all'
                    ? 'This project has no media yet.'
                    : `This project has no ${_filter} yet.`;
                grid.appendChild(empty);
                return;
            }
            entries.forEach(entry => grid.appendChild(_buildTile(entry)));
        }

        // ── filter tabs ──
        const filtersSlot = qs('#filters-slot', el);
        const _tabs = new Map();
        FILTERS.forEach(({ id, label }) => {
            const tab = mountButton({
                text: label,
                variant: 'ghost',
                size: 'sm',
                extraClasses: 'mpi-media-picker__filter',
            });
            tab.setAttribute('role', 'tab');
            _unsubs.push(on(tab, 'click', () => {
                if (_filter === id) return;
                _filter = id;
                _syncTabs();
                _render();
            }));
            _tabs.set(id, tab);
            filtersSlot.appendChild(tab);
        });

        function _syncTabs() {
            _tabs.forEach((tab, id) => {
                const active = id === _filter;
                tab.classList.toggle('mpi-media-picker__filter--active', active);
                tab.setAttribute('aria-selected', String(active));
            });
        }

        _syncTabs();
        _render();

        const cancel = MpiButton.mount(qs('#actions-slot', el), {
            text: 'Cancel', variant: 'ghost', size: 'sm',
        });
        cancel.on('click', () => { emit('cancel', {}); modal.el.hide(); });

        el.show = () => modal.el.show();
        el.hide = () => { _closePreview(); modal.el.hide(); };

        el.destroy = () => {
            _closePreview();
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
            cancel?.el?.destroy?.();
            modal?.el?.destroy?.();
        };
    },
});
