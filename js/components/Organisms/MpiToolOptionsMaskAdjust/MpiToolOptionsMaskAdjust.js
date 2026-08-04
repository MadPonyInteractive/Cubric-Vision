/**
 * MpiToolOptionsMaskAdjust — Organism: the Adjust mask tool (MPI-382).
 *
 * A method OVER an existing mask rather than another way of making one: grow it,
 * shrink it, or reduce it to an edge band. A MODE radio picks which, and only that
 * mode's sliders exist — one bidirectional Grow / Shrink row, or Outward + Inward.
 * The mode is a radio rather than a toggle button because the panel must never show
 * a slider that does nothing: the first thing a user does is grab the nearest
 * handle, and a visible-but-inert Outward slider reads as a broken tool.
 *
 * Grow, shrink and the band are the SAME dilate/erode primitive read three ways;
 * it lives in `managers/distanceField.js` and is written once — an exact distance
 * field built on tool entry, which each mode reads as one range (MPI-441).
 *
 * LIVE, not bake-on-release. The user sits on the preview and judges it, then
 * presses Apply. Bake-on-release was rejected by name: dilate-then-erode is a
 * morphological CLOSE, so dragging back is not a restore. Leaving the tool with an
 * unapplied adjustment DISCARDS it — the preview contract (docs/masking-tools.md),
 * enforced from `mountOptions()` through `viewer.el.discardPreview()`.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   beginMaskAdjust(), previewMaskAdjust(), applyMaskAdjust(), endMaskAdjust(),
 *   fillMaskHoles()
 * No 'apply' emitted — the mask is canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup }    from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiMaskStrip }     from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs, on }           from '../../../utils/dom.js';

/** Slider bound in mask-px, at the MASK_MAX_EDGE working size. */
const MAX_R = 50;

