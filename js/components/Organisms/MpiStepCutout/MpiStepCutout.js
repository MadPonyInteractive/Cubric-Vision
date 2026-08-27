import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiCheckbox } from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MaskManager } from '../../Primitives/MpiCanvas/managers/MaskManager.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import { UndoStack } from '../../Primitives/MpiCanvas/managers/UndoStack.js';
import { drawBrushRing } from '../../Primitives/MpiCanvas/managers/brushDab.js';
import { enqueueGeneration } from '../../../services/generationService.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiStepCutout — the `cutout` step kind (MPI-596).
 *
 * The OBJECT alone, on a stage of its own: Remove Background, then an
 * erase/restore brush to fix whatever the cut missed or ate. It reports the two
 * mask layers and hands the run ONE composited RGBA.
 *
 * Contract (every step kind implements it):
 *   props  { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * ── WHY THIS IS ITS OWN STAGE (Fabio, 2026-08-27) ───────────────────────────
 *
 * Cleaning the object is work on the OBJECT; placing it is work on the SCENE.
 * They were built as one step and that was wrong in three measurable ways: the
 * brush could only be armed in `place`'s Auto mode (Manual deliberately draws no
 * object, so there was nothing to brush), the object was cleaned at a few hundred
 * px of a stage shared with the scene, and a user whose PNG arrived already cut
 * out still had to walk through placement controls to get past it. Split, the
 * brush serves both placement modes, the object gets the whole canvas, and this
 * step is SKIPPABLE.
 *
 * ### 🔴 SKIPPABLE BY CONSTRUCTION — there is no flag
 *
 * `composeCutObject` returns **null** when Remove Background never ran and no
 * stroke was made, and the frame treats a null as "this kind changed nothing"
 * (`MpiBaseFlow._deriveRunMedia`). So the media reaches the run exactly as the
 * user supplied it. The emptiness test is EXACT rather than a heuristic:
 * `MaskManager._layerToURL` already returns null for a layer with no painted
 * pixels, so a mounted-but-untouched step reports `userMask: {manual: null,
 * subtract: null}` and cannot be mistaken for an edited one.
 *
 * ### 🔴 TWO MASK LAYERS, COMPOSITED ONLY AT DISPATCH
 *
 * `bgMask` is the Remove Background cut-out's alpha; `userMask` is MaskManager's
 * manual/subtract pair. They are NEVER flattened into each other. Flatten them
 * and toggling Remove Background off destroys every erasure the user made — the
 * toggle would silently eat their work, which is the whole reason the split
 * exists.
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
 * ### TWO tools, not three
 *
 * There is no gizmo here, so nothing competes with the brush for the pointer and
 * the tool pair is a plain Erase/Restore — the same shape `MpiStepPaint` has.
 * That is what the split deletes: the three-tool router and the `aria-disabled`
 * dance that kept Erase/Restore inert in `place`'s Manual mode.
 *
 * ### The control row is the GIZMO's, not declared `fields`
 *
 * Same exception `MpiStepCrop`'s ratio bar and `MpiStepPaint`'s brush row take:
 * these controls are INTRINSIC — every cutout step needs a tool, a way to cut the
 * background off and a way to undo — so making a manifest declare them would be
 * boilerplate an author could silently omit, leaving a step whose object cannot
 * be cut.
 */

/** Brush size in OBJECT px — `MaskManager`'s own default, so the surfaces match. */
const DEFAULT_BRUSH = 40;
const MIN_BRUSH = 2;
const MAX_BRUSH = 400;
/** Wheel step, matching `InputController`'s brush wheel. */
const BRUSH_STEP = 5;
/** Zoom per wheel unit — `InputController`'s own constant, so both zoom alike. */
const ZOOM_SPEED = 0.001;

/** Screen px kept clear around the fitted object, so an edge stroke is reachable. */
const FIT_SLACK = 16;

const TOOLS = [
    { label: 'Erase', value: 'erase', icon: 'eraser', info: 'Rub out part of the object' },
    { label: 'Restore', value: 'restore', icon: 'brush', info: 'Paint erased pixels back' },
];

const NO_OBJECT = 'Add the object image on the first step.';
const CUTTING = 'Removing the background…';
const CUT_FAILED = 'Background removal failed — the object is unchanged.';

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
 * meet. It runs at dispatch and at draw time from the SAME function so the canvas
 * cannot show something the run will not receive, and it runs in `MpiStepPlace`
 * too, which composes its preview from THIS step's reported value.
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

/** True when this step changed nothing — no cut ran and no stroke was made. */
function _untouched(value) {
    return !(value?.removeBg && value?.bgUrl)
        && !value?.userMask?.manual
        && !value?.userMask?.subtract;
}

