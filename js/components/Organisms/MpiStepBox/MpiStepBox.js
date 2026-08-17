import { ComponentFactory } from '../../factory.js';
import { createCropTool } from '../../../utils/cropTool.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiStepBox — the `box` step kind (MPI-306 Phase 1).
 *
 * A STEP KIND, not an app component. It knows three things: the media it was
 * handed, the value it holds, and how to report a change. It never learns which
 * app hosts it, never touches the workflow, never talks to an injector — that
 * is the whole contract that lets `steps` stay data (carousel-frame.md § Steps
 * are DATA).
 *
 * Contract (every step kind implements it):
 *   props  { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * Value shape: `{ box: { x, y, w, h } }` in ABSOLUTE SOURCE PIXELS, top-left
 * anchored — the unit `Mpi Box` consumes with no conversion (box-gizmo.md
 * § Coord contract). cropTool works in NORMALIZED [0..1]; the multiply by
 * natural dimensions happens here, at the boundary, so the graph never sees a
 * normalized number and this component never leaks one.
 *
 * REUSES js/utils/cropTool.js (8 handles, body drag, ratio lock) with
 * `showGrid: false` — a rule-of-thirds grid is a composition aid, and this box
 * marks a subject rather than framing a shot.
 *
 * CLAMPING is load-bearing, not defensive: `Mpi Box Crop` returns the
 * INTERSECTION with the image and does not pad, so a box overhanging an edge
 * silently yields a non-square crop — for a head swap, a distorted head the
 * user blames on the model. cropTool already clamps in normalized space; the
 * pixel conversion below re-clamps the EDGES before deriving w/h so rounding
 * can never push the box off the source.
 *
 * `step.overflow === 'allow'` LIFTS that clamp (MPI-325), because a square
 * forced to stay inside the frame cannot sit tight on an edge-adjacent head —
 * it has to grow until it swallows the neighbour. Opting in is DECLARED by the
 * step, never inferred from the flow, so this stays data a manifest can carry.
 *
 * A flow may only opt in where its consumer survives the overhang:
 *   - `Mpi Box Mask` — safe. The mask is full-frame and clips at the edge, and
 *     `InpaintCropImproved` re-squares the region itself before sampling.
 *   - `Mpi Box Crop` — needs the node's own `pad` input on, or the reference
 *     comes back non-square.
 * Padding the SOURCE is never the answer for a masked slot: it would grow the
 * delivered image.
 */

/** Minimum box edge in source pixels — below this a crop is meaningless. */
const MIN_BOX_PX = 32;

/**
 * Natural (intrinsic) dimensions of a loaded media element.
 * @param {HTMLImageElement} imgEl
 * @returns {{w:number,h:number}}
 */
function _naturalSize(imgEl) {
    return {
        w: imgEl.naturalWidth || imgEl.width || 1,
        h: imgEl.naturalHeight || imgEl.height || 1,
    };
}

/**
 * Normalized [0..1] rect → absolute source pixels, clamped to the image.
 *
 * Clamps the EDGES (x1/y1/x2/y2) before deriving w/h — clamping w/h first would
 * let an off-edge box keep its size and slide, which is exactly the silent
 * non-square crop this guards against.
 *
 * `allowOverflow` skips BOTH clamps so the box keeps its full requested size and
 * reports a NEGATIVE origin when it hangs off the top/left. The graph is the
 * consumer of that: `clamp_box` intersects, and `Mpi Box Crop`'s `pad` puts back
 * what the intersection dropped.
 *
 * @param {{x:number,y:number,w:number,h:number}} norm
 * @param {{w:number,h:number}} natural
 * @param {boolean} [allowOverflow=false]
 * @returns {{x:number,y:number,w:number,h:number}} integer source pixels
 */
function _normToSourcePx(norm, natural, allowOverflow = false) {
    let x1 = norm.x * natural.w;
    let y1 = norm.y * natural.h;
    let x2 = (norm.x + norm.w) * natural.w;
    let y2 = (norm.y + norm.h) * natural.h;

    if (!allowOverflow) {
        x1 = Math.max(0, Math.min(x1, natural.w));
        y1 = Math.max(0, Math.min(y1, natural.h));
        x2 = Math.max(0, Math.min(x2, natural.w));
        y2 = Math.max(0, Math.min(y2, natural.h));
    }

    const x = Math.round(Math.min(x1, x2));
    const y = Math.round(Math.min(y1, y2));
    const w = Math.max(MIN_BOX_PX, Math.round(Math.abs(x2 - x1)));
    const h = Math.max(MIN_BOX_PX, Math.round(Math.abs(y2 - y1)));

    if (allowOverflow) return { x, y, w, h };

    // MIN_BOX_PX may have grown the box past an edge — pull the origin back.
    return {
        x: Math.max(0, Math.min(x, natural.w - w)),
        y: Math.max(0, Math.min(y, natural.h - h)),
        w: Math.min(w, natural.w),
        h: Math.min(h, natural.h),
    };
}

/**
 * Absolute source pixels → normalized [0..1], for seeding cropTool from a
 * restored value. The inverse of _normToSourcePx.
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {{w:number,h:number}} natural
 * @returns {{x:number,y:number,w:number,h:number}}
 */
function _sourcePxToNorm(box, natural) {
    return {
        x: box.x / natural.w,
        y: box.y / natural.h,
        w: box.w / natural.w,
        h: box.h / natural.h,
    };
}

export const MpiStepBox = ComponentFactory.create({
    name: 'MpiStepBox',
    css: ['js/components/Organisms/MpiStepBox/MpiStepBox.css'],

    template: () => `
        <div class="mpi-step-box">
            <div class="mpi-step-box__stage" id="step-box-stage">
                <img class="mpi-step-box__media" id="step-box-media" alt="" draggable="false" />
                <canvas class="mpi-step-box__overlay" id="step-box-overlay"></canvas>
            </div>
            <span class="mpi-step-box__dims" id="step-box-dims"></span>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const step = props.step || {};
        const stageEl = qs('#step-box-stage', el);
        const mediaEl = /** @type {HTMLImageElement} */ (qs('#step-box-media', el));
        const overlayEl = /** @type {HTMLCanvasElement} */ (qs('#step-box-overlay', el));
        const dimsEl = qs('#step-box-dims', el);

        /** Declared per step — see the file header for which consumers may opt in. */
        const _allowOverflow = step.overflow === 'allow';

        /** @type {{x:number,y:number,w:number,h:number}|null} */
        let _box = props.value?.box || null;
        let _cropTool = null;
        let _natural = { w: 1, h: 1 };

        if (_allowOverflow) stageEl.classList.add('mpi-step-box__stage--overflow');

        /** Report the current box upward. The frame stores it under the step's role. */
        function _report() {
            dimsEl.textContent = _box ? `${_box.w} × ${_box.h}` : '';
            props.onChange?.({ box: _box });
        }

        /**
         * Size the overlay canvas to the rendered image box. cropTool maps
         * normalized coords through canvas pixel space, so a canvas that does
         * not match the displayed image puts the handles in the wrong place.
         *
         * Under `overflow: 'allow'` the canvas instead fills the whole STAGE,
         * which the `--overflow` modifier has padded. A box that leaves the frame
         * would otherwise be clipped away with its handles — you cannot judge how
         * much hair you included in a rectangle you cannot see. cropTool's
         * `_getContentBounds` already letterboxes the natural aspect into the
         * canvas and centres it, so the larger canvas needs no coord change: the
         * padding is symmetric, so the fitted rect IS the rendered image rect.
         */
        function _syncOverlaySize() {
            const rect = mediaEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const w = _allowOverflow ? stageEl.clientWidth : Math.round(rect.width);
            const h = _allowOverflow ? stageEl.clientHeight : Math.round(rect.height);
            if (!w || !h) return;
            overlayEl.width = w;
            overlayEl.height = h;
            overlayEl.style.width = `${w}px`;
            overlayEl.style.height = `${h}px`;
            _cropTool?.redraw();
        }

        /** Build the crop tool once the image has real intrinsic dimensions. */
        function _initCropTool() {
            _natural = _naturalSize(mediaEl);
            _syncOverlaySize();

            _cropTool = createCropTool({
                overlayCanvas: overlayEl,
                targetElement: mediaEl,
                showGrid: false,      // region marker, not a composition aid
                allowOverflow: _allowOverflow,
                onChange: (normRect) => {
                    _box = _normToSourcePx(normRect, _natural, _allowOverflow);
                    _report();
                },
            });

            // A step is NEVER invalid: with no restored value the box defaults to
            // the whole image (enable()'s maximal box), so the forward arrow is
            // never blocked (carousel-frame.md § Steps are DATA).
            const restored = _box ? _sourcePxToNorm(_box, _natural) : null;

            // A ratio is a UI lock only — the graph's width/height are independent.
            if (step.ratio != null) _cropTool.setRatio(step.ratio);
            _cropTool.enable();
            // enable() always starts from a maximal box; setRect is the RESTORE
            // path that actually keeps a saved rect.
            if (restored) _cropTool.setRect(restored);

            // Adopt whatever cropTool settled on (a ratio lock rewrites the seed),
            // so the reported value always matches what is drawn.
            _box = _normToSourcePx(_cropTool.getRect(), _natural, _allowOverflow);
            _report();
        }

        if (mediaEl.complete && mediaEl.naturalWidth) {
            _initCropTool();
        } else {
            _unsubs.push(on(mediaEl, 'load', _initCropTool));
        }

        // Re-fit the overlay when the stage resizes (window resize, step slide-in).
        const _ro = new ResizeObserver(() => _syncOverlaySize());
        _ro.observe(stageEl);

        // Source last: with the handler wired, a cached image still fires load.
        const url = props.media?.url ? resolveMediaUrl(props.media.url) : '';
        if (url) mediaEl.src = url;

        el.getValue = () => ({ box: _box });

        el.destroy = () => {
            _ro.disconnect();
            _cropTool?.destroy();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
