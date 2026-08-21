import { ComponentFactory } from '../../factory.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { CropManager } from '../../Primitives/MpiCanvas/managers/CropManager.js';
import { CROP_RATIOS } from '../../../utils/ratios.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiStepCrop — the `crop` step kind (MPI-594).
 *
 * The OUTPAINT gizmo: a crop rect that is expected to leave the image, so the
 * pixels it selects beyond the source become the flat area an edit model is
 * asked to fill. The box gizmo's opposite number — `box` marks a region INSIDE
 * a picture, this one marks the frame the picture is about to sit in.
 *
 * Contract (every step kind implements it):
 *   props  { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * Value shape: `{ crop: { x, y, w, h }, ratio: { orientation, label } }` in
 * ABSOLUTE SOURCE PIXELS, top-left anchored and free to be NEGATIVE or to
 * overhang — the same unit `services/imageCrop.js` pads and extracts with, so
 * the rect survives Reuse and re-derives the same padded image every time.
 *
 * NOTHING HERE IS A SECOND CROP TOOL. `CropManager` is the History crop tool's
 * own rect/handle/snap engine, and it is mounted here whole: unclamped rect,
 * `cropSnap.js` edge + centre snapping, the dashed source-bounds outline, the
 * thirds grid, shift-from-centre. All this component adds is the stage it draws
 * on — a canvas plus a view transform — because `MpiCanvas`'s own stage carries
 * mask layers, paint layers and a tool router a flow step has no use for. Any
 * change to how a crop rect BEHAVES belongs in CropManager, where both surfaces
 * get it (docs/crop.md).
 *
 * Two things it deliberately does differently from the History tool:
 *
 * 1. **A ratio CONTAINS the image; it never inscribes it.** `CropManager.setRatio`
 *    fits the largest rect INSIDE the source, which is right for cropping and
 *    exactly wrong here: picking 1:1 would throw away the ends of a portrait
 *    instead of adding bars to its sides. `_seedContain` seeds the smallest rect
 *    at that ratio that covers the whole source, so choosing a shape only ever
 *    ADDS. Shrinking back into the picture is still one drag away.
 * 2. **The view frames image ∪ rect.** `getFitBox()` already returns that union;
 *    the refit is SUPPRESSED mid-drag (scale is what maps the cursor into image
 *    space, so changing it during a gesture makes the rect chase the pointer —
 *    docs/crop.md § The rect is not confined to the image).
 *
 * The ratio bar is the GIZMO's, not a declared `fields` row, for one reason: the
 * ratio list is orientation-DYNAMIC (flipping to landscape rewrites all nine
 * options and their icons), and a declared field's options are static. It is
 * still nothing but components — two `MpiRadioGroup`s over the same `CROP_RATIOS`
 * table the History tool's panel uses.
 */

/** Where the source ends and the fill begins — the outpaint target itself. */
// eslint-disable-next-line mpi/no-hardcoded-hex-color -- the fill IS the product, not a theme colour
const FILL = '#000000';

/**
 * Screen px kept clear around the fitted union, so a handle on its edge is drawn
 * whole rather than half-clipped. Handles are 10px across (CropManager).
 */
const HANDLE_SLACK = 14;

/** Icon-only orientation toggle. Mirrors MpiToolOptionsCrop's own pair. */
const ORIENTATIONS = [
    { label: 'Portrait',  value: 'portrait',  icon: 'ratio_9_16', info: 'Portrait shapes' },
    { label: 'Landscape', value: 'landscape', icon: 'ratio_16_9', info: 'Landscape shapes' },
];

/** FREE leads the row: no lock, each handle moves its own axis. */
const FREE = { label: 'Free', value: 'free', icon: 'crop', info: 'No aspect lock — every edge moves on its own' };

/**
 * Ratio options for one orientation, in MpiRadioGroup's shape.
 * `rect_*` → `ratio_*` is the same icon-name mapping MpiToolOptionsCrop does.
 * @param {'portrait'|'landscape'} orientation
 * @returns {Array<{label:string,value:string,icon:string}>}
 */
function _ratioOptionsFor(orientation) {
    const list = CROP_RATIOS[orientation] ?? CROP_RATIOS.portrait;
    return [FREE, ...list.map(r => ({
        label: r.label,
        value: r.label,
        icon: r.icon.replace('rect_', 'ratio_'),
    }))];
}

/**
 * The numeric aspect for an orientation + label, or null for FREE.
 * @param {'portrait'|'landscape'} orientation
 * @param {string} label
 * @returns {number|null}
 */
function _resolveRatio(orientation, label) {
    if (label === FREE.value) return null;
    const list = CROP_RATIOS[orientation] ?? CROP_RATIOS.portrait;
    return list.find(r => r.label === label)?.ratio ?? null;
}

/**
 * Compose the file the GRAPH actually runs on: the source drawn into the
 * reported rect, everything outside it filled.
 *
 * This is the whole of the flow's "outpaint" setup. The graph never learns a
 * rect — it loads ONE image that already carries its bars — so a workflow needs
 * no pad node, no mask and no fill input, and any future flow declaring a `crop`
 * step gets the same treatment for free (stepKinds.js § STEP_MEDIA).
 *
 * Pixels only: the caller places the result in the project's preview-asset
 * store, because storage is the frame's job and never a gizmo's.
 *
 * Returns null when there is nothing to add — a rect that matches the source
 * exactly is a no-op, and re-encoding the user's own picture to say so would
 * cost a hash miss in the content-addressed store on every run.
 *
 * @param {{url?:string}|null} media - the step's media item
 * @param {{crop?:{x:number,y:number,w:number,h:number}}|null} value
 * @returns {Promise<File|null>}
 */
export async function composePaddedImage(media, value) {
    const rect = value?.crop;
    const url = media?.url ? resolveMediaUrl(media.url) : '';
    if (!rect || !url || !(rect.w > 0) || !(rect.h > 0)) return null;

    const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
    });

    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (rect.x === 0 && rect.y === 0 && rect.w === nw && rect.h === nh) return null;

    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = FILL;
    ctx.fillRect(0, 0, rect.w, rect.h);
    // Top-left anchored, so a rect that starts off-canvas simply draws the source
    // at a negative offset — no clamping, no arithmetic, nothing to get wrong.
    ctx.drawImage(img, -rect.x, -rect.y);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'outpaint.png', { type: 'image/png' }) : null;
}