/**
 * The file the RUN receives for this step's role: the object wearing its
 * composited alpha, at its own natural size.
 *
 * Returns **null** when the step was skipped, which is the whole of its
 * skippability — see § SKIPPABLE BY CONSTRUCTION above. A supplied PNG that was
 * already cut out therefore reaches the graph byte-identical rather than being
 * re-encoded through a canvas for nothing.
 *
 * Rebuilt from URLs plus two small mask PNGs rather than from a stored composite:
 * `stepValues` is the persisted Reuse snapshot, and an object photo re-encoded
 * into it on every stroke would put megabytes in the project file.
 *
 * @param {Object|null} value the step's reported value
 * @param {{url?: string}|null} media the object as the frame holds it
 * @returns {Promise<File|null>} null when nothing was changed, or nothing loaded
 */
export async function composeCutObject(value, media) {
    if (_untouched(value)) return null;

    const srcUrl = media?.url || value?.sourceUrl;
    const rgb = await _loadImage(resolveMediaUrl(srcUrl || ''));
    if (!rgb) return null;
    const w = rgb.naturalWidth || 1;
    const h = rgb.naturalHeight || 1;

    const bg = (value.removeBg && value.bgUrl)
        ? await _loadImage(resolveMediaUrl(value.bgUrl))
        : null;
    const manual = await _loadImage(value.userMask?.manual || '');
    const subtract = await _loadImage(value.userMask?.subtract || '');

    const canvas = composeObjectAlpha(rgb, bg, manual, subtract, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'object.png', { type: 'image/png' }) : null;
}

