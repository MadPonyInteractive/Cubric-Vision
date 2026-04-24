/**
 * MpiAutoMaskThumbs — Thumbnail strip for the Auto-Mask tool (Compound)
 *
 * Displays a wrapping grid of selectable segment thumbnails returned by the
 * "Detected" ComfyUI node. Clicking a thumbnail toggles it selected/deselected.
 * Multiple thumbnails may be selected at once (additive mask behaviour).
 *
 * Owned by MpiCanvasViewer; re-parented into MpiToolOptionsAutoMask via
 * `viewer.el.getAutoMaskThumbsEl()` while auto-mask tool is active.
 *
 * Usage:
 *   const thumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
 *   thumbs.el.setImages(['http://...url1', 'http://...url2']);
 *   thumbs.el.clear();
 *   thumbs.on('change', ({ picks }) => { }); // picks is a Set<number>
 *
 * Props: none (all state is managed imperatively)
 *
 * Instance methods (on instance.el):
 *   setImages(urls: string[]) — replace the thumbnail list; clears selection
 *   clear()                  — remove all thumbnails and reset selection
 *   getPicks()               — returns current Set<number> of selected indices
 *   clearPicks()             — deselect all without removing thumbnails
 *
 * Emits:
 *   'change' { picks: Set<number> } — any thumbnail toggled; picks = selected indices
 */

import { ComponentFactory } from '../../factory.js';

export const MpiAutoMaskThumbs = ComponentFactory.create({
    name: 'MpiAutoMaskThumbs',
    css: ['js/components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.css'],

    template: () => `<div class="mpi-auto-mask-thumbs"></div>`,

    setup: (el, props, emit) => {
        /** @type {Set<number>} */
        const _picks = new Set();

        /** @type {HTMLElement[]} */
        let _thumbEls = [];

        function _buildThumbs(urls) {
            el.innerHTML = '';
            _thumbEls = [];
            _picks.clear();

            urls.forEach((url, idx) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'mpi-auto-mask-thumbs__item';
                item.setAttribute('aria-label', `Segment ${idx + 1}`);

                const img = document.createElement('img');
                img.src = url;
                img.className = 'mpi-auto-mask-thumbs__img';
                img.alt = '';
                item.appendChild(img);

                const badge = document.createElement('span');
                badge.className = 'mpi-auto-mask-thumbs__badge';
                badge.textContent = idx + 1;
                item.appendChild(badge);

                item.addEventListener('click', () => {
                    if (_picks.has(idx)) {
                        _picks.delete(idx);
                        item.classList.remove('mpi-auto-mask-thumbs__item--selected');
                    } else {
                        _picks.add(idx);
                        item.classList.add('mpi-auto-mask-thumbs__item--selected');
                    }
                    emit('change', { picks: new Set(_picks) });
                });

                el.appendChild(item);
                _thumbEls.push(item);
            });
        }

        /**
         * Replace the thumbnail list. Clears any existing selection.
         * @param {string[]} urls
         */
        el.setImages = (urls) => {
            _buildThumbs(urls || []);
        };

        /** Remove all thumbnails and reset selection. */
        el.clear = () => {
            el.innerHTML = '';
            _thumbEls = [];
            _picks.clear();
        };

        /**
         * Returns a copy of the current selected index set.
         * @returns {Set<number>}
         */
        el.getPicks = () => new Set(_picks);

        /** Deselect all thumbnails without removing them. */
        el.clearPicks = () => {
            _picks.clear();
            _thumbEls.forEach(item => item.classList.remove('mpi-auto-mask-thumbs__item--selected'));
        };
    }
});
