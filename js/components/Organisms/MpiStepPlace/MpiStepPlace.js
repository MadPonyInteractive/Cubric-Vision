import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { ShapeManager } from '../../Primitives/MpiCanvas/managers/ShapeManager.js';
import { CompositeManager } from '../../Primitives/MpiCanvas/managers/CompositeManager.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import { composeObjectAlpha } from '../MpiStepCutout/MpiStepCutout.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiStepPlace — the `place` step kind (MPI-596).
 *
 * The SCENE, with a box on it: the user says WHERE the object goes. It is the
 * first step kind that reads TWO media roles — the scene it draws on
 * (`step.role`) and the object it places (`step.sourceRole`).
 *
 * Contract (every step kind implements it):
 *   props  { media, source, sourceValue, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * ── THE CLEANUP IS NOT HERE (plan.md § Plan Drift 2026-08-27) ───────────────
 *
 * Remove Background, the erase/restore brush and the `UndoStack` used to live in
 * this component and now live in `MpiStepCutout`, one stage earlier. Cleaning the
 * object is work on the OBJECT; placing it is work on the SCENE. What that split
 * buys, and why it is not a flag:
 *   · the brush serves BOTH modes now, instead of being armable only in Auto
 *     (Manual deliberately draws no object, so there was nothing to brush here);
 *   · the object is cleaned on a stage of its own rather than at a few hundred px
 *     of the scene's;
 *   · the three-tool pointer router and its `aria-disabled` dance are DELETED —
 *     with no brush, the gizmo owns the pointer unconditionally.
 *
 * ── Two modes, because the MECHANISM differs (brief.md § The shape) ──────────
 *
 * `auto`   — the object's own pixels are used. The canvas shows the object under
 *            the gizmo, at the gizmo's aspect, and the run receives it stamped
 *            into the scene frame.
 * `manual` — only the REGION is used. The canvas shows an empty SQUARE box with
 *            no rotation, because the box is where the model looks rather than a
 *            placement, and a rotation handle would be a lie. The run receives the
 *            clean object at its own full frame — which is simply `sourceRole`'s
 *            media, so this kind derives NO file in Manual and contributes only
 *            the region rect through `STEP_PARAMS`.
 *
 * ── NOTHING HERE IS A SECOND GIZMO OR A SECOND STAMP ────────────────────────
 *
 * Two History engines are mounted whole, the same relationship `MpiStepPaint` has
 * with `PaintManager`:
 *   · `ShapeManager` armed `'place'` — the handles, shape-local hit-testing,
 *     Shift's aspect lock and Alt-rotate all come from MPI-454's gizmo, so the
 *     flow step and the History Place tool can never drift apart.
 *   · `CompositeManager.drawPlaced` / `rasterisePlace` — the rotated-rect stamp.
 *     `placeImage` duck-types on `.width`, so the composited object CANVAS goes
 *     straight in and no transform is forked.
 *
 * ### 🔴 THE SEAM TO STAGE 2 IS `sourceValue`, AND IT HAS TO BE
 *
 * `sourceRole` alone cannot show this step what the cutout stage produced:
 * `_buildStepSlide` resolves media from `_mediaGroups` — the user's own inputs —
 * while the cut object is derived at Run and never enters that map. So the frame
 * hands over the cutout step's reported VALUE, and the preview is composed here
 * from its two mask layers plus the object's original RGB, through the very
 * function the cutout stage draws with. The canvas therefore cannot show an
 * object the run will not receive.
 *
 * The masks are NOT copied into this step's own value. They belong to the cutout
 * step, are persisted once in its snapshot, and are re-derived from there on
 * Reuse — a second copy here would double the base64 in every saved run and
 * invite the two to disagree.
 */

/** Half-extent floor in scene px, matching `ShapeManager`'s own. */
const MIN_HALF = 6;

/** Zoom per wheel unit — `InputController`'s own constant, so both zoom alike. */
const ZOOM_SPEED = 0.001;

/** Screen px kept clear around the fitted image, so a handle at the edge is grabbable. */
const FIT_SLACK = 16;

const MODES = [
    { label: 'Auto', value: 'auto', info: 'Use the object\'s own pixels — the model matches its lighting and scale to the scene' },
    { label: 'Manual', value: 'manual', info: 'Use only the region — describe how the object should sit, and the model re-renders it there' },
];

const NO_OBJECT = 'Add the object image on the first step.';

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
 * The file the GRAPH runs on — the object STAMPED into the scene frame,
 * transparent everywhere else. The graph reads its alpha for the crop region,
 * exactly as Draw It In reads the paint layer's, so the placement needs no
 * separate rect.
 *
 * ONLY IN AUTO. Manual uses the region and not the pixels, and the clean object it
 * wants is already `sourceRole`'s media — the cutout stage put it there — so
 * deriving anything here would hand the run a second copy of a picture it has.
 *
 * `source` is the object AS THE RUN WILL SEE IT, which is the cutout stage's
 * output when that stage did anything and the user's own upload when it did not.
 * `_deriveRunMedia` walks the steps IN FLOW ORDER, so the cutout step (stage 2)
 * has already swapped its file in by the time this runs (stage 3). A flow that
 * declares them the other way round would stamp the uncut object — the ordering
 * is the contract.
 *
 * @param {Object|null} value the step's reported value
 * @param {{url?: string}|null} source the object's media, resolved from `sourceRole`
 * @returns {Promise<File|null>} null in Manual, and when there is no object to send
 */
export async function composePlacedObject(value, source) {
    if (value?.mode === 'manual') return null;

    const srcUrl = source?.url || value?.sourceUrl;
    if (!srcUrl) return null;
    const object = await _loadImage(resolveMediaUrl(srcUrl));
    if (!object) return null;

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
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'placed.png', { type: 'image/png' }) : null;
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

        const shape = new ShapeManager();
        const comp = new CompositeManager();
        const view = new ViewManager();
        shape.setMode('place');

        const seeded = props.value || {};
        /** @type {'auto'|'manual'} */
        let _mode = seeded.mode === 'manual' ? 'manual' : 'auto';

        const _sourceUrl = props.source?.url || null;
        /** The cutout stage's reported value — the two mask layers and its cut-out url. */
        const _cut = props.sourceValue || null;

        let _objImg = null;
        let _sceneLoaded = false;
        let _scene = { w: 1, h: 1 };
        let _object = { w: 1, h: 1 };

        let _dragging = false;
        let _spaceHeld = false;
        let _panFrom = null;
        /** Pointer in SCENE px, for the gizmo's cursor map. Null when off the canvas. */
        let _cursor = null;

        const sceneImg = new Image();

        let _modeRadio = null;

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

        // ── Draw ─────────────────────────────────────────────────────────────

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
            if (_mode === 'auto' && comp.placeImage) {
                ctx.save();
                ctx.translate(view.offsetX, view.offsetY);
                comp.drawPlaced(ctx, shape, view.scale);
                ctx.restore();
            }

            shape.drawScreen(ctx, view);
        }

        // ── Report ───────────────────────────────────────────────────────────

        function _value() {
            return {
                mode: _mode,
                sourceUrl: _sourceUrl,
                place: {
                    cx: shape.cx, cy: shape.cy,
                    halfW: shape.halfW, halfH: shape.halfH,
                    rot: shape.rot,
                },
                size: { ..._scene },
                objectSize: { ..._object },
            };
        }

        function _report() {
            props.onChange?.(_value());
        }

        function _say() {
            noteEl.textContent = _objImg ? '' : NO_OBJECT;
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
            _draw();
            _report();
        });

        const actionSlot = qs('#step-place-actions', el);

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

        // ── Pointer ──────────────────────────────────────────────────────────

        _unsubs.push(on(canvasEl, 'mousedown', (ev) => {
            if (!_sceneLoaded || ev.button !== 0) return;
            ev.preventDefault();
            // Space wins over the gizmo, exactly as InputController orders it.
            if (_spaceHeld) { _panFrom = _toCanvas(ev); return; }
            const p = _toScene(ev);
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

        /** The gizmo's own cursor map. */
        function _cursorFor(p) {
            if (_spaceHeld) return 'move';
            if (!p) return '';
            return ShapeManager.getCursor(shape.hitTest(p.x, p.y, view.scale));
        }

        _unsubs.push(on(window, 'mouseup', () => {
            _panFrom = null;
            if (!_dragging) return;
            _dragging = false;
            shape.endDrag();
            // A placement is not a pixel edit — `ShapeManager` owns no layer, so there
            // is nothing for an undo stack to restore and the History Place tool
            // records nothing either. The stack lives in the cutout stage, with the
            // mask layers that actually mutate (docs/masking-undo.md § The contract).
            _report();
        }));

        _unsubs.push(on(canvasEl, 'wheel', (ev) => {
            if (!_sceneLoaded) return;
            ev.preventDefault();
            view.isManagedView = false;
            const factor = Math.exp(-ev.deltaY * ZOOM_SPEED);
            const old = view.scale;
            view.scale = Math.max(view.minScale, Math.min(view.maxScale, old * factor));
            const c = _toCanvas(ev);
            view.offsetX = c.x - ((c.x - view.offsetX) / old) * view.scale;
            view.offsetY = c.y - ((c.y - view.offsetY) / old) * view.scale;
            _draw();
        }, { passive: false }));

        // ── Space = pan/zoom ─────────────────────────────────────────────────

        _unsubs.push(Hotkeys.bind('canvas.pan.start', () => {
            if (_spaceHeld) return;
            _spaceHeld = true;
            // Close any open gesture first, or the drag continues under the pan.
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
         * Arm the object: its RGB, its natural size, and the alpha the CUTOUT stage
         * gave it.
         *
         * Composed through `composeObjectAlpha` — the cutout stage's own function —
         * rather than by loading a derived file, because the cut object is derived at
         * Run and never enters `_mediaGroups`. Running the same law here is what makes
         * the preview and the dispatch agree. With no cutout value the arguments are
         * all null, which yields the object's own opaque rectangle: the correct
         * picture for a step the user skipped.
         */
        async function _initObject() {
            _objImg = await _loadImage(resolveMediaUrl(_sourceUrl));
            if (!_objImg) { _say(); _draw(); return; }
            _object = { w: _objImg.naturalWidth || 1, h: _objImg.naturalHeight || 1 };

            const bg = (_cut?.removeBg && _cut?.bgUrl)
                ? await _loadImage(resolveMediaUrl(_cut.bgUrl))
                : null;
            const manual = await _loadImage(_cut?.userMask?.manual || '');
            const subtract = await _loadImage(_cut?.userMask?.subtract || '');
            comp.placeImage = composeObjectAlpha(
                _objImg, bg, manual, subtract, _object.w, _object.h,
            );

            // The gizmo was seeded before the object's aspect was known when the scene
            // won the race; re-derive it now rather than leave a square box stretching
            // a wide object.
            if (!seeded.place?.halfW && _mode === 'auto' && shape.hasShape) _setAspect(_objectAspect());
            _say();
            _draw();
            _report();
        }

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        _say();
        // Source last: with the handler wired, a cached image still fires load.
        const sceneUrl = props.media?.url ? resolveMediaUrl(props.media.url) : '';
        if (sceneUrl) sceneImg.src = sceneUrl;
        if (_sourceUrl) _initObject();

        el.getValue = _value;

        el.destroy = () => {
            _ro.disconnect();
            _modeRadio?.destroy?.();
            sizeInst?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