export const MpiStepCrop = ComponentFactory.create({
    name: 'MpiStepCrop',
    css: ['js/components/Organisms/MpiStepCrop/MpiStepCrop.css'],

    template: () => `
        <div class="mpi-step-crop">
            <div class="mpi-step-crop__stage" id="step-crop-stage">
                <canvas class="mpi-step-crop__canvas" id="step-crop-canvas"></canvas>
            </div>
            <div class="mpi-step-crop__bar">
                <div class="mpi-step-crop__orient" id="step-crop-orient"></div>
                <div class="mpi-step-crop__ratios" id="step-crop-ratios"></div>
            </div>
            <span class="mpi-step-crop__dims" id="step-crop-dims"></span>
        </div>`,

    setup: (el, props) => {
        const _unsubs = [];
        const stageEl = qs('#step-crop-stage', el);
        const canvasEl = /** @type {HTMLCanvasElement} */ (qs('#step-crop-canvas', el));
        const orientSlot = qs('#step-crop-orient', el);
        const ratiosSlot = qs('#step-crop-ratios', el);
        const dimsEl = qs('#step-crop-dims', el);

        const ctx = canvasEl.getContext('2d');
        const crop = new CropManager();
        crop.isCroppingMode = true;

        /** Screen-space view over image space. Recomputed by _refit. */
        const view = { offsetX: 0, offsetY: 0, scale: 1 };

        const imgEl = new Image();
        let _loaded = false;
        let _natural = { w: 1, h: 1 };

        const seeded = props.value || {};
        let _orientation = seeded.ratio?.orientation
            || (props.step?.orientation === 'landscape' ? 'landscape' : 'portrait');
        let _label = seeded.ratio?.label ?? FREE.value;

        let _orientRadio = null;
        let _ratioRadio = null;

        // ── Geometry ─────────────────────────────────────────────────────────

        /**
         * The smallest rect at `ratio` that CONTAINS the whole source, centred —
         * the outpaint seed. Never shrinks the picture; a chosen shape only adds
         * bars. FREE seeds the source itself.
         * @param {number|null} ratio
         */
        function _seedContain(ratio) {
            if (ratio == null) {
                crop.setRatio(null);   // FREE → the full image rect
                return;
            }
            const w = Math.max(_natural.w, _natural.h * ratio);
            crop.setExactSize(Math.round(w), Math.round(w / ratio));
        }

        /** Fit the view to image ∪ rect. Never while dragging — see the header. */
        function _refit() {
            const cw = canvasEl.width;
            const ch = canvasEl.height;
            if (cw <= HANDLE_SLACK * 2 || ch <= HANDLE_SLACK * 2 || !_loaded) return;
            const fit = crop.getFitBox() || { x: 0, y: 0, w: _natural.w, h: _natural.h };
            // Fit into an INSET box: a handle sitting on the union's edge is drawn
            // whole and stays grabbable instead of being half-clipped by the stage.
            const scale = Math.min(
                (cw - HANDLE_SLACK * 2) / fit.w,
                (ch - HANDLE_SLACK * 2) / fit.h,
            );
            view.scale = scale;
            view.offsetX = (cw - fit.w * scale) / 2 - fit.x * scale;
            view.offsetY = (ch - fit.h * scale) / 2 - fit.y * scale;
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
         * One pass, painter's order: the FILL under the rect (this is the black
         * the model is asked to replace, so the step shows it rather than
         * describing it), the source on top of it, then CropManager's own
         * overlay — scrim, dashed source bounds, border, thirds, handles.
         */
        function _draw() {
            if (!ctx) return;
            const { width: cw, height: ch } = canvasEl;
            ctx.clearRect(0, 0, cw, ch);
            if (!_loaded) return;

            const r = crop.cropRect;
            ctx.fillStyle = FILL;
            ctx.fillRect(
                view.offsetX + r.x * view.scale,
                view.offsetY + r.y * view.scale,
                r.w * view.scale,
                r.h * view.scale,
            );
            ctx.drawImage(
                imgEl,
                view.offsetX, view.offsetY,
                _natural.w * view.scale, _natural.h * view.scale,
            );
            crop.drawScreen(ctx, view, _natural.w, _natural.h);
        }

        /** Report upward + refresh the size readout. */
        function _report() {
            const rect = crop.getCropRect();
            dimsEl.textContent = _loaded ? `${rect.w} × ${rect.h}` : '';
            props.onChange?.({
                crop: rect,
                ratio: { orientation: _orientation, label: _label },
            });
        }

        function _sync() {
            _draw();
            _report();
        }

        // ── The ratio bar ────────────────────────────────────────────────────

        function _mountRatios() {
            if (_ratioRadio) { _ratioRadio.destroy?.(); _ratioRadio = null; ratiosSlot.innerHTML = ''; }
            const options = _ratioOptionsFor(_orientation);
            if (!options.some(o => o.value === _label)) _label = options[0].value;
            _ratioRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options,
                value: _label,
                name: 'flow-crop-ratio',
                labelPosition: 'top',
                // ONE row, not the History panel's 4-wide grid: that grid lives in a
                // narrow side panel, while this sits under a canvas and every row it
                // takes is a row the step's title and hint lose (both clipped off the
                // slide at two rows). Ten across the canvas width is ~75px a tile,
                // which still reads the shape icons apart.
                columns: 10,
            });
            ratiosSlot.appendChild(_ratioRadio.el);
            _ratioRadio.on('select', ({ value }) => {
                _label = value;
                _seedContain(_resolveRatio(_orientation, _label));
                _refit();
                _sync();
            });
        }

        _orientRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: ORIENTATIONS,
            value: _orientation,
            name: 'flow-crop-orientation',
            iconOnly: true,
        });
        orientSlot.appendChild(_orientRadio.el);
        _orientRadio.on('select', ({ value }) => {
            const prev = _ratioOptionsFor(_orientation);
            _orientation = value;
            // Mirror by index — the two lists are parallel (1:1↔1:1, 3:4↔4:3 …),
            // so flipping orientation TRANSPOSES the shape instead of resetting it.
            const next = _ratioOptionsFor(_orientation);
            const idx = prev.findIndex(o => o.value === _label);
            _label = (idx >= 0 && next[idx]) ? next[idx].value : next[0].value;
            _mountRatios();
            _seedContain(_resolveRatio(_orientation, _label));
            _refit();
            _sync();
        });
        _mountRatios();

        // ── Pointer ──────────────────────────────────────────────────────────

        _unsubs.push(on(canvasEl, 'mousedown', (ev) => {
            if (!_loaded) return;
            const p = _toImage(ev);
            const handle = crop.hitTest(p.x, p.y, view.scale);
            if (!handle) return;
            ev.preventDefault();
            crop.startDrag(handle, p.x, p.y);
        }));

        _unsubs.push(on(window, 'mousemove', (ev) => {
            if (!_loaded) return;
            const p = _toImage(ev);
            if (!crop.isDragging) {
                canvasEl.style.cursor = CropManager.getCursor(crop.hitTest(p.x, p.y, view.scale));
                return;
            }
            crop.drag(p.x, p.y, view.scale);
            _sync();   // NO refit — the scale must hold for the whole gesture
        }));

        _unsubs.push(on(window, 'mouseup', () => {
            if (!crop.isDragging) return;
            crop.endDrag();
            _refit();   // the rect settled, so the view may follow it now
            _sync();
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

        _unsubs.push(on(imgEl, 'load', () => {
            _natural = { w: imgEl.naturalWidth || 1, h: imgEl.naturalHeight || 1 };
            _loaded = true;
            crop.init(_natural.w, _natural.h);
            _syncCanvasSize();
            // A step is NEVER invalid: with no restored rect the seed is the chosen
            // shape around the whole image, so `›` is never blocked.
            if (seeded.crop) {
                crop.lockedRatio = _resolveRatio(_orientation, _label);
                crop.cropRect = { ...seeded.crop };
            } else {
                _seedContain(_resolveRatio(_orientation, _label));
            }
            _refit();
            _sync();
        }));

        const _ro = new ResizeObserver(() => _syncCanvasSize());
        _ro.observe(stageEl);

        // Source last: with the handler wired, a cached image still fires load.
        const url = props.media?.url ? resolveMediaUrl(props.media.url) : '';
        if (url) imgEl.src = url;

        el.getValue = () => ({
            crop: crop.getCropRect(),
            ratio: { orientation: _orientation, label: _label },
        });

        el.destroy = () => {
            _ro.disconnect();
            crop.destroy();
            _orientRadio?.destroy?.();
            _ratioRadio?.destroy?.();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
