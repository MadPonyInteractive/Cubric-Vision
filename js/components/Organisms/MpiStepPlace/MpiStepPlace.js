import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiCheckbox } from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MaskManager } from '../../Primitives/MpiCanvas/managers/MaskManager.js';
import { ShapeManager } from '../../Primitives/MpiCanvas/managers/ShapeManager.js';
import { CompositeManager } from '../../Primitives/MpiCanvas/managers/CompositeManager.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import { UndoStack } from '../../Primitives/MpiCanvas/managers/UndoStack.js';
import { drawBrushRing } from '../../Primitives/MpiCanvas/managers/brushDab.js';
import { enqueueGeneration } from '../../../services/generationService.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { qs, qsa, on } from '../../../utils/dom.js';

/**
 * MpiStepPlace — the `place` step kind (MPI-596).
 *
 * Stage 2 of Object Stamp: the user says WHERE in the scene a specific object
 * goes, and shapes the object's alpha until only the object is left. It is the
 * first step kind that reads TWO media roles — the scene it draws on
 * (`step.role`) and the object it places (`step.sourceRole`).
 *
 * Contract (every step kind implements it):
 *   props  { media, source, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * ── Two modes, because the MECHANISM differs (brief.md § The shape) ──────────
 *
 * `auto`   — the object's own pixels are used. The canvas shows the object under
 *            the gizmo, at the gizmo's aspect, and the run receives it stamped
 *            into the scene frame.
 * `manual` — only the REGION is used. The canvas shows an empty SQUARE box with
 *            no rotation, because the box is where the model looks rather than a
 *            placement, and a rotation handle would be a lie. The run receives
 *            the clean object at its own full frame.
 *
 * ── NOTHING HERE IS A SECOND BRUSH, A SECOND GIZMO OR A SECOND STAMP ────────
 *
 * Three History engines are mounted whole, the same relationship `MpiStepPaint`
 * has with `PaintManager`:
 *   · `ShapeManager` armed `'place'` — the handles, shape-local hit-testing,
 *     Shift's aspect lock and Alt-rotate all come from MPI-454's gizmo, so the
 *     flow step and the History Place tool can never drift apart.
 *   · `MaskManager` — its `manualCanvas`/`subtractCanvas` pair IS the add/subtract
 *     brush. `paint()` already mirrors the two layers per dab, which is what makes
 *     `manual AND NOT subtract` reconstructible after either stroke.
 *   · `CompositeManager.drawPlaced` / `rasterisePlace` — the rotated-rect stamp.
 *     `placeImage` duck-types on `.width`, so the composited object CANVAS goes
 *     straight in and no transform is forked.
 *
 * ### 🔴 TWO MASK LAYERS, COMPOSITED ONLY AT DISPATCH
 *
 * `bgMask` is the Remove Background cut-out's alpha; `userMask` is MaskManager's
 * pair. They are NEVER flattened into each other. Flatten them and toggling
 * Remove Background off destroys every erasure the user made — the toggle would
 * silently eat their work, which is the whole reason the split exists.
 *
 * Consequences that are features, not accidents:
 *   · THE BRUSH WORKS WITH THE TOGGLE OFF. With no cut-out the base alpha is the
 *     object's own rectangle, fully opaque, so a source BiRefNet whiffs entirely
 *     is still cuttable by hand.
 *   · Toggling off is free and toggling on twice is free — the original and the
 *     cut-out are both held, so neither costs a second dispatch (the same rule
 *     `MpiToolOptionsPlace` follows).
 *   · The composite is `alpha = (bgMask OR manual) AND NOT subtract`, and it runs
 *     against the ORIGINAL RGB — never the cut-out's — so Restore brings back the
 *     real pixels rather than a hole. A cut-out PNG may or may not preserve RGB
 *     under alpha 0 (`~/.claude/memory/tools/image-alpha-flatten.md`), so reading
 *     colour off it would work on one encoder and fail on the next.
 *
 * ### 🔴 UNDO IS NOT OPTIONAL
 *
 * Every mutation of the two mask layers records into this component's own
 * `UndoStack` — a stroke as a gesture (`begin` → `commit(takeStrokeBox())`),
 * Reset as `MaskManager.clear()`'s own layer-wide one-shot. The Remove Background
 * toggle records NOTHING and must not: it mutates neither layer, which is exactly
 * what the two-layer split buys (`docs/masking-undo.md` § The contract).
 *
 * ### The control row is the GIZMO's, not declared `fields`
 *
 * Same exception `MpiStepCrop`'s ratio bar and `MpiStepPaint`'s brush row take:
 * these controls are INTRINSIC — every place step needs a mode, a tool and a way
 * to cut the object out — so making a manifest declare them would be boilerplate
 * an author could silently omit, leaving a step whose object cannot be cut. The
 * Manual PROMPT is not among them: that is a declared field on the step, because
 * its wording is the flow's business and not this gizmo's.
 *
 * ### Space is the tool router, and there are THREE tools
 *
 * The gizmo body and the brush both want a drag, so one tool owns the pointer at
 * a time, exactly as `MpiCanvas` gates its brush on `shapeMode`. `move` drags the
 * gizmo; `erase`/`restore` paint. Erase and Restore are DISABLED in Manual and
 * say why — Manual draws no object on the canvas, so there is nothing to brush.
 * The two mask layers survive the mode switch, so cleaning a cut is: flip to
 * Auto, brush, flip back.
 *
 * ### Resolution
 *
 * `MaskManager` caps its layers at 1536 and is armed at the OBJECT's natural
 * size, not the scene's — an erasure belongs to the object and has to travel with
 * it when the user moves or scales the placement. Pointer coordinates therefore
 * cross two spaces: scene px → shape-local (`ShapeManager.toLocal`) → object px.
 */