export const MpiStepCutout = ComponentFactory.create({
    name: 'MpiStepCutout',
    css: ['js/components/Organisms/MpiStepCutout/MpiStepCutout.css'],

    template: () => `
        <div class="mpi-step-cutout">
            <div class="mpi-step-cutout__stage" id="step-cutout-stage">
                <canvas class="mpi-step-cutout__canvas" id="step-cutout-canvas"></canvas>
            </div>
            <div class="mpi-step-cutout__bar">
                <div class="mpi-step-cutout__tool" id="step-cutout-tool"></div>
                <div class="mpi-step-cutout__bg" id="step-cutout-bg"></div>
                <div class="mpi-step-cutout__actions" id="step-cutout-actions"></div>
            </div>
            <p class="mpi-step-cutout__note" id="step-cutout-note"></p>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const stageEl = qs('#step-cutout-stage', el);
        const canvasEl = /** @type {HTMLCanvasElement} */ (qs('#step-cutout-canvas', el));
        const noteEl = qs('#step-cutout-note', el);
        const ctx = canvasEl.getContext('2d');

        const mask = new MaskManager();
        const view = new ViewManager();
        const undo = new UndoStack();
        mask.undo = undo;

        const seeded = props.value || {};
        /** @type {'erase'|'restore'} */
        let _tool = 'erase';
        let _removeBg = !!seeded.removeBg;
        /** Brush size in OBJECT px — the canvas IS the object here, so no conversion. */
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

        const _sourceUrl = props.media?.url || null;
        let _loaded = false;
        let _object = { w: 1, h: 1 };

        let _painting = false;
        /** Pointer in OBJECT px, for the brush ring. Null when off the canvas. */
        let _cursor = null;
        let _spaceHeld = false;
        let _panFrom = null;

        let _toolRadio = null;
        let _bgToggle = null;
        let _undoBtn = null;

        // ── Geometry ─────────────────────────────────────────────────────────

        function _refit() {
            const cw = canvasEl.width;
            const ch = canvasEl.height;
            if (cw <= FIT_SLACK * 2 || ch <= FIT_SLACK * 2 || !_loaded) return;
            if (!view.isManagedView) return;
            view.refit(cw - FIT_SLACK * 2, ch - FIT_SLACK * 2, _object.w, _object.h);
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

        /** Canvas px → OBJECT image px. One space, because the stage IS the object. */
        function _toObject(ev) {
            const c = _toCanvas(ev);
            return {
                x: (c.x - view.offsetX) / view.scale,
                y: (c.y - view.offsetY) / view.scale,
            };
        }

        // ── The object composite ─────────────────────────────────────────────

        /** True while the mask layers have changed since the object canvas was built. */
        let _objDirty = true;
        let _objCanvas = null;

        function _syncObject() {
            if (!_objDirty) return;
            _objDirty = false;
            _objCanvas = _objImg
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

        function _draw() {
            if (!ctx) return;
            const { width: cw, height: ch } = canvasEl;
            // CLEARED, not filled: the stage's checker shows through wherever the
            // object's alpha is 0, which is what tells a white object apart from a
            // removed background. Filling here would make the two identical.
            ctx.clearRect(0, 0, cw, ch);
            if (!_loaded) return;

            _syncObject();
            if (_objCanvas) {
                ctx.drawImage(
                    _objCanvas, view.offsetX, view.offsetY,
                    _object.w * view.scale, _object.h * view.scale,
                );
            }

            if (!_cursor || _spaceHeld || !_objImg) return;
            // The shared ring, so the eraser is the same frost-blue it is on the
            // History canvas.
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
         * layers; a wheel tick or a pan moves no mask pixel, so re-encoding on every
         * report would charge that to gestures that changed nothing. Each returns
         * NULL for an unpainted layer, which is what makes `_untouched` exact.
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
                removeBg: _removeBg,
                sourceUrl: _sourceUrl,
                bgUrl: _cutUrl,
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
                : '';
        }

        // ── Mutations — every one of these records into the stack ─────────────

        function _beginStroke(p) {
            _painting = true;
            mask.brushSize = _brush;
            undo.begin(mask.undoLayers());
            mask.paint(p.x, p.y);
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

        _toolRadio = MpiRadioGroup.mount(qs('#step-cutout-tool', el), {
            options: TOOLS,
            value: _tool,
            name: 'flow-cutout-tool',
            iconOnly: true,
            size: 'sm',
        });
        _toolRadio.on('select', ({ value }) => {
            _tool = value === 'restore' ? 'restore' : 'erase';
            mask.brushType = _tool === 'restore' ? 'brush' : 'eraser';
            _draw();
        });

        _bgToggle = MpiCheckbox.mount(qs('#step-cutout-bg', el), {
            label: 'Remove background',
            variant: 'switch',
            name: 'flow-cutout-remove-bg',
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

        const actionSlot = qs('#step-cutout-actions', el);

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

        // The canvas family's OWN registry ids, so Ctrl+Z means one thing app-wide.
        _unsubs.push(Hotkeys.bind('mask.undo.canvas', _undo));
        _unsubs.push(Hotkeys.bind('mask.redo.canvas', _redo));
        // B / E, the same ids `MpiMaskStrip` and `MpiStepPaint` bind. Routed THROUGH
        // the radio so the control and the manager cannot disagree about what is armed.
        _unsubs.push(Hotkeys.bind('mask.brush.toolbar', () => _toolRadio?.el?.setValue('restore')));
        _unsubs.push(Hotkeys.bind('mask.eraser.toolbar', () => _toolRadio?.el?.setValue('erase')));

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
            if (!_loaded || ev.button !== 0) return;
            ev.preventDefault();
            // Space wins over the brush, exactly as InputController orders it.
            if (_spaceHeld) { _panFrom = _toCanvas(ev); return; }
            if (_objImg) _beginStroke(_toObject(ev));
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
            const p = _toObject(ev);
            if (_painting) {
                mask.paint(p.x, p.y);
                _objDirty = true;
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
            // `none` under the brush: the ring drawn on the canvas IS the cursor, and a
            // second arrow beside it reads as two pointers.
            canvasEl.style.cursor = _spaceHeld ? 'move' : (next && _objImg ? 'none' : '');
            _draw();
        }));

        _unsubs.push(on(window, 'mouseup', () => {
            _panFrom = null;
            _endStroke();
        }));

        _unsubs.push(on(canvasEl, 'wheel', (ev) => {
            if (!_loaded) return;
            ev.preventDefault();
            if (_spaceHeld || !_objImg) {
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
            canvasEl.style.cursor = 'move';
            _draw();
        }));
        _unsubs.push(Hotkeys.bind('canvas.pan.end', () => {
            _spaceHeld = false;
            _panFrom = null;
            canvasEl.style.cursor = _cursor && _objImg ? 'none' : '';
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
            _loaded = true;
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
            _bgToggle.el.setDisabled(false);
            _objDirty = true;
            _syncCanvasSize();
            _refit();
            _say();
            _draw();
            // NOT reported on mount: an untouched step must stay untouched, and writing
            // a value here would put `sourceUrl` in the snapshot for a step the user
            // never used. `_untouched` would still return true, but the frame would
            // carry a value for a skipped step for no reason.
        }

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        _say();
        if (_sourceUrl) _initObject();

        el.getValue = _value;

        el.destroy = () => {
            _ro.disconnect();
            undo.destroy();
            mask.destroy();
            _toolRadio?.destroy?.();
            _bgToggle?.destroy?.();
            undoInst?.destroy?.();
            resetInst?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
