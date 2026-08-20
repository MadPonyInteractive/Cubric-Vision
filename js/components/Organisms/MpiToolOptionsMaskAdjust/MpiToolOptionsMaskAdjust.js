/**
 * MpiToolOptionsMaskAdjust — Organism: the Adjust tool, for BOTH layers
 * (MPI-382 mask, MPI-436 paint).
 *
 * A method OVER an existing layer rather than another way of making one: grow it,
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
 * ONE COMPONENT, TWO DESTINATIONS, registered under both `maskAdjust` and
 * `paintAdjust` — the MPI-368 / MPI-373 pattern. `props.mode` picks the row in
 * `DEST` below and nothing else in here branches: same operation, different layer.
 * On the paint layer this IS the outline tool, which is why that destination adds a
 * colour picker: grow's new ring, the band, and the Fill are all in it.
 *
 * LIVE, not bake-on-release. The user sits on the preview and judges it, then
 * presses Apply. Bake-on-release was rejected by name: dilate-then-erode is a
 * morphological CLOSE, so dragging back is not a restore. Leaving the tool with an
 * unapplied adjustment DISCARDS it — the preview contract (docs/masking-tools.md),
 * enforced from `mountOptions()` through `viewer.el.discardPreview()`.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 * @param {'maskAdjust'|'paintAdjust'} [mode='maskAdjust'] - which layer to drive
 *
 * Requires on viewer.el:
 *   enterMode(), exitMode(), and per destination —
 *   mask  — evaluateMask(), setMaskPointsMode(), beginMaskAdjust(),
 *           previewMaskAdjust(), applyMaskAdjust(), endMaskAdjust(), fillMaskHoles()
 *   paint — setPaintColor(), beginPaintAdjust(), previewPaintAdjust(),
 *           applyPaintAdjust(), endPaintAdjust(), fillPaintHoles()
 * No 'apply' emitted — both layers are canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiColorPicker }   from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { MpiRadioGroup }    from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiProgressBar }   from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiMaskStrip }     from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { Events }           from '../../../events.js';
import { state }            from '../../../state.js';
import { getToolSettings }  from '../../../data/projectModel.js';
import { qs }               from '../../../utils/dom.js';

/** Slider bound in layer px — mask-px at MASK_MAX_EDGE, image-px for paint. */
const MAX_R = 50;

// eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
const DEFAULT_PAINT_COLOR = '#e0446b';

/**
 * The destination table. A name row per layer, the way `MpiMaskStrip.DESTINATIONS`
 * does it — a new destination is a new row, never a new `if (isPaint)` threaded
 * through `setup()`.
 *
 * `fill` is per destination because the RESULT differs, not because the idea does:
 * the mask fills a hole with coverage, the paint layer fills it with the current
 * colour. It was mask-only until MPI-566, on the reasoning that an enclosed hole is
 * a coverage idea — wrong for the layer that ships the OUTLINE tool, where drawing a
 * closed shape and filling it is the whole point. `color` stays paint-only for the
 * reason that always held: the mask has no colour to fill anything with.
 */
const DEST = {
    maskAdjust: {
        viewerMode: 'mask',
        stripDest: 'mask',
        begin:   (v)    => v.el.beginMaskAdjust?.(),
        preview: (v, o) => v.el.previewMaskAdjust?.(o),
        apply:   (v)    => v.el.applyMaskAdjust?.(),
        end:     (v)    => v.el.endMaskAdjust?.(),
        fill:    (v)    => v.el.fillMaskHoles?.(),
        fillInfo: 'Close enclosed holes in the mask (undoable)',
        color: false,
    },
    paintAdjust: {
        viewerMode: 'paint',
        stripDest: 'paint',
        begin:   (v)    => v.el.beginPaintAdjust?.(),
        preview: (v, o) => v.el.previewPaintAdjust?.(o),
        apply:   (v)    => v.el.applyPaintAdjust?.(),
        end:     (v)    => v.el.endPaintAdjust?.(),
        fill:    (v)    => v.el.fillPaintHoles?.(),
        fillInfo: 'Fill enclosed holes with the current colour (undoable)',
        color: true,
    },
};