/** Half-extent floor in scene px, matching `ShapeManager`'s own. */
const MIN_HALF = 6;

/** Brush size in SCENE px — `MaskManager`'s own default, so the surfaces match. */
const DEFAULT_BRUSH = 40;
const MIN_BRUSH = 2;
const MAX_BRUSH = 400;
/** Wheel step, matching `InputController`'s brush wheel. */
const BRUSH_STEP = 5;
/** Zoom per wheel unit — `InputController`'s own constant, so both zoom alike. */
const ZOOM_SPEED = 0.001;

/** Screen px kept clear around the fitted image, so a handle at the edge is grabbable. */
const FIT_SLACK = 16;

const MODES = [
    { label: 'Auto', value: 'auto', info: 'Use the object\'s own pixels — the model matches its lighting and scale to the scene' },
    { label: 'Manual', value: 'manual', info: 'Use only the region — describe how the object should sit, and the model re-renders it there' },
];

const TOOLS = [
    { label: 'Move', value: 'move', icon: 'place_stroke', info: 'Drag the object and its handles. Shift keeps its proportions, Alt over a handle rotates around it' },
    { label: 'Erase', value: 'erase', icon: 'eraser', info: 'Rub out part of the object' },
    { label: 'Restore', value: 'restore', icon: 'brush', info: 'Paint erased pixels back' },
];

const NO_OBJECT = 'Add the object image on the first step.';
const CUTTING = 'Removing the background…';
const CUT_FAILED = 'Background removal failed — the object is unchanged.';
const MANUAL_NO_BRUSH = 'Manual shows the region only, so there is no object on the canvas to brush. Switch to Auto to clean it up.';

/**
 * Decode an image URL, resolving to null rather than throwing.
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
function _loadImage(url) {
    return new Promise((resolve) => {
        if (!url) { resolve(null); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * The object's ORIGINAL pixels wearing the composited alpha.
 *
 * `alpha = (bgMask OR manual) AND NOT subtract` — the one place the two layers
 * meet, and it runs at dispatch and at draw time from the SAME function so the
 * canvas cannot show something the run will not receive.
 *
 * RGB always comes from `rgb`, never from `bgMask`: a Restore stroke has to
 * reveal real pixels, and a cut-out PNG's colour under alpha 0 is encoder-
 * dependent (memory `tools/image-alpha-flatten.md`).
 *
 * @param {CanvasImageSource} rgb the object as the user supplied it
 * @param {CanvasImageSource|null} bgMask the cut-out, read for its ALPHA only; null
 *   means Remove Background is off, and the base alpha is the whole rectangle
 * @param {CanvasImageSource|null} manual white where the user restored
 * @param {CanvasImageSource|null} subtract white where the user erased
 * @param {number} w object px
 * @param {number} h object px
 * @returns {HTMLCanvasElement}
 */
export function composeObjectAlpha(rgb, bgMask, manual, subtract, w, h) {
    const stencil = document.createElement('canvas');
    stencil.width = w;
    stencil.height = h;
    const sc = stencil.getContext('2d');
    if (bgMask) sc.drawImage(bgMask, 0, 0, w, h);
    else {
        // Any opaque colour: only the alpha channel of this canvas is ever read.
        sc.fillStyle = 'rgba(255, 255, 255, 1)';
        sc.fillRect(0, 0, w, h);
    }
    // Restore adds alpha, erase removes it — and erase runs LAST so a pixel the
    // user rubbed out stays out whether the cut-out or a restore stroke put it there.
    if (manual) sc.drawImage(manual, 0, 0, w, h);
    if (subtract) {
        sc.globalCompositeOperation = 'destination-out';
        sc.drawImage(subtract, 0, 0, w, h);
        sc.globalCompositeOperation = 'source-over';
    }

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const oc = out.getContext('2d');
    oc.drawImage(rgb, 0, 0, w, h);
    oc.globalCompositeOperation = 'destination-in';
    oc.drawImage(stencil, 0, 0, w, h);
    return out;
}

