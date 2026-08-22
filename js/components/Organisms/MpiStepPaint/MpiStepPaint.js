import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { PaintManager } from '../../Primitives/MpiCanvas/managers/PaintManager.js';
import { UndoStack } from '../../Primitives/MpiCanvas/managers/UndoStack.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiStepPaint — the `paint` step kind (MPI-567).
 *
 * The user DRAWS on their own photo, and what the graph receives is the drawing
 * ALONE: an RGBA PNG at the photo's resolution, transparent everywhere the user
 * did not paint. That is the shape Scribble-to-object's graph wants — its
 * `Input_Paint` node feeds both a ControlNet hint (RGB over flat white) and a
 * crop rect (the layer's own ALPHA → `InvertMask` → `MpiMaskSquareBbox`), so a
 * flattened composite would destroy the second use outright.
 *
 * Contract (every step kind implements it):
 *   props  { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * Value shape: `{ paint: <PNG data URL>|null, size: {w,h}, color, brushSize,
 * mode }` — `size` is the SOURCE image's natural pixel size, which is what
 * `composePaintLayer` redraws into. See § Resolution below for why that is not
 * the same as the layer's own size.
 *
 * NOTHING HERE IS A SECOND BRUSH. `PaintManager` is the History paint tool's own
 * RGBA layer and `brushDab.js` its dab geometry, both mounted whole — the same
 * relationship `MpiStepCrop` has with `CropManager`. Any change to how a stroke
 * BEHAVES belongs in those two, where the History tool gets it as well
 * (`docs/painting.md`). What this component adds is only the stage: a canvas, a
 * fitted view, and the pointer plumbing, because `MpiCanvas`'s own stage carries
 * mask layers, a tool router and an entry lifecycle a flow step has no use for.
 *
 * 🔴 UNDO IS NOT OPTIONAL. Every mutation of the layer records into the shared
 * `UndoStack` — a stroke as a gesture (`begin` → `commit(takeStrokeBox())`),
 * Clear as `PaintManager.clear()`'s own layer-wide one-shot. An unrecorded
 * mutation is a silent hole in Ctrl+Z (`docs/masking-undo.md` § The contract).
 * The stack is this component's own instance, not the canvas's: a flow step has
 * no entry to switch and nothing else on it to walk back into.
 *
 * ### The control row is the GIZMO's, not declared `fields`
 *
 * Same exception `MpiStepCrop`'s ratio bar takes, for the same kind of reason:
 * these controls are INTRINSIC — every paint step, in every flow ever written,
 * needs a brush/eraser pair, a colour and an undo. Making a flow declare them
 * would be error-prone boilerplate a manifest author could silently omit,
 * leaving a canvas the user cannot erase on. It is still one row and still
 * nothing but Primitives (carousel-frame.md § the one-row cap).
 *
 * BRUSH SIZE IS THE WHEEL, not a slider — the same gesture `InputController`
 * gives the History brush, so the two surfaces read identically and the row
 * keeps a slot. The ring drawn under the cursor is what makes it legible.
 *
 * ### Resolution — the trap this component exists to not fall into
 *
 * `PaintManager` caps its layer at `PAINT_MAX_EDGE` (4096), so on a larger photo
 * the layer is SMALLER than the source. The graph crops and pastes by
 * coordinates read off this layer's alpha, so a layer at a different size than
 * the photo would land the object at the wrong place and scale — silently, with
 * a plausible-looking result. `size` therefore carries the SOURCE's natural
 * dimensions and `composePaintLayer` redraws into them; at or below 4096 that is
 * a 1:1 copy and costs nothing.
 */

/** Layer opacity is pinned at 1: what is drawn is exactly what is exported. */
const OPACITY = 1;

/** Brush size in IMAGE px — `PaintManager`'s own default, so the two surfaces match. */
const DEFAULT_BRUSH = 40;
const MIN_BRUSH = 2;
const MAX_BRUSH = 400;
/** Wheel step, matching `InputController`'s brush wheel. */
const BRUSH_STEP = 5;

/** Accent-adjacent, so a fresh stroke never reads as a mask overlay. */
// eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
const DEFAULT_COLOR = '#e0446b';

/** Screen px kept clear around the fitted image, so a stroke at the edge is visible. */
const FIT_SLACK = 8;

const MODES = [
    { label: 'Brush', value: 'brush', icon: 'brush', info: 'Draw' },
    { label: 'Eraser', value: 'eraser', icon: 'eraser', info: 'Erase what you drew' },
];

/**
 * Decode a `data:` URL into bytes WITHOUT `fetch`.
 *
 * `fetch('data:…')` works in a browser but is one more thing a content policy can
 * refuse, and this is four lines of `atob`. Returns null for anything that is not
 * a base64 data URL, so a garbage value cannot become an empty PNG the graph then
 * loads as a blank drawing.
 *
 * @param {string} dataUrl
 * @returns {Uint8Array|null}
 */
function _dataUrlBytes(dataUrl) {
    const comma = String(dataUrl || '').indexOf(',');
    if (comma < 0 || !/^data:[^,]*;base64$/i.test(dataUrl.slice(0, comma))) return null;
    const bin = atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * The file the GRAPH runs on: the paint layer ALONE, at the SOURCE image's
 * resolution, transparent everywhere the user did not paint.
 *
 * Never the composite. The graph reads this file twice — its RGB over flat white
 * becomes the ControlNet hint, its ALPHA becomes the crop rect — and a flattened
 * photo would make the alpha the whole frame, so the crop would silently select
 * everything and the object would render from a hint that is the entire picture.
 *
 * Pixels only: the caller places the result in the project's preview-asset store,
 * because storage is the frame's job and never a gizmo's (stepKinds.js
 * § STEP_MEDIA).
 *
 * Returns null when nothing was drawn — there is no layer to send, and the frame
 * treats a null as "this kind changed nothing" rather than as a failure.
 *
 * @param {{paint?: string, size?: {w:number,h:number}}|null} value
 * @returns {Promise<File|null>}
 */
export async function composePaintLayer(value) {
    const dataUrl = value?.paint;
    const w = Math.round(value?.size?.w || 0);
    const h = Math.round(value?.size?.h || 0);
    if (!dataUrl || !(w > 0) || !(h > 0)) return null;

    const bytes = _dataUrlBytes(dataUrl);
    if (!bytes) return null;

    const src = new Blob([bytes], { type: 'image/png' });
    // The stored layer is at PaintManager's own working size, which is the source
    // size only while the source is within PAINT_MAX_EDGE. Redrawing into w × h
    // makes that difference disappear for every consumer downstream.
    const bmp = await createImageBitmap(src);
    if (bmp.width === w && bmp.height === h) {
        bmp.close();
        return new File([src], 'paint.png', { type: 'image/png' });
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'paint.png', { type: 'image/png' }) : null;
}

export const MpiStepPaint = ComponentFactory.create({
    name: 'MpiStepPaint',
    css: ['js/components/Organisms/MpiStepPaint/MpiStepPaint.css'],

    template: () => `
        <div class="mpi-step-paint">
            <div class="mpi-step-paint__stage" id="step-paint-stage">
                <canvas class="mpi-step-paint__canvas" id="step-paint-canvas"></canvas>
            </div>
            <div class="mpi-step-paint__bar">
                <div class="mpi-step-paint__mode" id="step-paint-mode"></div>
                <div class="mpi-step-paint__color" id="step-paint-color"></div>
                <div class="mpi-step-paint__actions" id="step-paint-actions"></div>
            </div>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const stageEl = qs('#step-paint-stage', el);
        const canvasEl = /** @type {HTMLCanvasElement} */ (qs('#step-paint-canvas', el));
        const modeSlot = qs('#step-paint-mode', el);
        const colorSlot = qs('#step-paint-color', el);
        const actionSlot = qs('#step-paint-actions', el);

        const ctx = canvasEl.getContext('2d');

        const paint = new PaintManager();
        const undo = new UndoStack();
        paint.undo = undo;
        paint.opacity = OPACITY;
        paint.isPaintingMode = true;

        const seeded = props.value || {};
        paint.color = seeded.color || DEFAULT_COLOR;
        paint.brushSize = seeded.brushSize || DEFAULT_BRUSH;
        paint.brushType = seeded.mode === 'eraser' ? 'eraser' : 'brush';

        /** Screen-space view over image space. Recomputed by _refit. */
        const view = { offsetX: 0, offsetY: 0, scale: 1 };

        const imgEl = new Image();
        let _loaded = false;
        let _natural = { w: 1, h: 1 };
        let _drawing = false;
        /** Pointer in IMAGE px, for the brush ring. Null when off the canvas. */
        let _cursor = null;

        let _modeRadio = null;
        let _picker = null;
        let _undoBtn = null;

        // ── Geometry ─────────────────────────────────────────────────────────

        /** Fit the whole image into the stage. No pan, no zoom — a step is one gesture. */
        function _refit() {
            const cw = canvasEl.width;
            const ch = canvasEl.height;
            if (cw <= FIT_SLACK * 2 || ch <= FIT_SLACK * 2 || !_loaded) return;
            view.scale = Math.min(
                (cw - FIT_SLACK * 2) / _natural.w,
                (ch - FIT_SLACK * 2) / _natural.h,
            );
            view.offsetX = (cw - _natural.w * view.scale) / 2;
            view.offsetY = (ch - _natural.h * view.scale) / 2;
        }

        /** Canvas px → image px. */
        function _toImage(ev) {
            const r = canvasEl.getBoundingClientRect();
            return {
                x: ((ev.clientX - r.left) * (canvasEl.width / r.width) - view.offsetX) / view.scale,
                y: ((ev.clientY - r.top) * (canvasEl.height / r.height) - view.offsetY) / view.scale,
            };
        }

        // ── Paint ────────────────────────────────────────────────────────────

        /**
         * One pass, painter's order: the photo, the paint layer over it at its own
         * export opacity (so the step shows exactly what the graph will receive),
         * then the brush ring.
         */
        function _draw() {
            if (!ctx) return;
            const { width: cw, height: ch } = canvasEl;
            ctx.clearRect(0, 0, cw, ch);
            if (!_loaded) return;

            const w = _natural.w * view.scale;
            const h = _natural.h * view.scale;
            ctx.drawImage(imgEl, view.offsetX, view.offsetY, w, h);
            ctx.drawImage(paint.paintCanvas, view.offsetX, view.offsetY, w, h);

            if (!_cursor) return;
            const r = (paint.brushSize / 2) * view.scale;
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(
                view.offsetX + _cursor.x * view.scale,
                view.offsetY + _cursor.y * view.scale,
                Math.max(1, r), 0, Math.PI * 2,
            );
            ctx.stroke();
            ctx.restore();
        }

        /**
         * The layer as a PNG data URL, MEMOISED.
         *
         * `getURL()` runs `isEmpty()` — a full alpha scan — and then re-encodes the
         * whole layer, which at PAINT_MAX_EDGE is 16.7M px. A wheel tick or a colour
         * change moves no pixel, so re-encoding on every report would charge that to
         * gestures that changed nothing. Only the four real mutations set the flag.
         */
        let _url = seeded.paint || null;
        let _urlDirty = false;
        function _layerUrl() {
            if (_urlDirty) {
                _url = paint.getURL();
                _urlDirty = false;
            }
            return _url;
        }

        /**
         * Report upward. The LAYER travels as a PNG data URL, which is what makes
         * Reuse restore the user's own drawing with no frame change: `stepValues`
         * is the persisted snapshot, so whatever is reported here comes back.
         *
         * ponytail: base64 pixels in the run snapshot. A scribble is mostly
         * transparent and PNG costs almost nothing for that, so the realistic bill
         * is tens of KB — but it IS unbounded by a full-coverage paint. The upgrade
         * is to place the layer in the preview-asset store on stroke end and store
         * its path instead; that trades this line for an async write per stroke and
         * a GC question, so do it when a measured snapshot is actually too big.
         */
        function _report() {
            props.onChange?.({
                paint: _layerUrl(),
                size: { ..._natural },
                color: paint.color,
                brushSize: paint.brushSize,
                mode: paint.brushType,
            });
            if (_undoBtn) _undoBtn.disabled = !undo.canUndo();
        }

        // ── Mutations — every one of these records into the stack ─────────────

        /**
         * A stroke is a GESTURE: capture at pointerdown, commit the dirty box at
         * pointerup, abort when it painted nothing (`docs/masking-undo.md`).
         */
        function _beginStroke(p) {
            _drawing = true;
            undo.begin(paint.undoLayers());
            paint.paint(p.x, p.y);
            _draw();
        }

        function _endStroke() {
            if (!_drawing) return;
            _drawing = false;
            const box = paint.takeStrokeBox();
            if (box) undo.commit(box); else undo.abort();
            _urlDirty = true;
            _report();
        }

        function _clear() {
            // PaintManager.clear() records its own layer-wide entry AFTER its
            // empty-layer guard, so an empty Clear cannot push a dead entry.
            if (!paint.clear()) return;
            _urlDirty = true;
            _draw();
            _report();
        }

        function _undo() {
            if (!undo.undo()) return;
            _urlDirty = true;
            _draw();
            _report();
        }

        function _redo() {
            if (!undo.redo()) return;
            _urlDirty = true;
            _draw();
            _report();
        }

        // ── The control row ──────────────────────────────────────────────────

        _modeRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: MODES,
            value: paint.brushType,
            name: 'flow-paint-mode',
            iconOnly: true,
        });
        modeSlot.appendChild(_modeRadio.el);
        _modeRadio.on('select', ({ value }) => {
            paint.brushType = value === 'eraser' ? 'eraser' : 'brush';
            _report();
        });

        _picker = MpiColorPicker.mount(colorSlot, {
            value: paint.color,
            info: 'Drawing colour',
        });
        _picker.on('change', ({ hex }) => {
            paint.color = hex;
            _report();
        });

        const undoInst = MpiButton.mount(document.createElement('div'), {
            text: 'Undo', variant: 'secondary', size: 'sm',
            info: 'Undo the last stroke (Ctrl+Z)',
        });
        _undoBtn = undoInst.el;
        _undoBtn.disabled = true;
        actionSlot.appendChild(_undoBtn);
        _unsubs.push(on(_undoBtn, 'click', _undo));

        const clearInst = MpiButton.mount(document.createElement('div'), {
            text: 'Clear', variant: 'ghost', size: 'sm',
            info: 'Erase the whole drawing',
        });
        actionSlot.appendChild(clearInst.el);
        _unsubs.push(on(clearInst.el, 'click', _clear));

        // The canvas family's own registry ids, so Ctrl+Z means one thing app-wide.
        // The History canvas gates its handlers on `mask.isMaskingMode`, so a flow
        // open over an idle workspace cannot double-fire.
        _unsubs.push(Hotkeys.bind('mask.undo.canvas', _undo));
        _unsubs.push(Hotkeys.bind('mask.redo.canvas', _redo));

        // ── Pointer ──────────────────────────────────────────────────────────

        _unsubs.push(on(canvasEl, 'mousedown', (ev) => {
            if (!_loaded || ev.button !== 0) return;
            ev.preventDefault();
            _beginStroke(_toImage(ev));
        }));

        _unsubs.push(on(window, 'mousemove', (ev) => {
            if (!_loaded) return;
            const p = _toImage(ev);
            if (_drawing) {
                paint.paint(p.x, p.y);
                _cursor = p;
                _draw();
                return;
            }
            const r = canvasEl.getBoundingClientRect();
            const inside = ev.clientX >= r.left && ev.clientX <= r.right
                && ev.clientY >= r.top && ev.clientY <= r.bottom;
            const next = inside ? p : null;
            if (!next && !_cursor) return;
            _cursor = next;
            _draw();
        }));

        _unsubs.push(on(window, 'mouseup', _endStroke));

        // Brush size is the WHEEL, exactly as InputController gives it on the
        // History canvas — non-passive because the slide must not scroll under it.
        _unsubs.push(on(canvasEl, 'wheel', (ev) => {
            if (!_loaded) return;
            ev.preventDefault();
            const next = paint.brushSize + (ev.deltaY > 0 ? -BRUSH_STEP : BRUSH_STEP);
            paint.brushSize = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, next));
            _draw();
            _report();
        }, { passive: false }));

        // ── Sizing + load ────────────────────────────────────────────────────

        function _syncCanvasSize() {
            const w = Math.round(stageEl.clientWidth);
            const h = Math.round(stageEl.clientHeight);
            if (!w || !h || (w === canvasEl.width && h === canvasEl.height)) return;
            canvasEl.width = w;
            canvasEl.height = h;
            _refit();
            _draw();
        }

        _unsubs.push(on(imgEl, 'load', () => {
            _natural = { w: imgEl.naturalWidth || 1, h: imgEl.naturalHeight || 1 };
            _loaded = true;
            // init() sizes the layer to the source and clears it WITHOUT recording —
            // a load is not an edit anyone could have undone (docs/masking-undo.md).
            paint.init(_natural.w, _natural.h);
            undo.clear();
            _syncCanvasSize();
            _refit();
            const restore = seeded.paint
                ? paint.setFromDataURL(seeded.paint)
                : Promise.resolve();
            restore.then(() => {
                _draw();
                _report();
            });
        }));

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        // Source last: with the handler wired, a cached image still fires load.
        const url = props.media?.url ? resolveMediaUrl(props.media.url) : '';
        if (url) imgEl.src = url;

        el.getValue = () => ({
            paint: _layerUrl(),
            size: { ..._natural },
            color: paint.color,
            brushSize: paint.brushSize,
            mode: paint.brushType,
        });

        el.destroy = () => {
            _ro.disconnect();
            undo.destroy();
            _modeRadio?.destroy?.();
            _picker?.destroy?.();
            undoInst?.destroy?.();
            clearInst?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