export const MpiToolOptionsMaskAdjust = ComponentFactory.create({
    name: 'MpiToolOptionsMaskAdjust',
    css: ['js/components/Organisms/MpiToolOptionsMaskAdjust/MpiToolOptionsMaskAdjust.css'],

    template: () => `
        <div class="mpi-tool-options-mask-adjust">
            <!-- Paint only, and REMOVED rather than [hidden] on the mask: a class
                 carrying a display rule outranks the UA sheet's [hidden], which is
                 exactly how the inert slider rows once reached the screen. -->
            <div class="mpi-tool-options-mask-adjust__row" id="color-slot"></div>
            <div class="mpi-tool-options-mask-adjust__row" id="mode-slot"></div>

            <div class="mpi-tool-options-mask-adjust__slider-row" id="grow-row">
                <div class="mpi-tool-options-mask-adjust__label">
                    <span>Shrink / Grow</span>
                    <span id="grow-val"></span>
                </div>
                <div id="grow-slot"></div>
            </div>

            <div class="mpi-tool-options-mask-adjust__slider-row" id="out-row" hidden>
                <div class="mpi-tool-options-mask-adjust__label">
                    <span>Outward</span>
                    <span id="out-val"></span>
                </div>
                <div id="out-slot"></div>
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
                <div id="in-slot"></div>
            </div>

            <div class="mpi-tool-options-mask-adjust__row" id="commit-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const dest = DEST[props.mode] || DEST.maskAdjust;
        const _children = [];

        viewer.el.enterMode?.(dest.viewerMode);
        // Entering Adjust from Points must give the right mouse button back. A no-op
        // on the paint destination, which never had the points mode.
        viewer.el.setMaskPointsMode?.(false);
        dest.begin(viewer);

        // The three sliders are MpiProgressBar, the app's ONE slider (MPI-582). They
        // used to be bare `<input type="range">` styled longhand here — the same 4px
        // rail and round thumb written out a third time, next to an identical copy in
        // MpiMaskStrip and a fourth in the flow frame. The value lives in `vals`
        // rather than being read back off the DOM: the primitive owns its input, and
        // `_reset` has to move the thumb WITHOUT firing a preview, which is exactly
        // what `setValueQuiet` is for.
        const vals = { grow: 0, out: 0, in: 0 };
        const mkSlider = (slot, key, min, max) => {
            const inst = MpiProgressBar.mount(qs(slot, el), {
                min, max, step: 1, value: 0,
                interactive: true, handle: true, wheel: true,
                // The row's own label already prints the value in px — a status-bar
                // echo of the same number is noise.
                info: '',
            });
            inst.on('input', ({ value }) => {
                vals[key] = value;
                _syncLabels();
                _schedule();
            });
            _children.push(inst);
            return inst;
        };
        const rows = {
            grow: qs('#grow-row', el),
            out:  qs('#out-row', el),
            in:   qs('#in-row', el),
        };

        let edgeMode = false;
        let _raf = 0;

        /** Coalesce to one preview per frame: a drag fires `input` faster than a
         *  full-layer range test can run, and queued frames would lag behind the
         *  thumb by however many events piled up. */
        const _schedule = () => {
            if (_raf) return;
            _raf = requestAnimationFrame(() => {
                _raf = 0;
                dest.preview(viewer, edgeMode
                    // Inward's track is mirrored, so its raw value is negative.
                    ? { edge: true, outward: vals.out, inward: -vals.in }
                    : { grow: vals.grow });
            });
        };

        // ── Colour — paint only (MPI-436) ────────────────────────────────────
        // Grow fills the new ring in it and the band IS this colour, so it has to be
        // reachable without leaving the tool. Shares the `paint` tool settings key
        // with the Paint panel, so the two agree on the current colour.

        if (dest.color) {
            const startColor = getToolSettings(state.currentProject || {}, 'paint', {}).color
                || DEFAULT_PAINT_COLOR;
            viewer.el.setPaintColor?.(startColor);
            const picker = MpiColorPicker.mount(qs('#color-slot', el), {
                value: startColor,
                info: 'Colour for the grown ring and the edge band',
            });
            picker.on('change', ({ hex }) => {
                viewer.el.setPaintColor?.(hex);
                Events.emit('settings:tool:update', { toolKey: 'paint', key: 'color', value: hex });
                // A live preview is already filled in the OLD colour — recompute it,
                // or the swatch and the canvas disagree until the next slider move.
                _schedule();
            });
            _children.push(picker);
        } else {
            qs('#color-slot', el)?.remove();
        }

        const _syncLabels = () => {
            qs('#grow-val', el).textContent = `${vals.grow > 0 ? '+' : ''}${vals.grow} px`;
            qs('#out-val', el).textContent  = `${vals.out} px`;
            qs('#in-val', el).textContent   = `${Math.abs(vals.in)} px`;
        };

        const growSlider = mkSlider('#grow-slot', 'grow', -MAX_R, MAX_R);
        const outSlider  = mkSlider('#out-slot',  'out',  0,      MAX_R);
        const inSlider   = mkSlider('#in-slot',   'in',   -MAX_R, 0);

        const _reset = () => {
            vals.grow = 0; vals.out = 0; vals.in = 0;
            // Quiet: moving the thumb must not emit `input`, or every reset would
            // schedule a preview from inside the handler that asked for the reset.
            growSlider.el.setValueQuiet(0);
            outSlider.el.setValueQuiet(0);
            inSlider.el.setValueQuiet(0);
            _syncLabels();
            _schedule();
        };

        // ── Mode — GATES the sliders; only the live row is on screen ─────────

        const layerWord = dest.color ? 'paint' : 'mask';
        const modeRadio = MpiRadioGroup.mount(qs('#mode-slot', el), {
            options: [
                { label: 'Grow', value: 'grow', icon: 'mask_adjust_stroke',
                  info: `Grow or shrink the whole ${layerWord}` },
                { label: 'Edge', value: 'edge', icon: 'invert',
                  info: `Reduce the ${layerWord} to a band around its edge — outward and inward` },
            ],
            value: 'grow',
            name: `${dest.stripDest}-adjust-mode`,
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
            info: `Bake the adjustment into the ${layerWord} (undoable)`,
        });
        const resetBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Reset', icon: 'refresh', size: 'sm', variant: 'secondary',
            info: `Drop the adjustment and go back to the ${layerWord}`,
        });
        // MPI-431: the graphs no longer fill holes (mask_fill_holes is off), so this is
        // the only place a hole closes — and the only place the user sees it happen.
        // MPI-566 gave the paint layer the same button: same flood, and the destination
        // decides only what the enclosed region gets filled WITH.
        const fillBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Fill', icon: 'mask_fill_holes_stroke', size: 'sm', variant: 'secondary',
            info: dest.fillInfo,
        });
        const commitRow = qs('#commit-slot', el);
        commitRow.appendChild(applyBtn.el);
        commitRow.appendChild(fillBtn.el);
        commitRow.appendChild(resetBtn.el);
        applyBtn.on('click', () => {
            if (dest.apply(viewer)) _reset();
        });
        // Fill bakes any live preview along with the fill, as ONE undo entry — so the
        // sliders must return to zero exactly as they do after Apply.
        fillBtn.on('click', () => {
            if (dest.fill(viewer)) _reset();
        });
        // Reset IS the discard half of the preview contract from inside the tool:
        // sliders to zero, and the zero preview tears the pending shape down. Its
        // handler was dropped by MPI-436 while this block was being rewritten for two
        // destinations, and nothing failed — the button just went dead. `tests/
        // mask-adjust.test.cjs` now guards all three of them.
        resetBtn.on('click', _reset);
        _children.push(applyBtn, fillBtn, resetBtn);

        _syncLabels();

        // No brush pair (MPI-381): Adjust operates on the whole layer, so a drag on
        // the canvas pans instead of painting. The strip still points at THIS layer,
        // so its opacity slider and Clear drive the one the tool is adjusting.
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), {
            viewer, brush: false, dest: dest.stripDest,
        }));

        el.destroy = () => {
            if (_raf) cancelAnimationFrame(_raf);
            // Belt and braces: mountOptions() already discarded through the shared
            // seam before destroying us, and both end*Adjust are idempotent.
            dest.end(viewer);
            // Mask only — an adjustment to the paint layer is not a mask change, and
            // re-publishing would misreport what the op strip is gated on.
            if (!dest.color) viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
