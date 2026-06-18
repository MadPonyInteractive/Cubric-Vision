/**
 * MpiCompareOverlay — Side-by-side comparison overlay (Compound)
 *
 * Full #tool-container takeover that renders two media items on an MpiCanvas
 * in comparison mode. The vertical slider reveals the second media (imgAfter).
 *
 * Supports image+image, image+video, video+image, and video+video pairs.
 * Video playback driven by hotkeys only (no on-screen transport):
 *   space            → play/pause both
 *   arrowleft/right  → frame step (no wrap, clamps at ends)
 *   l                → toggle loop (default ON)
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
import { MpiCanvas }        from '../../Primitives/MpiCanvas/MpiCanvas.js';
import { qs }               from '../../../utils/dom.js';
import { Hotkeys }          from '../../../managers/hotkeyManager.js';

const LABEL_MAX = 28;

function _truncate(str) {
    if (!str) return '';
    return str.length > LABEL_MAX ? str.slice(0, LABEL_MAX - 1) + '…' : str;
}

function _resolveUrl(item) {
    if (!item?.filePath) return '';
    const p = item.filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function _isVideoItem(item) {
    if (!item) return false;
    if (item.type === 'video') return true;
    if (item.mediaType === 'video') return true;
    if (VIDEO_EXT_RE.test(item.filePath || '')) return true;
    return false;
}

function _fpsOf(item, fallback = 24) {
    return item?.fps || fallback;
}

export const MpiCompareOverlay = ComponentFactory.create({
    name: 'MpiCompareOverlay',
    css:  ['js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.css'],

    template: () => `
        <div class="mpi-compare-overlay">
            <div class="mpi-compare-overlay__labels">
                <span class="mpi-compare-overlay__label mpi-compare-overlay__label--before" id="label-before"></span>
                <span class="mpi-compare-overlay__label mpi-compare-overlay__label--after"  id="label-after"></span>
            </div>
            <div class="mpi-compare-overlay__canvas-wrap" id="canvas-wrap"></div>
        </div>
    `,

    setup: (el, _props, emit) => {
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });
        overlay.el.appendToContainer(el);

        overlay.on('close', () => {
            _unbindHotkeys();
            emit('close', {});
        });

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();

        let _canvas = null;
        const _hotkeyUnsubs = [];

        const canvasWrap  = qs('#canvas-wrap',   el);
        const labelBefore = qs('#label-before',  el);
        const labelAfter  = qs('#label-after',   el);

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
         * @param {object} itemB — right (after, revealed by slider)
         */
        el.open = async (itemA, itemB) => {
            _ensureCanvas();

            const urlA = _resolveUrl(itemA);
            const urlB = _resolveUrl(itemB);
            const isVideoA = _isVideoItem(itemA);
            const isVideoB = _isVideoItem(itemB);

            const nameA = _truncate(itemA?.name || itemA?.displayName || _basenameNoExt(itemA?.filePath) || 'Before');
            const nameB = _truncate(itemB?.name || itemB?.displayName || _basenameNoExt(itemB?.filePath) || 'After');
            labelBefore.textContent = nameA;
            labelAfter.textContent  = nameB;

            overlay.el.show();

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
            } catch (err) {
                console.error('[MpiCompareOverlay] Failed to load media:', err);
            }
        };

        const _origHide = el.hide;
        el.hide = () => {
            _unbindHotkeys();
            if (_canvas) {
                _canvas.el.destroy();
                _canvas = null;
            }
            _origHide();
        };

        const _obs = new MutationObserver(() => {
            if (!document.contains(el) && _canvas) {
                _unbindHotkeys();
                _canvas.el.destroy();
                _canvas = null;
                _obs.disconnect();
            }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
});

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