/** @param {HTMLCanvasElement} canvas @param {string} name @returns {Promise<File|null>} */
async function _toFile(canvas, name) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], name, { type: 'image/png' }) : null;
}

/**
 * The file the GRAPH runs on — ONE composited RGBA, and which one the MODE decides.
 *
 * `auto`   — the object stamped into the SCENE frame, transparent everywhere else.
 *            The graph reads its alpha for the crop region, exactly as Draw It In
 *            reads the paint layer's, so the placement needs no separate rect.
 * `manual` — the clean object at its OWN full frame. A reference embedded in a
 *            scene-sized frame is ~200px of a 1024 image and loses the identity
 *            this whole flow exists to keep (brief.md law 4).
 *
 * Rebuilt from URLs plus two small mask PNGs rather than from a stored composite:
 * `stepValues` is the persisted Reuse snapshot, and an object photo re-encoded
 * into it on every stroke would put megabytes in the project file.
 *
 * @param {Object|null} value the step's reported value
 * @returns {Promise<File|null>} null when there is no object to send
 */
export async function composePlacedObject(value) {
    const srcUrl = value?.sourceUrl;
    if (!srcUrl) return null;

    const rgb = await _loadImage(resolveMediaUrl(srcUrl));
    if (!rgb) return null;
    const ow = rgb.naturalWidth || 1;
    const oh = rgb.naturalHeight || 1;

    const bg = (value.removeBg && value.bgUrl)
        ? await _loadImage(resolveMediaUrl(value.bgUrl))
        : null;
    const manual = await _loadImage(value.userMask?.manual || '');
    const subtract = await _loadImage(value.userMask?.subtract || '');
    const object = composeObjectAlpha(rgb, bg, manual, subtract, ow, oh);

    if (value.mode === 'manual') return _toFile(object, 'object.png');

    const w = Math.round(value?.size?.w || 0);
    const h = Math.round(value?.size?.h || 0);
    const p = value?.place;
    if (!(w > 0) || !(h > 0) || !p) return null;

    // The SAME rotated-rect stamp the canvas drew, through the same manager, so the
    // dispatched picture cannot disagree with the one the user approved.
    const comp = new CompositeManager();
    comp.placeImage = object;
    const shape = new ShapeManager();
    shape.init(w, h);
    Object.assign(shape, {
        cx: p.cx, cy: p.cy, halfW: p.halfW, halfH: p.halfH, rot: p.rot || 0, hasShape: true,
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    comp.drawPlaced(canvas.getContext('2d'), shape, 1);
    return _toFile(canvas, 'placed.png');
}

export const MpiStepPlace = ComponentFactory.create({
    name: 'MpiStepPlace',
    css: ['js/components/Organisms/MpiStepPlace/MpiStepPlace.css'],

    template: () => `
        <div class="mpi-step-place">
            <div class="mpi-step-place__stage" id="step-place-stage">
                <canvas class="mpi-step-place__canvas" id="step-place-canvas"></canvas>
            </div>
            <div class="mpi-step-place__bar">
                <div class="mpi-step-place__mode" id="step-place-mode"></div>
                <div class="mpi-step-place__tool" id="step-place-tool"></div>
                <div class="mpi-step-place__bg" id="step-place-bg"></div>
                <div class="mpi-step-place__actions" id="step-place-actions"></div>
            </div>
            <p class="mpi-step-place__note" id="step-place-note"></p>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const stageEl = qs('#step-place-stage', el);
        const canvasEl = /** @type {HTMLCanvasElement} */ (qs('#step-place-canvas', el));
        const noteEl = qs('#step-place-note', el);
        const ctx = canvasEl.getContext('2d');

        const mask = new MaskManager();
        const shape = new ShapeManager();
        const comp = new CompositeManager();
        const view = new ViewManager();
        const undo = new UndoStack();
        mask.undo = undo;
        shape.setMode('place');

        const seeded = props.value || {};
        /** @type {'auto'|'manual'} */
        let _mode = seeded.mode === 'manual' ? 'manual' : 'auto';
        /** @type {'move'|'erase'|'restore'} */
        let _tool = 'move';
        let _removeBg = !!seeded.removeBg;
        /** Brush size in SCENE px. Converted to object px per dab — see `_paintAt`. */
        let _brush = seeded.brushSize || DEFAULT_BRUSH;
        mask.brushSize = _brush;
        mask.brushType = 'eraser';

        /** The object as the user supplied it — the RGB every composite runs against. */
        let _objImg = null;
        /** Its background-removed twin, read for ALPHA only. Cached so a second toggle-on is free. */
        let _cutImg = null;
        let _cutUrl = seeded.bgUrl || null;
        let _busy = false;
        let _cutFailed = false;

        const _sourceUrl = props.source?.url || null;
        let _sceneLoaded = false;
        let _scene = { w: 1, h: 1 };
        let _object = { w: 1, h: 1 };

        let _dragging = false;
        let _painting = false;
        /** Pointer in SCENE px, for the brush ring. Null when off the canvas. */
        let _cursor = null;
        let _spaceHeld = false;
        let _panFrom = null;

        const sceneImg = new Image();

        let _modeRadio = null;
        let _toolRadio = null;
        let _bgToggle = null;
        let _undoBtn = null;

        // ── Geometry ─────────────────────────────────────────────────────────

        function _refit() {
            const cw = canvasEl.width;
            const ch = canvasEl.height;
            if (cw <= FIT_SLACK * 2 || ch <= FIT_SLACK * 2 || !_sceneLoaded) return;
            if (!view.isManagedView) return;
            view.refit(cw - FIT_SLACK * 2, ch - FIT_SLACK * 2, _scene.w, _scene.h);
            view.offsetX += FIT_SLACK;
            view.offsetY += FIT_SLACK;
        }

        /** Client px → CANVAS px (the backing buffer), where `view` lives. */
        function _toCanvas(ev) {
            const r = canvasEl.getBoundingClientRect();
            return {
                x: (ev.clientX - r.left) * (canvasEl.width / r.width),
                y: (ev.clientY - r.top) * (canvasEl.height / r.height),
            };
        }

        /** Canvas px → SCENE image px. */
        function _toScene(ev) {
            const c = _toCanvas(ev);
            return {
                x: (c.x - view.offsetX) / view.scale,
                y: (c.y - view.offsetY) / view.scale,
            };
        }

        /**
         * SCENE px → OBJECT px, through the gizmo's own rotation.
         *
         * The mask belongs to the object, so a stroke has to be recorded where the
         * object will still carry it after the user moves, scales or rotates the
         * placement — recording in scene space would strand every erasure the moment
         * the gizmo moved.
         */
        function _toObject(p) {
            const l = shape.toLocal(p.x, p.y);
            return {
                x: ((l.x + shape.halfW) / (shape.halfW * 2)) * _object.w,
                y: ((l.y + shape.halfH) / (shape.halfH * 2)) * _object.h,
            };
        }

        /**
         * Object px per scene px.
         *
         * ponytail: the MEAN of the two axes, so a deliberately squashed placement
         * gets a round brush in scene space and a slightly oval footprint on the
         * object. Making it exact means an elliptical dab, which is a change to the
         * shared `brushDab` every mask tool in the app would inherit — not worth it
         * for a distortion the user chose.
         */
        function _objPerScene() {
            const sx = _object.w / Math.max(1, shape.halfW * 2);
            const sy = _object.h / Math.max(1, shape.halfH * 2);
            return (sx + sy) / 2;
        }

        /** Re-derive the gizmo's proportions about its current centre, keeping its area. */
        function _setAspect(aspect) {
            const area = Math.max(1, shape.halfW * shape.halfH);
            const a = Number.isFinite(aspect) && aspect > 0 ? Math.sqrt(aspect) : 1;
            const half = Math.sqrt(area);
            shape.halfW = Math.max(MIN_HALF, half * a);
            shape.halfH = Math.max(MIN_HALF, half / a);
        }

        function _objectAspect() {
            return _object.w > 0 && _object.h > 0 ? _object.w / _object.h : 1;
        }

        // ── The object composite ─────────────────────────────────────────────

        /** True while the mask layers have changed since the object canvas was built. */
        let _objDirty = true;

        /**
         * The composited object, rebuilt only when something actually moved a pixel.
         * A gizmo drag changes WHERE it is drawn, never WHAT is drawn, so dragging
         * costs no re-composite.
         */
        function _syncObject() {
            if (!_objDirty) return;
            _objDirty = false;
            comp.placeImage = _objImg
                ? composeObjectAlpha(
                    _objImg,
                    _removeBg ? _cutImg : null,
                    mask.manualCanvas,
                    mask.subtractCanvas,
                    _object.w, _object.h,
                )
                : null;
        }

        // ── Draw ─────────────────────────────────────────────────────────────

        function _canBrush() {
            return _mode === 'auto' && !!_objImg;
        }

        function _draw() {
            if (!ctx) return;
            const { width: cw, height: ch } = canvasEl;
            ctx.clearRect(0, 0, cw, ch);
            if (!_sceneLoaded) return;

            ctx.drawImage(
                sceneImg, view.offsetX, view.offsetY,
                _scene.w * view.scale, _scene.h * view.scale,
            );

            // AUTO ONLY. Manual's box is the region the model looks at, not a
            // placement — drawing the object inside it would promise a stamp the run
            // does not make (brief.md § The shape).
            if (_mode === 'auto') {
                _syncObject();
                if (comp.placeImage) {
                    ctx.save();
                    ctx.translate(view.offsetX, view.offsetY);
                    comp.drawPlaced(ctx, shape, view.scale);
                    ctx.restore();
                }
            }

            shape.drawScreen(ctx, view);

            if (!_cursor || _spaceHeld || _tool === 'move' || !_canBrush()) return;
            // The shared ring, so the eraser is the same frost-blue it is on the
            // History canvas. Radius is the SCENE-space brush, which is what the user
            // is aiming with.
            drawBrushRing(
                ctx,
                view.offsetX + _cursor.x * view.scale,
                view.offsetY + _cursor.y * view.scale,
                (_brush / 2) * view.scale,
                { eraser: _tool === 'erase' },
            );
        }

        // ── Report ───────────────────────────────────────────────────────────

        /**
         * The two mask layers as PNG data URLs, MEMOISED.
         *
         * `getManualURL()`/`getSubtractURL()` scan and re-encode both 1536-capped
         * layers; a gizmo drag or a wheel tick moves no mask pixel, so re-encoding on
         * every report would charge that to gestures that changed nothing.
         *
         * ponytail: two base64 layers in the run snapshot. A cut-up mask is mostly
         * transparent and 1536-capped, so the realistic bill is tens of KB — the same
         * trade `MpiStepPaint` documents. The upgrade is to place them in the
         * preview-asset store on stroke end and persist their paths instead; do it
         * when a measured snapshot is actually too big.
         */
        let _maskUrls = {
            manual: seeded.userMask?.manual || null,
            subtract: seeded.userMask?.subtract || null,
        };
        let _maskDirty = false;
        function _userMask() {
            if (_maskDirty) {
                _maskUrls = { manual: mask.getManualURL(), subtract: mask.getSubtractURL() };
                _maskDirty = false;
            }
            return _maskUrls;
        }

        function _value() {
            return {
                mode: _mode,
                removeBg: _removeBg,
                sourceUrl: _sourceUrl,
                bgUrl: _cutUrl,
                place: {
                    cx: shape.cx, cy: shape.cy,
                    halfW: shape.halfW, halfH: shape.halfH,
                    rot: shape.rot,
                },
                size: { ..._scene },
                objectSize: { ..._object },
                userMask: _userMask(),
                brushSize: _brush,
            };
        }

        function _report() {
            props.onChange?.(_value());
            if (_undoBtn) _undoBtn.disabled = !undo.canUndo();
        }

        /**
         * The note line doubles as the error surface, the same ruling
         * `MpiToolOptionsPlace` made: every way this step can fail is otherwise
         * silent — a failed cut leaves the object unchanged, which looks exactly like
         * a toggle that did nothing. Derived from flags rather than written per
         * caller, so two async results cannot erase each other's reason.
         */
        function _say() {
            noteEl.textContent = !_objImg ? NO_OBJECT
                : _busy ? CUTTING
                : _cutFailed ? CUT_FAILED
                : (_mode === 'manual' && _tool !== 'move') ? MANUAL_NO_BRUSH
                : '';
        }

        // ── Mutations — every one of these records into the stack ─────────────

        function _paintAt(p) {
            mask.brushSize = _brush * _objPerScene();
            const o = _toObject(p);
            mask.paint(o.x, o.y);
        }

        function _beginStroke(p) {
            _painting = true;
            undo.begin(mask.undoLayers());
            _paintAt(p);
            _objDirty = true;
            _draw();
        }

        function _endStroke() {
            if (!_painting) return;
            _painting = false;
            const box = mask.takeStrokeBox();
            if (box) undo.commit(box); else undo.abort();
            _maskDirty = true;
            _objDirty = true;
            _report();
        }

        function _reset() {
            // MaskManager.clear() records its own layer-wide entry, so an empty Reset
            // pushes nothing. It also drops points/picks this step never uses.
            mask.clear();
            _maskDirty = true;
            _objDirty = true;
            _draw();
            _report();
        }

        function _undo() {
            if (!undo.undo()) return;
            mask.refresh();
            _maskDirty = true;
            _objDirty = true;
            _draw();
            _report();
        }

        function _redo() {
            if (!undo.redo()) return;
            mask.refresh();
            _maskDirty = true;
            _objDirty = true;
            _draw();
            _report();
        }

        // ── The control row ──────────────────────────────────────────────────

        _modeRadio = MpiRadioGroup.mount(qs('#step-place-mode', el), {
            options: MODES,
            value: _mode,
            name: 'flow-place-mode',
            size: 'sm',
        });
        _modeRadio.on('select', ({ value }) => {
            _mode = value === 'manual' ? 'manual' : 'auto';
            // Manual's box is SQUARE and unrotated: it is the region the crop squares
            // off anyway, and the brief's "1:1 box with no rotation handle" is what
            // stops it reading as a placement. Auto goes back to the object's own
            // aspect, because `drawPlaced` stretches into the rect and a square box
            // would squash a wide object.
            if (_mode === 'manual') { _setAspect(1); shape.rot = 0; }
            else _setAspect(_objectAspect());
            // A tool that cannot act in this mode must not stay armed, or the pointer
            // would silently do nothing.
            if (_mode === 'manual' && _tool !== 'move') _toolRadio?.el?.setValue('move');
            _syncTools();
            _draw();
            _report();
        });

        _toolRadio = MpiRadioGroup.mount(qs('#step-place-tool', el), {
            options: TOOLS,
            value: _tool,
            name: 'flow-place-tool',
            iconOnly: true,
            size: 'sm',
        });
        _toolRadio.on('select', ({ value }) => {
            _tool = value;
            mask.brushType = value === 'restore' ? 'brush' : 'eraser';
            _say();
            _draw();
        });

        /**
         * DISABLED, never inert. `MpiRadioGroup` has no `setDisabled`, but its click
         * handler honours `aria-disabled` on a button — documented in its header — so
         * this is the supported route rather than a workaround.
         */
        function _syncTools() {
            const off = !_canBrush();
            qsa('.mpi-radio-group__btn', _toolRadio.el).forEach((btn) => {
                if (btn.dataset.value === 'move') return;
                btn.setAttribute('aria-disabled', off ? 'true' : 'false');
            });
        }

        _bgToggle = MpiCheckbox.mount(qs('#step-place-bg', el), {
            label: 'Remove background',
            variant: 'switch',
            name: 'flow-place-remove-bg',
            checked: _removeBg,
            disabled: true,
        });
        _bgToggle.on('change', async ({ checked }) => {
            _cutFailed = false;
            _removeBg = !!checked;
            // OFF is free and HAS to be: the original is right here, so going back
            // never costs a second dispatch. Neither does a second ON — and neither
            // touches the mask layers, which is why an erasure survives both.
            if (!checked || _cutImg) {
                _objDirty = true;
                _say();
                _draw();
                _report();
                return;
            }

            _setBusy(true);
            const cut = await _cutOut(_sourceUrl);
            _setBusy(false);
            if (!cut?.url) {
                // Say so and put the switch back. A toggle that silently stays on over
                // unchanged pixels would send the user to Generate believing the
                // background was gone.
                _cutFailed = true;
                _removeBg = false;
                _bgToggle.el.setChecked(false);
                _say();
                return;
            }
            _cutUrl = cut.url;
            _cutImg = await _loadImage(resolveMediaUrl(cut.url));
            _objDirty = true;
            _say();
            _draw();
            _report();
        });

        function _setBusy(v) {
            _busy = v;
            _bgToggle.el.setDisabled(v || !_objImg);
            _say();
        }

        const actionSlot = qs('#step-place-actions', el);

        const undoInst = MpiButton.mount(document.createElement('div'), {
            text: 'Undo', variant: 'secondary', size: 'sm',
            info: 'Undo the last erase or restore (Ctrl+Z)',
        });
        _undoBtn = undoInst.el;
        _undoBtn.disabled = true;
        actionSlot.appendChild(_undoBtn);
        _unsubs.push(on(_undoBtn, 'click', _undo));

        const resetInst = MpiButton.mount(document.createElement('div'), {
            text: 'Reset', variant: 'ghost', size: 'sm',
            info: 'Undo every erase and restore, keeping the background setting',
        });
        actionSlot.appendChild(resetInst.el);
        _unsubs.push(on(resetInst.el, 'click', _reset));

        const sizeInst = MpiButton.mount(document.createElement('div'), {
            icon: 'resize_stroke', size: 'sm', variant: 'secondary',
            info: 'Restore the object to its original proportions',
        });
        // A RESIZER, not a re-centre — the same call the History Place tool's button
        // makes, and for the same reason: a placement is a picture, so moving it as a
        // side effect would undo the position the user was happy with.
        _unsubs.push(on(sizeInst.el, 'click', () => {
            if (_mode !== 'auto' || !_objImg) return;
            shape.halfW = _object.w / 2;
            shape.halfH = _object.h / 2;
            _draw();
            _report();
        }));
        actionSlot.appendChild(sizeInst.el);

        // The canvas family's OWN registry ids, so Ctrl+Z means one thing app-wide.
        _unsubs.push(Hotkeys.bind('mask.undo.canvas', _undo));
        _unsubs.push(Hotkeys.bind('mask.redo.canvas', _redo));
        // B / E, the same ids `MpiMaskStrip` and `MpiStepPaint` bind. Routed THROUGH
        // the radio so the control and the manager cannot disagree about what is armed.
        _unsubs.push(Hotkeys.bind('mask.brush.toolbar', () => {
            if (_canBrush()) _toolRadio?.el?.setValue('restore');
        }));
        _unsubs.push(Hotkeys.bind('mask.eraser.toolbar', () => {
            if (_canBrush()) _toolRadio?.el?.setValue('erase');
        }));

        // ── Remove Background ────────────────────────────────────────────────

        /**
         * Run Remove Background on the OBJECT and commit nothing.
         *
         * The same shape `MpiGroupHistoryBlock._cutOutSlotImage` uses for the History
         * Place tool, and for the same two reasons: an arbitrary URL goes in rather
         * than the current entry, and `deferCommit` withholds the project RECORD so
         * no gallery card or history entry appears for a cut-out that is only an
         * intermediate. The orphan file is the existing `.preview-assets` + Cleanup GC
         * path's job.
         *
         * Transparent, not a flat colour: the ALPHA is what this reads.
         *
         * @param {string|null} url
         * @returns {Promise<{url: string}|null>} null on any failure
         */
        function _cutOut(url) {
            if (!url) return Promise.resolve(null);
            return new Promise((resolve) => {
                const started = enqueueGeneration(
                    {
                        operation: 'removeBackground',
                        model: { id: null, mediaType: 'image' },
                        positive: '', negative: '',
                        mediaItems: [{ url: resolveMediaUrl(url), mediaType: 'image', source: 'flow' }],
                        injectionParams: { Input_Bg_Use_Color: false },
                    },
                    {
                        onCancel: () => resolve(null),
                        onError: () => resolve(null),
                        onComplete: ({ item }) => resolve(item?.filePath ? { url: item.filePath } : null),
                    },
                    { deferCommit: true },
                );
                // A rejected enqueue fires onCancel, but an early return before either
                // would leave the switch stuck mid-flight.
                if (!started) resolve(null);
            });
        }

        // ── Pointer ──────────────────────────────────────────────────────────

        _unsubs.push(on(canvasEl, 'mousedown', (ev) => {
            if (!_sceneLoaded || ev.button !== 0) return;
            ev.preventDefault();
            // Space wins over every tool, exactly as InputController orders it.
            if (_spaceHeld) { _panFrom = _toCanvas(ev); return; }
            const p = _toScene(ev);
            if (_tool !== 'move' && _canBrush()) { _beginStroke(p); return; }
            const handle = shape.hitTest(p.x, p.y, view.scale);
            if (!handle) return;
            // Manual has NO rotation handle, because the box is a region and swinging
            // it would say the model reads it at an angle. Alt is simply ignored there.
            const rotating = _mode === 'auto' && ev.altKey;
            shape.startDrag(handle, p.x, p.y, rotating);
            _dragging = true;
            _draw();
        }));

        _unsubs.push(on(window, 'mousemove', (ev) => {
            if (!_sceneLoaded) return;
            if (_panFrom) {
                const c = _toCanvas(ev);
                view.offsetX += c.x - _panFrom.x;
                view.offsetY += c.y - _panFrom.y;
                _panFrom = c;
                _draw();
                return;
            }
            const p = _toScene(ev);
            if (_painting) {
                _paintAt(p);
                _objDirty = true;
                _cursor = p;
                _draw();
                return;
            }
            if (_dragging) {
                // Manual's box stays SQUARE, so its resize runs permanently ratio-locked
                // — `ShapeManager` locks whatever ratio the shape HAS, and Manual's is 1:1.
                shape.drag(p.x, p.y, ev.shiftKey || _mode === 'manual');
                _draw();
                return;
            }
            const r = canvasEl.getBoundingClientRect();
            const inside = ev.clientX >= r.left && ev.clientX <= r.right
                && ev.clientY >= r.top && ev.clientY <= r.bottom;
            const next = inside ? p : null;
            if (!next && !_cursor) return;
            _cursor = next;
            canvasEl.style.cursor = _cursorFor(next);
            _draw();
        }));

        /** The gizmo's own cursor map while Move is armed; the ring IS the cursor otherwise. */
        function _cursorFor(p) {
            if (_spaceHeld) return 'move';
            if (_tool !== 'move' && _canBrush()) return 'none';
            if (!p) return '';
            return ShapeManager.getCursor(shape.hitTest(p.x, p.y, view.scale));
        }

        _unsubs.push(on(window, 'mouseup', () => {
            _panFrom = null;
            if (_dragging) {
                _dragging = false;
                shape.endDrag();
                // A placement is not a pixel edit — `ShapeManager` owns no layer, so
                // there is nothing for the stack to restore and the History Place tool
                // records nothing either.
                _report();
            }
            _endStroke();
        }));

        _unsubs.push(on(canvasEl, 'wheel', (ev) => {
            if (!_sceneLoaded) return;
            ev.preventDefault();
            if (_spaceHeld || !_canBrush() || _tool === 'move') {
                view.isManagedView = false;
                const factor = Math.exp(-ev.deltaY * ZOOM_SPEED);
                const old = view.scale;
                view.scale = Math.max(view.minScale, Math.min(view.maxScale, old * factor));
                const c = _toCanvas(ev);
                view.offsetX = c.x - ((c.x - view.offsetX) / old) * view.scale;
                view.offsetY = c.y - ((c.y - view.offsetY) / old) * view.scale;
                _draw();
                return;
            }
            _brush = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, _brush + (ev.deltaY > 0 ? -BRUSH_STEP : BRUSH_STEP)));
            _draw();
            _report();
        }, { passive: false }));

        // ── Space = pan/zoom ─────────────────────────────────────────────────

        _unsubs.push(Hotkeys.bind('canvas.pan.start', () => {
            if (_spaceHeld) return;
            _spaceHeld = true;
            // Close any open gesture first, or the capture stays open and the NEXT
            // commit swallows both.
            _endStroke();
            if (_dragging) { _dragging = false; shape.endDrag(); }
            canvasEl.style.cursor = 'move';
            _draw();
        }));
        _unsubs.push(Hotkeys.bind('canvas.pan.end', () => {
            _spaceHeld = false;
            _panFrom = null;
            canvasEl.style.cursor = _cursorFor(_cursor);
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

        _unsubs.push(on(sceneImg, 'load', () => {
            _scene = { w: sceneImg.naturalWidth || 1, h: sceneImg.naturalHeight || 1 };
            _sceneLoaded = true;
            shape.init(_scene.w, _scene.h);
            if (seeded.place?.halfW > 0) {
                Object.assign(shape, {
                    cx: seeded.place.cx, cy: seeded.place.cy,
                    halfW: seeded.place.halfW, halfH: seeded.place.halfH,
                    rot: seeded.place.rot || 0, hasShape: true,
                });
            } else {
                shape.seed(_mode === 'manual' ? 1 : _objectAspect());
            }
            _syncCanvasSize();
            _refit();
            _draw();
            _report();
        }));

        /**
         * Arm the object: its RGB, its natural size, the mask layers at that size, and
         * the cut-out when a previous run already produced one.
         *
         * `mask.init()` clears the layers and the stack WITHOUT recording — a load is
         * not an edit anyone could have undone (`docs/masking-undo.md`).
         */
        async function _initObject() {
            _objImg = await _loadImage(resolveMediaUrl(_sourceUrl));
            if (!_objImg) { _say(); _draw(); return; }
            _object = { w: _objImg.naturalWidth || 1, h: _objImg.naturalHeight || 1 };
            mask.init(_object.w, _object.h);
            undo.clear();
            if (seeded.userMask?.manual) await mask.setManualFromDataURL(seeded.userMask.manual);
            if (seeded.userMask?.subtract) await mask.setSubtractFromDataURL(seeded.userMask.subtract);
            if (_removeBg && _cutUrl) {
                _cutImg = await _loadImage(resolveMediaUrl(_cutUrl));
                // A cut-out URL that no longer resolves must not leave the toggle ON over
                // pixels that were never cut — the silent state the switch exists to avoid.
                if (!_cutImg) { _removeBg = false; _cutUrl = null; _bgToggle.el.setChecked(false); }
            }
            // The gizmo was seeded before the object's aspect was known when the scene
            // won the race; re-derive it now rather than leave a square box stretching
            // a wide object.
            if (!seeded.place?.halfW && _mode === 'auto' && shape.hasShape) _setAspect(_objectAspect());
            _bgToggle.el.setDisabled(false);
            _objDirty = true;
            _maskDirty = true;
            _syncTools();
            _say();
            _draw();
            _report();
        }

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        _syncTools();
        _say();
        // Source last: with the handler wired, a cached image still fires load.
        const sceneUrl = props.media?.url ? resolveMediaUrl(props.media.url) : '';
        if (sceneUrl) sceneImg.src = sceneUrl;
        if (_sourceUrl) _initObject();

        el.getValue = _value;

        el.destroy = () => {
            _ro.disconnect();
            undo.destroy();
            mask.destroy();
            _modeRadio?.destroy?.();
            _toolRadio?.destroy?.();
            _bgToggle?.destroy?.();
            undoInst?.destroy?.();
            resetInst?.destroy?.();
            sizeInst?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
