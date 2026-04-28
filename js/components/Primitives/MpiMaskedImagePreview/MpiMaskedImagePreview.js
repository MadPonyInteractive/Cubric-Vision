/**
 * MpiMaskedImagePreview — Lightweight image + mask preview for Prompt tool mode (Primitive)
 *
 * Two <img> elements in a CSS-transform stack. No canvas GPU backing.
 * Pan/zoom via ViewManager (same model as MpiCanvas). Mask shown as
 * CSS mask-image overlay — no re-draw on every frame.
 *
 * Usage:
 *   const preview = MpiMaskedImagePreview.mount(wrapperEl);
 *   await preview.el.loadImage(url);
 *   preview.el.setMaskDataURL(dataUrl); // show painted mask as overlay
 *   preview.el.clearMask();
 *
 * Props: none
 *
 * Instance methods (on instance.el):
 *   loadImage(url)          — load image; resets view to contain
 *   setMaskDataURL(dataUrl) — show mask overlay (PNG dataURL)
 *   clearMask()             — hide mask overlay
 *   destroy()               — remove from DOM, disconnect observers
 */

import { ComponentFactory } from '../../factory.js';
import { ViewManager }       from '../MpiCanvas/managers/ViewManager.js';

export const MpiMaskedImagePreview = ComponentFactory.create({
    name: 'MpiMaskedImagePreview',
    css: ['js/components/Primitives/MpiMaskedImagePreview/MpiMaskedImagePreview.css'],

    template: () => `
        <div class="mpi-masked-preview">
            <div class="mpi-masked-preview__stack" id="stack">
                <img class="mpi-masked-preview__base"   id="base-img"    draggable="false" />
                <img class="mpi-masked-preview__masked" id="masked-img"  draggable="false" />
            </div>
        </div>
    `,

    setup: (el, _props, _emit) => {
        const stackEl   = el.querySelector('#stack');
        const baseImg   = el.querySelector('#base-img');
        const maskedImg = el.querySelector('#masked-img');

        const view = new ViewManager();
        let _imgNaturalW = 0;
        let _imgNaturalH = 0;

        // ── Transform helpers ─────────────────────────────────────────────────

        function _applyTransform() {
            stackEl.style.transform = view.getCSSTransform();
        }

        // ── Pan / zoom ────────────────────────────────────────────────────────

        let _isPanning   = false;
        let _panStartX   = 0;
        let _panStartY   = 0;

        function _onWheel(e) {
            e.preventDefault();
            const rect   = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const delta  = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newScale = Math.min(view.maxScale, Math.max(view.minScale, view.scale * delta));
            view.offsetX = mouseX - (mouseX - view.offsetX) * (newScale / view.scale);
            view.offsetY = mouseY - (mouseY - view.offsetY) * (newScale / view.scale);
            view.scale = newScale;
            view.isManagedView = false;
            _applyTransform();
        }

        function _onMouseDown(e) {
            // Match MpiCanvas pan UX: left or middle click pans. Cursor → 'move' while panning.
            if (e.button === 0 || e.button === 1) {
                _isPanning  = true;
                _panStartX  = e.clientX - view.offsetX;
                _panStartY  = e.clientY - view.offsetY;
                el.style.cursor = 'move';
            }
        }

        function _onMouseMove(e) {
            if (!_isPanning) return;
            view.offsetX = e.clientX - _panStartX;
            view.offsetY = e.clientY - _panStartY;
            view.isManagedView = false;
            _applyTransform();
        }

        function _onMouseUp() {
            if (_isPanning) {
                _isPanning = false;
                el.style.cursor = 'default';
            }
        }

        function _onDblClick() {
            // Reset view to fit, like MpiCanvas dblclick.
            // Must set isManagedView=true BEFORE refit — refit bails early if false.
            view.isManagedView = true;
            const rect = el.getBoundingClientRect();
            view.refit(rect.width, rect.height, _imgNaturalW, _imgNaturalH);
            _applyTransform();
        }

        el.addEventListener('wheel',     _onWheel,    { passive: false });
        el.addEventListener('mousedown', _onMouseDown);
        el.addEventListener('mousemove', _onMouseMove);
        el.addEventListener('mouseup',   _onMouseUp);
        el.addEventListener('mouseleave',_onMouseUp);
        el.addEventListener('dblclick',  _onDblClick);

        // ── Resize ────────────────────────────────────────────────────────────

        const resizeObserver = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect();
            if (view.isManagedView && _imgNaturalW) {
                view.refit(rect.width, rect.height, _imgNaturalW, _imgNaturalH);
                _applyTransform();
            }
        });
        resizeObserver.observe(el);

        // ── Image load ────────────────────────────────────────────────────────

        el.loadImage = async (url) => {
            await new Promise((resolve, reject) => {
                baseImg.onload  = resolve;
                baseImg.onerror = reject;
                baseImg.src     = url;
            });

            _imgNaturalW = baseImg.naturalWidth;
            _imgNaturalH = baseImg.naturalHeight;

            // Size stack to image native px
            stackEl.style.width  = _imgNaturalW + 'px';
            stackEl.style.height = _imgNaturalH + 'px';

            // Reset masked-img size to match
            maskedImg.style.width  = _imgNaturalW + 'px';
            maskedImg.style.height = _imgNaturalH + 'px';

            // Reset mask overlay
            maskedImg.style.webkitMaskImage = '';
            maskedImg.style.maskImage       = '';
            maskedImg.src = url;
            maskedImg.style.display = 'none';

            await view.reset(el, baseImg);
            view.isManagedView = true;
            _applyTransform();
        };

        el.setMaskDataURL = (dataUrl) => {
            if (!dataUrl) { el.clearMask(); return; }
            // Mask data URL is opaque PNG: black = unpainted, white = painted.
            // Use luminance mode so white reveals overlay, black hides it.
            maskedImg.style.webkitMaskImage = `url("${dataUrl}")`;
            maskedImg.style.maskImage       = `url("${dataUrl}")`;
            maskedImg.style.webkitMaskSize  = '100% 100%';
            maskedImg.style.maskSize        = '100% 100%';
            maskedImg.style.webkitMaskMode  = 'luminance';
            maskedImg.style.maskMode        = 'luminance';
            maskedImg.style.display         = '';
        };

        el.clearMask = () => {
            maskedImg.style.webkitMaskImage = '';
            maskedImg.style.maskImage       = '';
            maskedImg.style.display         = 'none';
        };

        // ── Destroy ───────────────────────────────────────────────────────────

        el.destroy = () => {
            resizeObserver.disconnect();
            el.removeEventListener('wheel',     _onWheel);
            el.removeEventListener('mousedown', _onMouseDown);
            el.removeEventListener('mousemove', _onMouseMove);
            el.removeEventListener('mouseup',   _onMouseUp);
            el.removeEventListener('mouseleave',_onMouseUp);
            el.removeEventListener('dblclick',  _onDblClick);
        };
    },
});
