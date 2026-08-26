import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { PaintManager } from '../../Primitives/MpiCanvas/managers/PaintManager.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import {
    BRUSH_PRESETS, DEFAULT_BRUSH_PRESET, drawBrushRing,
} from '../../Primitives/MpiCanvas/managers/brushDab.js';
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
 * brush, mode }` — `size` is the SOURCE image's natural pixel size, which is what
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
 * needs a brush/eraser pair, a shape, a colour and an undo. Making a flow declare
 * them would be error-prone boilerplate a manifest author could silently omit,
 * leaving a canvas the user cannot erase on. It is still one row and still
 * nothing but Primitives (carousel-frame.md § the one-row cap).
 *
 * BRUSH SHAPE IS THE SAME TEN `BRUSH_PRESETS` THE MASK BRUSH HAS (MPI-435), and
 * it is a CONTROL, not new paint code: `PaintManager.brushPreset` already exists
 * and the shared dab already reads it (`PaintManager` ~195). `MpiMaskStrip` mounts
 * the identical dropdown for the History tools; this is the flow-step surface of
 * the same setting, so a user who shapes a brush in one place meets it in the
 * other. It opens UP, unlike the strip's — that row sits near the top of the
 * sidebar, this one sits under a 46vh stage and a downward list would run off the
 * bottom of the slide.
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
/** Zoom per wheel unit — `InputController`'s own constant, so both zoom alike. */
const ZOOM_SPEED = 0.001;

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

/**
 * The FLATTENED picture: the source image (or flat white when there is none) with
 * the paint layer drawn over it, as an opaque PNG at the value's own size.
 *
 * The counterpart to `composePaintLayer`, and the two exist because a flow either
 * wants the drawing SEPARATE from the picture or wants them as one. Draw It In wants
 * them separate — its graph takes the photo and the drawing as two inputs so it can
 * decide where the drawing applies. Scribble (MPI-620) wants them as one: its graph
 * has a single image input and reads that image's RGB as the ControlNet hint, so a
 * bare RGBA layer would arrive with undefined colour everywhere alpha is 0 and the
 * preprocessor would read the transparent region as black — a near-empty hint from a
 * drawing that looked fine on screen.
 *
 * WHITE, not transparent, is the floor. Both control arms this feeds (scribble and
 * canny) encode strokes as light-on-dark after preprocessing, so the neutral ground
 * for a drawing is a blank white page — the same thing the user was drawing on.
 *
 * Returns null when there is neither a source nor a stroke: nothing was supplied and
 * nothing was drawn, so there is no picture to send and the frame treats the null as
 * "this kind changed nothing".
 *
 * @param {{paint?: string, size?: {w:number,h:number}}|null} value
 * @param {{url?: string}|null} media - the step's source image, or null for a blank canvas
 * @returns {Promise<File|null>}
 */
export async function composePaintComposite(value, media) {
    const w = Math.round(value?.size?.w || 0);
    const h = Math.round(value?.size?.h || 0);
    if (!(w > 0) || !(h > 0)) return null;

    const srcUrl = media?.url ? resolveMediaUrl(media.url) : '';
    const layerBytes = value?.paint ? _dataUrlBytes(value.paint) : null;
    if (!srcUrl && !layerBytes) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c2d = canvas.getContext('2d');
    // The ground IS the product here, not a theme colour: this page is what the graph
    // receives, and a scribble/canny preprocessor reads strokes as light-on-dark, so the
    // neutral ground has to be literal white whatever the app is themed.
    // eslint-disable-next-line mpi/no-hardcoded-hex-color -- see above
    c2d.fillStyle = '#ffffff';
    c2d.fillRect(0, 0, w, h);

    if (srcUrl) {
        // A failed decode must not take the drawing down with it — fall through to the
        // white ground and still send the strokes, which is a usable picture.
        const img = await new Promise((resolve) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = srcUrl;
        });
        if (img) c2d.drawImage(img, 0, 0, w, h);
    }
    if (layerBytes) {
        const bmp = await createImageBitmap(new Blob([layerBytes], { type: 'image/png' }));
        c2d.drawImage(bmp, 0, 0, w, h);
        bmp.close();
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'scribble.png', { type: 'image/png' }) : null;
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
                <div class="mpi-step-paint__brush" id="step-paint-brush"></div>
                <div class="mpi-step-paint__color" id="step-paint-color"></div>
                <div class="mpi-step-paint__actions" id="step-paint-actions"></div>
            </div>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const stageEl = qs('#step-paint-stage', el);
        const canvasEl = /** @type {HTMLCanvasElement} */ (qs('#step-paint-canvas', el));
        const modeSlot = qs('#step-paint-mode', el);
        const brushSlot = qs('#step-paint-brush', el);
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
        // No validation on the way in: `brushDab.getPreset()` falls back to the hard
        // round for an unknown id, so a stale value from an older snapshot degrades to
        // the pre-MPI-435 brush rather than throwing.
        paint.brushPreset = seeded.brush || DEFAULT_BRUSH_PRESET;

        // The canvas family's OWN viewport, not a hand-rolled triple (MPI-567). It
        // carries `minScale` (so a zoom-out cannot shrink past the fit) and
        // `isManagedView` (so a resize stops re-fitting once the user has moved the
        // view) — both of which a bare `{offsetX, offsetY, scale}` silently lacked.
        const view = new ViewManager();

        const imgEl = new Image();
        /**
         * Whether this step has a SOURCE image at all. A flow may mount the gizmo with
         * no media (MPI-620): the user draws on a blank canvas whose size comes from a
         * declared field instead of from a photo's natural dimensions.
         */
        const _hasMedia = !!props.media?.url;
        let _loaded = false;
        let _natural = { w: 1, h: 1 };
        let _drawing = false;
        /** Pointer in IMAGE px, for the brush ring. Null when off the canvas. */
        let _cursor = null;
        /** Space held = the pointer pans instead of painting (MPI-567). */
        let _spaceHeld = false;
        /** Last pointer position in CANVAS px while panning, or null. */
        let _panFrom = null;

        let _modeRadio = null;
        let _brushPicker = null;
        let _picker = null;
        let _undoBtn = null;

        // ── Geometry ─────────────────────────────────────────────────────────

        /**
         * Fit the whole image into the stage.
         *
         * An earlier version of this comment read *"No pan, no zoom — a step is one
         * gesture"*, and that decision is REVERSED (Fabio, 2026-08-23): hold Space and
         * the step pans and zooms exactly as the History canvas does. Drawing a ~96px
         * object into a 4000px photo through a 46vh window is not one gesture, it is
         * one gesture the user cannot see.
         *
         * `ViewManager.refit` fits into the box it is GIVEN and centres inside it, so
         * the edge slack comes off the container and goes back onto the offset. Its
         * `isManagedView` flag is what stops a resize from yanking the view back after
         * the user has panned — the wheel handler clears it, as InputController's does.
         */
        function _refit() {
            const cw = canvasEl.width;
            const ch = canvasEl.height;
            if (cw <= FIT_SLACK * 2 || ch <= FIT_SLACK * 2 || !_loaded) return;
            if (!view.isManagedView) return;
            view.refit(cw - FIT_SLACK * 2, ch - FIT_SLACK * 2, _natural.w, _natural.h);
            view.offsetX += FIT_SLACK;
            view.offsetY += FIT_SLACK;
        }

        /**
         * Client px → CANVAS px (the backing buffer). `view` lives in this space, so
         * pan deltas and the zoom anchor must be measured here, not in CSS px — the
         * canvas is sized to its box but the two only match at devicePixelRatio 1.
         */
        function _toCanvas(ev) {
            const r = canvasEl.getBoundingClientRect();
            return {
                x: (ev.clientX - r.left) * (canvasEl.width / r.width),
                y: (ev.clientY - r.top) * (canvasEl.height / r.height),
            };
        }

        /** Canvas px → image px. */
        function _toImage(ev) {
            const c = _toCanvas(ev);
            return {
                x: (c.x - view.offsetX) / view.scale,
                y: (c.y - view.offsetY) / view.scale,
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
            // With no source image there is nothing to draw UNDER the strokes, and
            // `drawImage` on a never-loaded Image is a no-op that would leave the stage
            // showing the page behind it. Paint the white page the user thinks they are
            // drawing on — the same ground `composePaintComposite` flattens onto, so the
            // step still shows exactly what the graph will receive.
            if (_hasMedia) ctx.drawImage(imgEl, view.offsetX, view.offsetY, w, h);
            else {
                // Matches the ground `composePaintComposite` flattens onto, so the step
                // shows exactly what the graph will receive.
                // eslint-disable-next-line mpi/no-hardcoded-hex-color -- see above
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(view.offsetX, view.offsetY, w, h);
            }
            ctx.drawImage(paint.paintCanvas, view.offsetX, view.offsetY, w, h);

            // No ring while Space is held: the pointer means PAN then, and the History
            // canvas hides it for the same reason (`_drawBrushIndicator`).
            if (!_cursor || _spaceHeld) return;
            // THE SHARED RING (MPI-567). This used to be a solid 1px white circle drawn
            // right here, identical for brush and eraser — a worse re-invention of a
            // ring that had already been debugged, which is exactly what this file's
            // header forbids for strokes. `brushDab` owns it now, so the eraser is
            // frost-blue here as it is on the History canvas.
            drawBrushRing(
                ctx,
                view.offsetX + _cursor.x * view.scale,
                view.offsetY + _cursor.y * view.scale,
                (paint.brushSize / 2) * view.scale,
                { eraser: paint.brushType === 'eraser' },
            );
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
        function _value() {
            return {
                paint: _layerUrl(),
                size: { ..._natural },
                color: paint.color,
                brushSize: paint.brushSize,
                brush: paint.brushPreset,
                mode: paint.brushType,
            };
        }

        function _report() {
            props.onChange?.(_value());
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

        // The dab is shared with the History paint tool, so this is a setting, not a
        // second brush engine — nothing below touches how a stroke is laid down.
        _brushPicker = MpiDropdown.mount(brushSlot, {
            options: BRUSH_PRESETS.map(p => ({ label: p.label, value: p.id })),
            value: paint.brushPreset,
            direction: 'up',
            info: 'Brush shape — hardness, scatter and flow, generated per dab',
        });
        _brushPicker.on('change', ({ value }) => {
            paint.brushPreset = value;
            // Moves no pixel, so there is nothing to record on the UndoStack — the
            // same reason the colour swap and the size wheel record nothing.
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

        // B / E, the same ids `MpiMaskStrip` binds (MPI-567). Routed THROUGH the radio
        // rather than setting `paint.brushType` directly: `setValue` emits `select`, so
        // the control and the manager cannot disagree about which tool is armed — a
        // direct write would swap the brush while the row kept showing the old one.
        // `allowWhileTyping: false` in the registry is what keeps them off the prompt
        // field this step also carries.
        _unsubs.push(Hotkeys.bind('mask.brush.toolbar', () => _modeRadio?.el?.setValue('brush')));
        _unsubs.push(Hotkeys.bind('mask.eraser.toolbar', () => _modeRadio?.el?.setValue('eraser')));

        // ── Pointer ──────────────────────────────────────────────────────────

        _unsubs.push(on(canvasEl, 'mousedown', (ev) => {
            if (!_loaded || ev.button !== 0) return;
            ev.preventDefault();
            // Space wins over the brush, exactly as InputController orders it: every
            // one of its draw branches is guarded on `!this.isSpacePressed`.
            if (_spaceHeld) {
                _panFrom = _toCanvas(ev);
                return;
            }
            _beginStroke(_toImage(ev));
        }));

        _unsubs.push(on(window, 'mousemove', (ev) => {
            if (!_loaded) return;
            if (_panFrom) {
                const c = _toCanvas(ev);
                view.offsetX += c.x - _panFrom.x;
                view.offsetY += c.y - _panFrom.y;
                _panFrom = c;
                _draw();
                return;
            }
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

        _unsubs.push(on(window, 'mouseup', () => {
            _panFrom = null;
            _endStroke();
        }));

        // The wheel means two things, split by Space, exactly as InputController
        // splits it on the History canvas: brush size normally, ZOOM while panning.
        _unsubs.push(on(canvasEl, 'wheel', (ev) => {
            if (!_loaded) return;
            ev.preventDefault();
            if (_spaceHeld) {
                // InputController's own constants and cursor-anchored maths, so the two
                // surfaces zoom at the same rate under the same gesture.
                view.isManagedView = false;
                const factor = Math.exp(-ev.deltaY * ZOOM_SPEED);
                const old = view.scale;
                view.scale = Math.max(view.minScale, Math.min(view.maxScale, old * factor));
                const c = _toCanvas(ev);
                // Keep the image point under the cursor pinned across the scale change.
                view.offsetX = c.x - ((c.x - view.offsetX) / old) * view.scale;
                view.offsetY = c.y - ((c.y - view.offsetY) / old) * view.scale;
                _draw();
                return;
            }
            const next = paint.brushSize + (ev.deltaY > 0 ? -BRUSH_STEP : BRUSH_STEP);
            paint.brushSize = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, next));
            _draw();
            _report();
        }, { passive: false }));

        // ── Space = pan/zoom ─────────────────────────────────────────────────
        // The canvas family's OWN registry ids, so the gesture is one thing app-wide
        // and no new hotkey is invented for a step. InputController binds these too and
        // every handler for an id fires — harmless here, because it only pans on a
        // mousedown ITS container receives, and the flow overlay takes those.
        _unsubs.push(Hotkeys.bind('canvas.pan.start', () => {
            if (_spaceHeld) return;
            _spaceHeld = true;
            // Close any open stroke first, or the capture stays open and the NEXT
            // commit swallows both — the reason InputController calls _endPaintStroke
            // here rather than just setting the flag.
            _endStroke();
            canvasEl.style.cursor = 'move';
            _draw();
        }));
        _unsubs.push(Hotkeys.bind('canvas.pan.end', () => {
            _spaceHeld = false;
            _panFrom = null;
            // Back to the ring being the cursor.
            canvasEl.style.cursor = '';
            _draw();
        }));

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

        /**
         * Arm the drawing surface at w x h. EVERY path that establishes a size runs
         * through here, and that is the point: this whole body used to live inside the
         * `load` handler, so a gizmo mounted with no media never ran ANY of it —
         * `_natural` kept its `{1, 1}` fallback, `size` reported 1x1, and because that
         * passes `composePaintLayer`'s `w > 0 && h > 0` guard the flow would have sent
         * a 1x1 PNG and generated from it. No error, no warning (MPI-620).
         */
        function _initSurface(w, h, restoreUrl = seeded.paint) {
            _natural = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
            _loaded = true;
            // init() sizes the layer to the source and clears it WITHOUT recording —
            // a load is not an edit anyone could have undone (docs/masking-undo.md).
            paint.init(_natural.w, _natural.h);
            undo.clear();
            _syncCanvasSize();
            _refit();
            const restore = restoreUrl
                ? paint.setFromDataURL(restoreUrl)
                : Promise.resolve();
            // The memoised URL describes the layer at its OLD size, and re-arming the
            // surface has just changed that size. Without this the next report would
            // hand the run a stale data URL alongside the NEW `size`, and
            // `composePaintComposite` would stretch one into the other — a silently
            // distorted drawing, which is exactly the class of bug the memo exists
            // inside of. One extra encode at mount is the whole cost.
            _urlDirty = true;
            restore.then(() => {
                _draw();
                _report();
            });
        }

        /**
         * The layer re-canvassed to a new page size, as a PNG data URL: drawn at 1:1,
         * centred, growing edges filled with transparency and shrinking edges cropped.
         *
         * `PaintManager.setFromDataURL` draws its image across the whole canvas
         * (`drawImage(img, 0, 0, canvas.width, canvas.height)`), so handing it a square
         * layer for a wide canvas would STRETCH the drawing rather than place it. This
         * pre-renders into the destination size so that call becomes 1:1.
         *
         * THIS USED TO SCALE (contain-fit) AND THAT WAS WRONG TWICE OVER. It COMPOUNDED
         * — each reshape fitted the already-fitted result, so square → portrait → square
         * came back smaller with white margin on all four sides, and Fabio hit it on his
         * second reshape. And it was the wrong idea to begin with: the control is called
         * CANVAS SIZE, so it changes the page the drawing sits on, exactly as an image
         * editor's canvas-size command does. It does not resize the artwork.
         *
         * Paired with `_master` below, this is fully reversible: going to another shape
         * and back returns the drawing to precisely where it was.
         */
        async function _recanvasLayer(url, from, to) {
            const img = await new Promise((resolve) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => resolve(null);
                i.src = url;
            });
            if (!img) return null;
            const canvas = document.createElement('canvas');
            canvas.width = to.w;
            canvas.height = to.h;
            canvas.getContext('2d').drawImage(
                img, Math.round((to.w - from.w) / 2), Math.round((to.h - from.h) / 2),
            );
            return canvas.toDataURL('image/png');
        }

        /**
         * The layer as last DRAWN, never as last reshaped — `{ url, w, h }`.
         *
         * Re-canvassing always works from THIS rather than from whatever is currently on
         * the canvas, which is what makes a round trip lossless: reshaping crops the
         * axis that shrank, and fitting the next reshape from the cropped result would
         * lose those pixels permanently. Refreshed only when the user has actually drawn
         * since it was taken, detected via `_urlDirty` — `_report()` clears that flag at
         * the end of every reshape, so a true reading means real strokes, not the
         * reshape's own re-encode.
         * @type {{url: string, w: number, h: number}|null}
         */
        let _master = null;

        /**
         * The blank canvas's size, from the step's own declared `canvasSize` field
         * ("<w>x<h>"). Read from `props.value` because a step's fields are seeded into
         * `_stepValues[role].fields` at SETUP and handed here AT MOUNT — which is the
         * only place a value is readable before the first `_report()`.
         */
        function _parseSize(raw) {
            const [w, h] = String(raw || '').split('x').map(n => parseInt(n, 10));
            return (w > 0 && h > 0) ? { w, h } : { w: 1024, h: 1024 };
        }

        function _blankSize() {
            return _parseSize(props.value?.fields?.canvasSize);
        }

        _unsubs.push(on(imgEl, 'load', () => {
            _initSurface(imgEl.naturalWidth || 1, imgEl.naturalHeight || 1);
        }));

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        // Source last: with the handler wired, a cached image still fires load.
        const url = _hasMedia ? resolveMediaUrl(props.media.url) : '';
        if (url) imgEl.src = url;
        // No source, so no `load` will ever fire — arm the surface directly, NOW, before
        // anything can report. This is the line that makes the gizmo media-optional.
        else _initSurface(_blankSize().w, _blankSize().h);

        /**
         * The frame calls this when one of THIS step's declared fields changes
         * (`MpiBaseFlow._buildStepSlide`). Only the canvas size matters here, and only
         * on a blank canvas — an uploaded drawing's own dimensions are the size.
         *
         * ponytail: a resize is refused once anything has been drawn, rather than
         * re-sizing the existing strokes or silently discarding them. Re-arming the
         * surface calls `undo.clear()`, so an unconditional resize would destroy a
         * drawing with no way back. Lift this to a real resize (rescale the layer into
         * the new dimensions) if anyone actually asks to change shape mid-drawing.
         */
        el.onField = async (fieldId, val) => {
            if (fieldId !== 'canvasSize' || _hasMedia) return;
            // THE NEW VALUE COMES FROM THE ARGUMENT, never from `props.value`. The frame
            // writes a field by REPLACING the step's value object
            // (`_writeDeclaredField`: `_stepValues[role] = { ...prev, fields: {...} }`),
            // so the object captured in this closure at mount is the OLD one and keeps
            // the OLD size forever. Reading it here left the canvas square whatever the
            // user picked — the control moved, nothing else did.
            const to = _parseSize(val);
            if (to.w === _natural.w && to.h === _natural.h) return;

            // THE DRAWING SURVIVES THE RESHAPE. This used to bail when the layer was
            // non-empty, because re-arming the surface calls `undo.clear()` and an
            // unconditional resize would have destroyed the drawing with no way back.
            // Refusing was worse than either option: the control moved and nothing
            // happened, so Fabio would not touch it at all rather than risk a picture
            // he had just spent real time on (2026-08-26).
            //
            // Work from `_master`, not from the canvas: re-canvassing crops whichever
            // axis shrank, so feeding the next reshape the cropped result would lose
            // those pixels for good and the drawing would erode with every change.
            // `_urlDirty` is the "drew since the master was taken" signal — `_report()`
            // clears it at the end of every reshape, so it is only true for real strokes.
            if (!_master || _urlDirty) {
                _master = { url: _layerUrl(), w: _natural.w, h: _natural.h };
            }
            const carried = _master.url
                ? await _recanvasLayer(_master.url, _master, to)
                : null;
            _initSurface(to.w, to.h, carried);
        };

        // One literal, two callers — the reported value and the pulled value cannot
        // disagree about a key, which is how `brush` would have gone missing from one.
        el.getValue = _value;

        el.destroy = () => {
            _ro.disconnect();
            undo.destroy();
            _modeRadio?.destroy?.();
            _brushPicker?.destroy?.();
            _picker?.destroy?.();
            undoInst?.destroy?.();
            clearInst?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
