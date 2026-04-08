/**
 * MpiCompareOverlay — Side-by-side image comparison overlay (Compound)
 *
 * Full #tool-container takeover that renders two images on an MpiCanvas
 * in comparison mode. The vertical slider reveals the second image (imgAfter).
 *
 * Uses MpiOverlay as its base — inherits the Stash Pattern, OverlayManager
 * registration, and Escape-to-close behaviour automatically.
 *
 * Usage:
 *   const compare = MpiCompareOverlay.mount(document.createElement('div'));
 *   compare.el.open(selectedItemA, selectedItemB);  // resolves URLs, shows overlay
 *   compare.on('close', () => {});
 *
 * Props: none required at mount time.
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load two MediaItems and show the overlay
 *
 * Emits:
 *   'close' {} — overlay closed (forwarded from MpiOverlay)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOverlay }       from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiCanvas }        from '../../Primitives/MpiCanvas/MpiCanvas.js';
import { qs }               from '../../../utils/dom.js';

/** Max chars shown in a label before truncation */
const LABEL_MAX = 28;

function _truncate(str) {
    if (!str) return '';
    return str.length > LABEL_MAX ? str.slice(0, LABEL_MAX - 1) + '…' : str;
}

/** Resolve a MediaItem's filePath to a fetchable URL */
function _resolveUrl(item) {
    if (!item?.filePath) return '';
    const p = item.filePath;
    // Already a full URL or already a project-file API path
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    // Absolute disk path — wrap in project-file API
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
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
        // ── MpiOverlay base — owns #tool-container stash + OverlayManager ──────
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });
        overlay.el.appendToContainer(el);

        overlay.on('close', () => emit('close', {}));

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();

        // ── Canvas instance (lazy — created on first open) ────────────────────
        let _canvas = null;

        const canvasWrap  = qs('#canvas-wrap',   el);
        const labelBefore = qs('#label-before',  el);
        const labelAfter  = qs('#label-after',   el);

        function _ensureCanvas() {
            if (_canvas) return;
            _canvas = MpiCanvas.mount(canvasWrap);
        }

        /**
         * Load two MediaItems and show the overlay.
         * itemA is displayed on the left (before), itemB on the right (after).
         * @param {import('../../../data/projectModel.js').MediaItem} itemA
         * @param {import('../../../data/projectModel.js').MediaItem} itemB
         */
        el.open = async (itemA, itemB) => {
            _ensureCanvas();

            const urlA = _resolveUrl(itemA);
            const urlB = _resolveUrl(itemB);

            // Label from filename (no extension) or truncated name
            const nameA = _truncate(itemA?.name || _basenameNoExt(itemA?.filePath) || 'Before');
            const nameB = _truncate(itemB?.name || _basenameNoExt(itemB?.filePath) || 'After');
            labelBefore.textContent = nameA;
            labelAfter.textContent  = nameB;

            // Show first so the canvas has dimensions before loading
            overlay.el.show();

            try {
                await _canvas.el.loadImage(urlA);
                await _canvas.el.loadComparisonImage(urlB);
            } catch (err) {
                console.error('[MpiCompareOverlay] Failed to load images:', err);
            }
        };

        // ── Cleanup canvas on hide ────────────────────────────────────────────
        // MpiOverlay removes el from the DOM on hide — destroy canvas to avoid
        // ghost event listeners (InputController has window-level listeners).
        const _origHide = el.hide;
        el.hide = () => {
            if (_canvas) {
                _canvas.el.destroy();
                _canvas = null;
            }
            _origHide();
        };

        // Safety: MutationObserver in case overlay is removed externally
        const _obs = new MutationObserver(() => {
            if (!document.contains(el) && _canvas) {
                _canvas.el.destroy();
                _canvas = null;
                _obs.disconnect();
            }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
});

// ── Private helpers ───────────────────────────────────────────────────────────

function _basenameNoExt(filePath) {
    if (!filePath) return '';
    // If it's a project-file API URL, decode the path param to get the real filename
    if (filePath.includes('project-file')) {
        try {
            const match = filePath.match(/[?&]path=([^&]+)/);
            if (match) filePath = decodeURIComponent(match[1]);
        } catch (_) { /* use filePath as-is */ }
    }
    const base = filePath.replace(/\\/g, '/').split('/').pop() || '';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}