export const MpiToolOptionsMaskAdjust = ComponentFactory.create({
    name: 'MpiToolOptionsMaskAdjust',
    css: ['js/components/Organisms/MpiToolOptionsMaskAdjust/MpiToolOptionsMaskAdjust.css'],

    template: () => `
        <div class="mpi-tool-options-mask-adjust">
            <div class="mpi-tool-options-mask-adjust__row" id="mode-slot"></div>

            <div class="mpi-tool-options-mask-adjust__slider-row" id="grow-row">
                <div class="mpi-tool-options-mask-adjust__label">
                    <span>Shrink / Grow</span>
                    <span id="grow-val"></span>
                </div>
                <input type="range" id="grow-input" min="-${MAX_R}" max="${MAX_R}" step="1" value="0" />
            </div>

            <div class="mpi-tool-options-mask-adjust__slider-row" id="out-row" hidden>
                <div class="mpi-tool-options-mask-adjust__label">
                    <span>Outward</span>
                    <span id="out-val"></span>
                </div>
                <input type="range" id="out-input" min="0" max="${MAX_R}" step="1" value="0" />
            </div>

            <div class="mpi-tool-options-mask-adjust__slider-row" id="in-row" hidden>
                <div class="mpi-tool-options-mask-adjust__label">
                    <span>Inward</span>
                    <span id="in-val"></span>
                </div>
                <!-- MIRRORED on purpose (user, 2026-08-03): zero at the RIGHT, growing
                     leftward, so the pair reads outward-right / inward-left about the mask
                     edge. Done with a negative range rather than a CSS flip — a transform
                     would leave the keyboard arrows running backwards. -->
                <input type="range" id="in-input" min="-${MAX_R}" max="0" step="1" value="0" />
            </div>

            <div class="mpi-tool-options-mask-adjust__row" id="commit-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];
        const _offs = [];

        viewer.el.enterMode?.('mask');
        // Entering Adjust from Points must give the right mouse button back.
        viewer.el.setMaskPointsMode?.(false);
        viewer.el.beginMaskAdjust?.();

        const growInput = qs('#grow-input', el);
        const outInput  = qs('#out-input', el);
        const inInput   = qs('#in-input', el);
        const rows = {
            grow: qs('#grow-row', el),
            out:  qs('#out-row', el),
            in:   qs('#in-row', el),
        };

        let edgeMode = false;
        let _raf = 0;

        /** Coalesce to one preview per frame: a drag fires `input` faster than a
         *  full-layer blur + threshold can run, and queued frames would lag behind
         *  the thumb by however many events piled up. */
        const _schedule = () => {
            if (_raf) return;
            _raf = requestAnimationFrame(() => {
                _raf = 0;
                viewer.el.previewMaskAdjust?.(edgeMode
                    // Inward's track is mirrored, so its raw value is negative.
                    ? { edge: true, outward: +outInput.value, inward: -inInput.value }
                    : { grow: +growInput.value });
            });
        };

        const _syncLabels = () => {
            qs('#grow-val', el).textContent = `${+growInput.value > 0 ? '+' : ''}${growInput.value} px`;
            qs('#out-val', el).textContent  = `${outInput.value} px`;
            qs('#in-val', el).textContent   = `${Math.abs(+inInput.value)} px`;
        };

        const _reset = () => {
            growInput.value = '0';
            outInput.value  = '0';
            inInput.value   = '0';
            _syncLabels();
            _schedule();
        };

        for (const input of [growInput, outInput, inInput]) {
            _offs.push(on(input, 'input', () => { _syncLabels(); _schedule(); }));
        }

        // ── Mode — GATES the sliders; only the live row is on screen ─────────

        const modeRadio = MpiRadioGroup.mount(qs('#mode-slot', el), {
            options: [
                { label: 'Grow', value: 'grow', icon: 'mask_adjust_stroke',
                  info: 'Grow or shrink the whole mask' },
                { label: 'Edge', value: 'edge', icon: 'invert',
                  info: 'Reduce the mask to a band around its edge — outward and inward' },
            ],
            value: 'grow',
            name: 'mask-adjust-mode',
        });
        modeRadio.on('select', ({ value }) => {
            edgeMode = value === 'edge';
            rows.grow.hidden = edgeMode;
            rows.out.hidden  = !edgeMode;
            rows.in.hidden   = !edgeMode;
            // The hidden row keeps no preview: what is on screen is the whole truth
            // about what Apply would bake.
            _reset();
        });
        _children.push(modeRadio);

        // ── Apply / Reset ────────────────────────────────────────────────────

        const applyBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Apply', icon: 'check', size: 'sm', variant: 'primary',
            info: 'Bake the adjustment into the mask (undoable)',
        });
        const resetBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Reset', icon: 'refresh', size: 'sm', variant: 'secondary',
            info: 'Drop the adjustment and go back to the mask',
        });
        // MPI-431: the graphs no longer fill holes (mask_fill_holes is off), so this is
        // the only place a hole closes — and the only place the user sees it happen.
        const fillBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Fill', icon: 'mask_fill_holes_stroke', size: 'sm', variant: 'secondary',
            info: 'Close enclosed holes in the mask (undoable)',
        });
        const commitRow = qs('#commit-slot', el);
        commitRow.appendChild(applyBtn.el);
        commitRow.appendChild(fillBtn.el);
        commitRow.appendChild(resetBtn.el);
        applyBtn.on('click', () => {
            if (viewer.el.applyMaskAdjust?.()) _reset();
        });
        // Fill bakes any live preview along with the fill, as ONE undo entry — so the
        // sliders must return to zero exactly as they do after Apply.
        fillBtn.on('click', () => {
            if (viewer.el.fillMaskHoles?.()) _reset();
        });
        resetBtn.on('click', _reset);
        _children.push(applyBtn, fillBtn, resetBtn);

        _syncLabels();

        // No brush pair (MPI-381): Adjust operates on the whole layer, so a drag on
        // the canvas pans instead of painting.
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), { viewer, brush: false }));

        el.destroy = () => {
            if (_raf) cancelAnimationFrame(_raf);
            // Belt and braces: mountOptions() already discarded through the shared
            // seam before destroying us, and endMaskAdjust is idempotent.
            viewer.el.endMaskAdjust?.();
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _offs.forEach(fn => fn?.());
            _children.forEach(c => c.destroy?.());
        };
    },
});
