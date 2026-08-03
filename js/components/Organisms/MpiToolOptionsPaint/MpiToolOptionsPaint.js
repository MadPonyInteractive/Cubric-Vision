/**
 * MpiToolOptionsPaint — Organism: the Paint tool (MPI-375).
 *
 * Paint colour onto the entry. Deliberately small: a colour picker, the shared
 * brush strip pointed at the paint destination, and Apply. No layers, no blend
 * modes, no pressure curves — a scribble here is an INPUT to the models, not
 * decoration. Rough in a shape, mask it, run detail over it, and the model gets
 * *where, what size, what colour* on top of the prompt.
 *
 * NOT A MASK TOOL. It keeps the PromptBox (paint → mask → detail is one operation)
 * but it is not in `_MASK_TOOLS`: the paint layer is real colour that Apply flattens
 * into a new history entry, and it stays on screen while the user switches to a mask
 * tool, which is the entire point.
 *
 * NOT A PREVIEW EITHER, so it does not extend `discardPreview()`. Paint strokes are
 * committed pixels like `manualCanvas` — the preview contract exists to stop an
 * UNCOMMITTED preview outliving its tool, and a paint stroke was never that.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('paint'), exitMode(), setPaintColor(), hasPaint(), applyPaint()
 *   plus the paint destination surface MpiMaskStrip drives (setPaintEnabled,
 *   setPaintBrushMode, setPaintOpacity, clearPaint)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiColorPicker }   from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { MpiMaskStrip }     from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { Events }           from '../../../events.js';
import { state }            from '../../../state.js';
import { getToolSettings }  from '../../../data/projectModel.js';
import { qs }               from '../../../utils/dom.js';

// eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
const DEFAULT_COLOR = '#e0446b';

export const MpiToolOptionsPaint = ComponentFactory.create({
    name: 'MpiToolOptionsPaint',
    css: ['js/components/Organisms/MpiToolOptionsPaint/MpiToolOptionsPaint.css'],

    template: () => `
        <div class="mpi-tool-options-paint">
            <div class="mpi-tool-options-paint__row" id="color-slot"></div>
            <div class="mpi-tool-options-paint__row" id="commit-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];

        viewer.el.enterMode?.('paint');

        const settings = getToolSettings(state.currentProject || {}, 'paint', {});
        const startColor = settings.color || DEFAULT_COLOR;
        viewer.el.setPaintColor?.(startColor);

        // ── Colour ───────────────────────────────────────────────────────────

        const picker = MpiColorPicker.mount(qs('#color-slot', el), {
            value: startColor,
            info: 'Paint colour',
        });
        picker.on('change', ({ hex }) => {
            viewer.el.setPaintColor?.(hex);
            Events.emit('settings:tool:update', { toolKey: 'paint', key: 'color', value: hex });
        });
        _children.push(picker);

        // ── Apply ────────────────────────────────────────────────────────────
        // Flattened SERVER-side onto the source and appended as one new history
        // entry — never a base64 round-trip of a full-res image (the MPI-362
        // precedent). The button is inert until something is painted, because an
        // empty Apply would still cost a history entry.

        // Disabled when the viewer cannot flatten — a button that swallows its own
        // click is the silent-failure shape this codebase keeps getting bitten by,
        // and `viewer.el.applyPaint?.()` would do exactly that. The optional call
        // stays as the guard; this makes the same fact visible.
        const canApply = typeof viewer.el.applyPaint === 'function';
        const applyBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Apply', icon: 'check', size: 'sm', variant: 'primary',
            disabled: !canApply,
            info: canApply
                ? 'Flatten the paint onto the image as a new entry'
                : 'Flatten is not available on this surface',
        });
        qs('#commit-slot', el).appendChild(applyBtn.el);
        applyBtn.on('click', () => viewer.el.applyPaint?.());
        _children.push(applyBtn);

        // ── The shared strip, pointed at paint ───────────────────────────────
        // Same brush engine, same controls, different destination (MPI-375). The
        // mask-only display toggles are dropped by the destination, not hidden.

        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), {
            viewer, brush: true, dest: 'paint',
        }));

        el.destroy = () => {
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
