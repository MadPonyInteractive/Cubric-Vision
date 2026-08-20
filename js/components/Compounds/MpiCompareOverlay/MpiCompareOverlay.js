/**
 * MpiCompareOverlay — the History surface for a before/after comparison (Compound)
 *
 * A full #tool-container takeover that shows two selected media items in
 * MpiCompareView. It owns the TAKEOVER and nothing else: the labels, the canvas,
 * the load sequence and the video transport all live in MpiCompareView, so this
 * surface and a Flow's result pane can never drift apart (MPI-585).
 *
 * Uses MpiOverlay as its base — inherits the Stash Pattern, OverlayManager
 * registration, and Escape-to-close behaviour automatically.
 *
 * Usage:
 *   const compare = MpiCompareOverlay.mount(document.createElement('div'));
 *   compare.el.open(selectedItemA, selectedItemB);
 *   compare.on('close', () => {});
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load two MediaItems / HistoryItems and show the overlay
 *
 * Emits:
 *   'close' {} — overlay closed (forwarded from MpiOverlay)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOverlay }       from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiCompareView }   from '../MpiCompareView/MpiCompareView.js';
import { qs }               from '../../../utils/dom.js';

export const MpiCompareOverlay = ComponentFactory.create({
    name: 'MpiCompareOverlay',
    css:  ['js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.css'],

    template: () => `
        <div class="mpi-compare-overlay">
            <div class="mpi-compare-overlay__view" id="view-host"></div>
        </div>
    `,

    setup: (el, _props, emit) => {
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });
        overlay.el.appendToContainer(el);

        overlay.on('close', () => {
            _teardownView();
            emit('close', {});
        });

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();

        /** @type {?Object} the shared compare surface, mounted on first open */
        let _view = null;
        const viewHost = qs('#view-host', el);

        function _teardownView() {
            if (!_view) return;
            _view.el.destroy();
            _view = null;
        }

        /**
         * @param {object} itemA — left (before)
         * @param {object} itemB — right (after, revealed by the slider)
         */
        el.open = async (itemA, itemB) => {
            // Remount per open: MpiCompareView owns one canvas per instance, and a
            // second pair must not inherit the first one's loaded videos.
            _teardownView();
            _view = MpiCompareView.mount(viewHost);

            // Show BEFORE loading — the canvas sizes itself off its container, and a
            // hidden container measures zero.
            overlay.el.show();
            await _view.el.open(itemA, itemB);
        };

        const _origHide = el.hide;
        el.hide = () => {
            _teardownView();
            _origHide();
        };

        el.destroy = () => {
            _obs.disconnect();
            _teardownView();
            overlay.el.destroy?.();
        };

        // The two Blocks that mount this keep the instance alive across openings and
        // never call destroy(), so a detached overlay would keep its canvas — and,
        // when the pair is video, its RAF loop — running.
        const _obs = new MutationObserver(() => {
            if (!document.contains(el) && _view) {
                _teardownView();
                _obs.disconnect();
            }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
});
