/**
 * MpiCompareView — Before/after compare surface (Compound)
 *
 * The ONE piece of compare UI. It fills whatever box it is mounted into: two
 * labels, an MpiCanvas in `compare` mode, and the video transport bound to the
 * shared `compare.*` hotkeys. Supports image+image, image+video, video+image
 * and video+video, because MpiCanvas's comparison mode already does.
 *
 * It is deliberately NOT an overlay. Both surfaces that show a comparison mount
 * this and supply their own frame:
 *   - MpiCompareOverlay — the History takeover (MpiOverlay + this)
 *   - MpiBaseFlow       — a Flow's result pane, for a flow that declares
 *                         `result.compare` (MPI-585)
 * That is the point: the transport and the load sequence live here once, so the
 * two surfaces cannot drift apart.
 *
 * Hotkeys (bound only when at least one side is a video, unbound on destroy):
 *   space            → play/pause both
 *   arrowleft/right  → frame step (no wrap, clamps at ends)
 *   l                → toggle loop (default ON)
 *
 * Usage:
 *   const view = MpiCompareView.mount(hostEl);
 *   await view.el.open(beforeItem, afterItem);
 *   view.el.destroy();
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load the pair; itemA is the BEFORE (left), itemB the
 *                        AFTER (right, revealed by the slider)
 *   destroy()          — unbind hotkeys and destroy the canvas
 */

import { ComponentFactory } from '../../factory.js';
import { MpiCanvas }        from '../../Primitives/MpiCanvas/MpiCanvas.js';
import { qs }               from '../../../utils/dom.js';
import { Hotkeys }          from '../../../managers/hotkeyManager.js';
import { clientLogger }     from '../../../services/clientLogger.js';
import { resolveMediaUrl }  from '../../../utils/mediaActions.js';

const LABEL_MAX = 28;

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function _truncate(str) {
    if (!str) return '';
    return str.length > LABEL_MAX ? str.slice(0, LABEL_MAX - 1) + '…' : str;
}

/**
 * The item's path, whichever key it arrived under.
 *
 * A HistoryItem carries `filePath`; a Flow's media SLOT carries `url` instead
 * (MpiBaseFlow `_openMediaPicker`). Reading only `filePath` is what made the
 * first Flow comparison fail with an empty URL and fall back to a plain player —
 * silently, because an empty src is a load error and not a missing item.
 */
function _pathOf(item) {
    return item?.filePath || item?.url || '';
}

/** Shared resolver — do NOT re-implement it here; that is how the two drifted. */
function _resolveUrl(item) {
    return resolveMediaUrl(_pathOf(item));
}

function _isVideoItem(item) {
    if (!item) return false;
    if (item.type === 'video') return true;
    if (item.mediaType === 'video') return true;
    if (VIDEO_EXT_RE.test(_pathOf(item))) return true;
    return false;
}

function _fpsOf(item, fallback = 24) {
    return item?.fps || fallback;
}

function _basenameNoExt(filePath) {
    if (!filePath) return '';
    if (filePath.includes('project-file')) {
        try {
            const match = filePath.match(/[?&]path=([^&]+)/);
            if (match) filePath = decodeURIComponent(match[1]);
        } catch (_) {}
    }
    const base = filePath.replace(/\\/g, '/').split('/').pop() || '';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

function _labelFor(item, fallback) {
    return _truncate(item?.name || item?.displayName || _basenameNoExt(_pathOf(item)) || fallback);
}

export const MpiCompareView = ComponentFactory.create({
    name: 'MpiCompareView',
    css:  ['js/components/Compounds/MpiCompareView/MpiCompareView.css'],

    template: () => `
        <div class="mpi-compare-view">
            <div class="mpi-compare-view__labels">
                <span class="mpi-compare-view__label mpi-compare-view__label--before" id="label-before"></span>
                <span class="mpi-compare-view__label mpi-compare-view__label--after"  id="label-after"></span>
            </div>
            <div class="mpi-compare-view__canvas-wrap" id="canvas-wrap"></div>
        </div>
    `,

    setup: (el) => {
        let _canvas = null;
        const _hotkeyUnsubs = [];

        const canvasWrap  = qs('#canvas-wrap',  el);
        const labelBefore = qs('#label-before', el);
        const labelAfter  = qs('#label-after',  el);

        function _ensureCanvas() {
            if (_canvas) return;
            _canvas = MpiCanvas.mount(canvasWrap);
        }

        function _bindHotkeys() {
            _unbindHotkeys();
            _hotkeyUnsubs.push(Hotkeys.bind('compare.playPause', () => {
                _canvas?.el?.togglePlayCompare?.();
            }));
            _hotkeyUnsubs.push(Hotkeys.bind('compare.frame.back', () => {
                _canvas?.el?.frameStepCompare?.(-1);
            }));
            _hotkeyUnsubs.push(Hotkeys.bind('compare.frame.forward', () => {
                _canvas?.el?.frameStepCompare?.(+1);
            }));
            _hotkeyUnsubs.push(Hotkeys.bind('compare.loop', () => {
                if (!_canvas?.el) return;
                _canvas.el.setCompareLoop(!_canvas.el.getCompareLoop());
            }));
        }

        function _unbindHotkeys() {
            while (_hotkeyUnsubs.length) {
                const fn = _hotkeyUnsubs.pop();
                try { fn(); } catch (_) {}
            }
        }

        /**
         * @param {object} itemA — left (before)
         * @param {object} itemB — right (after, revealed by the slider)
         * @returns {Promise<boolean>} false when the pair could not be loaded, so a
         *   caller with a fallback (a Flow result pane) can show it instead of an
         *   empty frame.
         */
        el.open = async (itemA, itemB) => {
            _ensureCanvas();

            const urlA = _resolveUrl(itemA);
            const urlB = _resolveUrl(itemB);
            const isVideoA = _isVideoItem(itemA);
            const isVideoB = _isVideoItem(itemB);

            labelBefore.textContent = _labelFor(itemA, 'Before');
            labelAfter.textContent  = _labelFor(itemB, 'After');

            try {
                if (isVideoA) {
                    await _canvas.el.loadVideo(urlA, { fps: _fpsOf(itemA) });
                } else {
                    await _canvas.el.loadImage(urlA);
                }
                if (isVideoB) {
                    await _canvas.el.loadComparisonVideo(urlB, { fps: _fpsOf(itemB) });
                } else {
                    await _canvas.el.loadComparisonImage(urlB);
                }

                if (isVideoA || isVideoB) {
                    _canvas.el.setCompareLoop(true);
                    _bindHotkeys();
                }
                return true;
            } catch (err) {
                clientLogger.error('MpiCompareView', 'failed to load the compare pair', err);
                return false;
            }
        };

        el.destroy = () => {
            _unbindHotkeys();
            if (_canvas) {
                _canvas.el.destroy();
                _canvas = null;
            }
        };
    }
});
