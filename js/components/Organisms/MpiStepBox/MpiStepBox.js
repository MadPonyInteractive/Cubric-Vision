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
 * @param {{x:number,y:number,w:number,h:number}} norm
 * @param {{w:number,h:number}} natural
 * @returns {{x:number,y:number,w:number,h:number}} integer source pixels
 */
function _normToSourcePx(norm, natural) {
    let x1 = norm.x * natural.w;
    let y1 = norm.y * natural.h;
    let x2 = (norm.x + norm.w) * natural.w;
    let y2 = (norm.y + norm.h) * natural.h;

    x1 = Math.max(0, Math.min(x1, natural.w));
    y1 = Math.max(0, Math.min(y1, natural.h));
    x2 = Math.max(0, Math.min(x2, natural.w));
    y2 = Math.max(0, Math.min(y2, natural.h));

    const x = Math.round(Math.min(x1, x2));
    const y = Math.round(Math.min(y1, y2));
    const w = Math.max(MIN_BOX_PX, Math.round(Math.abs(x2 - x1)));
    const h = Math.max(MIN_BOX_PX, Math.round(Math.abs(y2 - y1)));

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

        /** @type {{x:number,y:number,w:number,h:number}|null} */
        let _box = props.value?.box || null;
        let _cropTool = null;
        let _natural = { w: 1, h: 1 };

        /** Report the current box upward. The frame stores it under the step's role. */
        function _report() {
            dimsEl.textContent = _box ? `${_box.w} × ${_box.h}` : '';
            props.onChange?.({ box: _box });
        }

        /**
         * Size the overlay canvas to the rendered image box. cropTool maps
         * normalized coords through canvas pixel space, so a canvas that does
         * not match the displayed image puts the handles in the wrong place.
         */
        function _syncOverlaySize() {
            const rect = mediaEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            overlayEl.width = Math.round(rect.width);
            overlayEl.height = Math.round(rect.height);
            overlayEl.style.width = `${Math.round(rect.width)}px`;
            overlayEl.style.height = `${Math.round(rect.height)}px`;
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
                onChange: (normRect) => {
                    _box = _normToSourcePx(normRect, _natural);
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
            _box = _normToSourcePx(_cropTool.getRect(), _natural);
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
