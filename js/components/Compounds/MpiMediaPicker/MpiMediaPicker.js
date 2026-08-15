import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiMediaPicker — pick media the project ALREADY holds (Compound)
 *
 * A Flow media slot could only ever be filled by importing a file from outside
 * the app, so a Flow could not use what the user had just generated. This is
 * that missing half: a blocking modal over `state.currentProject`'s own history,
 * filtered to the slot's media type, returning the picked item's `filePath`.
 *
 * SCOPE: the CURRENT project only (settled with the user, 2026-08-15). Not a
 * file manager — no cross-project browsing, no import path. Importing from disk
 * stays where it already is, on the slot itself.
 *
 * The picked media is already on disk and already recorded in the project, so
 * there is nothing to place or copy: the caller gets a path and uses it. That is
 * the whole reason this is small.
 *
 * Usage:
 *   const picker = MpiMediaPicker.mount(document.createElement('div'), {
 *       mediaType: 'video',
 *       onPick: (item) => { … },   // { filePath, mediaType }
 *   });
 *   picker.el.show();
 *
 * Props:
 * @param {'image'|'video'|'audio'} [mediaType='image'] - Only this type is listed.
 * @param {Function} [onPick] - (item:{filePath:string,mediaType:string}) => void
 *
 * Emits:
 * 'pick'   { filePath, mediaType } — a tile was chosen (modal closes)
 * 'cancel' {}                      — Cancel pressed (NOT on Escape/backdrop)
 */
export const MpiMediaPicker = ComponentFactory.create({
    name: 'MpiMediaPicker',
    css: ['js/components/Compounds/MpiMediaPicker/MpiMediaPicker.css'],

    template: () => `
        <div class="mpi-media-picker" role="dialog" aria-modal="true" aria-label="Choose from this project">
            <div class="mpi-media-picker__title">Choose from this project</div>
            <div class="mpi-media-picker__grid" id="grid-slot"></div>
            <div class="mpi-media-picker__actions" id="actions-slot"></div>
        </div>`,

    setup: (el, props, emit) => {
        const _unsubs = [];
        const mediaType = props.mediaType || 'image';

        /**
         * Every history item of this media type, newest group first.
         *
         * `type` is the item's own field; a group may hold mixed types, so the
         * filter is per ITEM, never per group. Items with no `filePath` are
         * skipped — a pending or failed generation has a card but no file, and
         * handing one to a Flow slot would resolve to a broken URL.
         */
        function _collect() {
            const groups = state.currentProject?.itemGroups || [];
            const out = [];
            for (let g = groups.length - 1; g >= 0; g--) {
                for (const item of groups[g].history || []) {
                    if (!item?.filePath) continue;
                    if ((item.type || 'image') !== mediaType) continue;
                    out.push(item);
                }
            }
            return out;
        }

        // The MODAL wraps the content, not the other way round: MpiModal portals
        // its own element to document.body, so content nested inside `el` would
        // stay behind in the host and hide() would leave it on screen.
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(880px, 92vw)',
        });
        modal.el.appendChild(el);

        const grid = qs('#grid-slot', el);
        const items = _collect();

        if (!items.length) {
            const empty = ce('div', { className: 'mpi-media-picker__empty' });
            empty.textContent = `This project has no ${mediaType} yet. Generate one, or drop a file on the slot.`;
            grid.appendChild(empty);
        }

        items.forEach((item) => {
            const tile = ce('button', {
                className: 'mpi-media-picker__tile',
                type: 'button',
                title: item.filePath.split(/[/\\]/).pop() || '',
            });

            // A project thumb wins for EVERY type — a generated video carries one,
            // and a poster frame is cheaper than decoding the clip. The <video>
            // branch below is the genuine fallback: a video with no thumb yet
            // (mid-backfill, or imported) renders its own first frame.
            if (item.thumbPath || mediaType === 'image') {
                tile.appendChild(ce('img', {
                    src: resolveMediaUrl(item.thumbPath || item.filePath),
                    alt: '',
                    draggable: false,
                }));
            } else if (mediaType === 'video') {
                tile.appendChild(ce('video', {
                    src: resolveMediaUrl(item.filePath),
                    muted: true,
                    preload: 'metadata',
                }));
            } else {
                const icon = ce('span', { className: 'mpi-media-picker__tile-icon' });
                icon.innerHTML = renderIcon('audio', 'lg');
                tile.appendChild(icon);
            }

            _unsubs.push(on(tile, 'click', () => {
                const picked = { filePath: item.filePath, mediaType };
                props.onPick?.(picked);
                emit('pick', picked);
                modal.el.hide();
            }));
            grid.appendChild(tile);
        });

        const cancel = MpiButton.mount(qs('#actions-slot', el), {
            text: 'Cancel', variant: 'ghost', size: 'sm',
        });
        cancel.on('click', () => { emit('cancel', {}); modal.el.hide(); });

        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
            cancel?.el?.destroy?.();
            modal?.el?.destroy?.();
        };
    },
});
