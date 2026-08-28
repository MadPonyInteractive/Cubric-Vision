import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton, mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';
import { recordAudioIntoProject, toWavFile } from '../MpiAudioRecorder/MpiAudioRecorder.js';
import { MpiVoicePicker } from '../MpiVoicePicker/MpiVoicePicker.js';
import { clientLogger } from '../../../services/clientLogger.js';

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
 * @param {'narration'|'character'|null} [voiceRoute=null] - Opt in to the shipped voice
 *        library as a THIRD source, and say which route its play button previews. Omit
 *        it and no voice card is rendered. Per-SLOT, never per-flow: Voice Changer wants
 *        it on "Target voice" and emphatically not on "Your performance", where offering
 *        a stock voice as the thing you performed would invite converting one library
 *        voice into another. Requires `onImport` — see `_buildVoiceCard`.
 *
 * Emits:
 * 'pick'   { filePath, mediaType } — a tile was chosen (modal closes)
 * 'import' { files }               — files chosen from disk, or one voice decoded from
 *                                    the library (modal closes)
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

        /**
         * The voice-library card — audio slots that opted in via `voiceRoute` (MPI-622).
         *
         * A THIRD SOURCE INSIDE THIS PICKER, not a second button beside the slot. The slot
         * already has exactly one job (open this picker) and that was a deliberate repair;
         * bolting a rival button next to it would undo it. So the library sits where the
         * user's own media and the filesystem already are.
         *
         * It routes through `onImport`, which is the whole point: a library voice becomes an
         * ordinary content-addressed project asset by the SAME path an upload takes, so the
         * graph sees no difference and no new injection plumbing exists to go wrong.
         */
        function _buildVoiceCard() {
            const card = mountButton({
                variant: 'ghost',
                size: 'sm',
                extraClasses: 'mpi-media-picker__tile mpi-media-picker__tile--voice',
            });
            card.title = 'Choose from the voice library';
            const icon = ce('span', { className: 'mpi-media-picker__upload-icon' });
            // `audio`, not `mic` — the Record card next to it is the mic, and two cards
            // under one microphone would read as two ways to do the same thing.
            icon.innerHTML = renderIcon('audio', 'lg');
            const label = ce('span', { className: 'mpi-media-picker__upload-label' });
            label.textContent = 'Voice library';
            card.appendChild(icon);
            card.appendChild(label);
            _unsubs.push(on(card, 'click', _openVoiceLibrary));
            return card;
        }

        // The voice panel's two halves: the mounted component (may be absent if the manifest
        // failed to load) and the layer it sits in. Tracked separately because destroying the
        // component does not remove the layer, and the failure path has a layer and no
        // component — one variable for both would leak whichever half it did not name.
        let _voicePicker = null;
        let _voiceLayer = null;

        function _closeVoiceLibrary() {
            _voicePicker?.destroy?.();
            _voiceLayer?.remove();
            _voicePicker = null;
            _voiceLayer = null;
            // Give the grid and its filter tabs back.
            grid.hidden = false;
            qs('#filters-slot', el).hidden = false;
        }

        /**
         * Swap the grid for the voice picker, inside this same modal.
         *
         * IN FLOW, NOT AN OVERLAY. It started as `position: absolute; inset: 0` over the
         * grid, which meant it inherited the grid's height — and with an empty project that
         * is barely four rows tall, so the library opened into a letterbox (Fabio,
         * 2026-08-26: "the voice library is too small and can be a lot taller"). An absolute
         * layer cannot grow its parent, so the fix is to stop being one: hide the grid and
         * its filter tabs, and take their place as a normal flex child that can claim height.
         *
         * The manifest is fetched HERE and passed down as a prop: MpiVoicePicker never
         * fetches (so a test can drive it with a fixture), and fetching on open rather than
         * on mount keeps 56 voices out of every image slot's picker.
         */
        async function _openVoiceLibrary() {
            _closeVoiceLibrary();
            grid.hidden = true;
            // The tabs filter the GRID, which is no longer on screen.
            qs('#filters-slot', el).hidden = true;

            const layer = ce('div', { className: 'mpi-media-picker__voice' });
            const head = ce('div', { className: 'mpi-media-picker__voice-head' });
            const title = ce('span', { className: 'mpi-media-picker__voice-title' });
            title.textContent = 'Voice library';
            head.appendChild(title);

            const back = mountButton({
                text: 'Back', icon: 'back', size: 'sm', variant: 'ghost',
            });
            _unsubs.push(on(back, 'click', _closeVoiceLibrary));
            head.appendChild(back);
            layer.appendChild(head);

            const body = ce('div', { className: 'mpi-media-picker__voice-body' });
            body.textContent = 'Loading voices…';
            layer.appendChild(body);
            // Exactly where the grid was, so Cancel stays the last row rather than floating
            // above the library.
            el.insertBefore(layer, qs('#actions-slot', el));
            _voiceLayer = layer;

            let manifest;
            try {
                const res = await fetch('/voices/manifest.json');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                manifest = await res.json();
            } catch (err) {
                clientLogger.error('media-picker', `voice manifest load failed: ${err?.message || err}`);
                body.textContent = 'The voice library could not be loaded.';
                return;
            }
            // Back was pressed while the fetch was in flight — the layer is already gone, so
            // mounting into it would leak a component nothing can reach.
            if (_voiceLayer !== layer) return;

            body.textContent = '';
            const picker = MpiVoicePicker.mount(ce('div'), {
                manifest,
                route: props.voiceRoute,
                // No emotion control here. Voice Changer has no TTS stage, so the emotion set
                // has nothing to act on — the user's own recording carries the delivery, and
                // VC preserves it rather than adding one. Settled with Fabio 2026-08-26.
                emotions: false,
            });
            picker.on('select', ({ voice }) => { _pickVoice(voice); });
            body.appendChild(picker.el);
            _voicePicker = picker;
        }

        /**
         * Turn a chosen library voice into a File and hand it to `onImport`.
         *
         * DECODED TO WAV, not passed through as `.opus`. `opus` is missing from four of the
         * five extension lists that classify a file as audio (js/utils/file.js AUDIO_EXTS and
         * three lists in routes/projects.js), which is the same trap that made
         * MpiAudioRecorder re-mux its WebM. `toWavFile` is that recorder's own encoder, so a
         * library pick and a recording reach the graph as byte-identical kinds of file.
         */
        async function _pickVoice(voice) {
            try {
                const res = await fetch(`/voices/${voice.sample}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const file = await toWavFile(await res.blob(), `${voice.id}.wav`);
                if (!file) throw new Error('decode returned null');
                // The voice's IDENTITY travels with the file (MPI-607). A library pick
                // becomes an ordinary uploaded WAV two lines below, and until now that
                // boundary threw away which voice it was — fine while a slot only needed
                // a file, useless once something downstream has to know the voice's
                // REGISTER (Text to Speech matches its emotion clip to it). Second arg,
                // optional, ignored by every other caller of `onImport`.
                props.onImport([file], { voiceId: voice.id, register: voice.register });
                emit('import', { files: [file], voiceId: voice.id, register: voice.register });
                el.hide();
            } catch (err) {
                clientLogger.error('media-picker', `voice "${voice?.id}" could not be loaded: ${err?.message || err}`);
            }
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
            // Same gating, plus the slot's own opt-in. `onImport` is required because that
            // is the route a picked voice takes — without it the card would open a library
            // whose selection had nowhere to go.
            if (slotType === 'audio' && props.voiceRoute && props.onImport) {
                grid.appendChild(_buildVoiceCard());
            }

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
        el.hide = () => { _closePreview(); _closeVoiceLibrary(); modal.el.hide(); };

        el.destroy = () => {
            _closePreview();
            _closeVoiceLibrary();
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
            cancel?.el?.destroy?.();
            modal?.el?.destroy?.();
        };
    },
});
