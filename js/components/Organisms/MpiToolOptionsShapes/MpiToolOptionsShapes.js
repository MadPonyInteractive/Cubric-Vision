/**
 * MpiToolOptionsShapes — Organism: the Shapes tool (MPI-368).
 *
 * ONE panel registered under TWO modes. `maskShapes` rasterises the gizmo into the
 * binary mask layers, `paintShapes` rasterises the same geometry into the RGBA
 * paint layer, and the only difference between the two mounts is the destination
 * and the two words on the commit buttons. That is the MPI-424 taxonomy in one
 * file: groups are by ARTIFACT, engines are shared across them.
 *
 * The destination comes from `props.mode`, which `MpiGroupHistoryBlock` passes to
 * every options compound. A second component per destination would have been two
 * files of pass-through to fork the moment one of them grew a control.
 *
 * COMMIT VOCABULARY DIFFERS ON PURPOSE (user, 2026-08-04): the mask keeps
 * Add / Subtract, paint gets Fill / Erase. "Subtract" already names a mask LAYER,
 * so reusing it for colour would make one word mean two things.
 *
 * THE SHAPE SURVIVES ITS COMMIT — three ellipses is three drags, not three
 * re-creations. Leaving the tool still discards it: a gizmo in flight IS a preview
 * (`docs/masking-tools.md` § The preview contract), dropped through
 * `viewer.el.discardPreview()` on the ONE seam, never at the call site.
 *
 * BRUSHLESS. The strip mounts with `brush: false`, which also disarms canvas
 * painting for the destination — otherwise a drag off the gizmo would paint
 * instead of panning.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 * @param {'maskShapes'|'paintShapes'} mode - which mount this is
 *
 * Requires on viewer.el:
 *   enterMode('mask'|'paint'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   setShapeMode(), setShapeKind(), getShapeKind(), resetShape(), clearShape(),
 *   commitShape()
 * No 'apply' emitted — a committed shape is layer pixels; PromptBox (mask) or the
 * Paint tool's own Apply (paint) drives what happens next.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup }    from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiMaskStrip }     from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { Events }           from '../../../events.js';
import { state }            from '../../../state.js';
import { getToolSettings }  from '../../../data/projectModel.js';
import { qs }               from '../../../utils/dom.js';

/**
 * Per-destination differences, as a table rather than `if (isPaint)` through
 * setup() — the same shape `MpiMaskStrip.DESTINATIONS` uses, and for the same
 * reason: a third destination should be a row, never another branch.
 */
const MOUNTS = {
    maskShapes: {
        dest: 'mask',
        canvasMode: 'mask',
        commits: [
            { op: 'add',      label: 'Add',      icon: 'plus',  variant: 'primary',   info: 'Add the shape to the mask' },
            { op: 'subtract', label: 'Subtract', icon: 'minus', variant: 'secondary', info: 'Cut the shape out of the mask' },
        ],
    },
    paintShapes: {
        dest: 'paint',
        canvasMode: 'paint',
        commits: [
            { op: 'fill',  label: 'Fill',  icon: 'brush',  variant: 'primary',   info: 'Fill the shape with the paint colour' },
            { op: 'erase', label: 'Erase', icon: 'eraser', variant: 'secondary', info: 'Erase the shape out of the paint' },
        ],
    },
};

const KINDS = [
    { label: 'Rectangle', value: 'rect',     icon: 'shape_rect_stroke',     info: 'Rectangle' },
    { label: 'Triangle',  value: 'triangle', icon: 'shape_triangle_stroke', info: 'Triangle' },
    { label: 'Ellipse',   value: 'ellipse',  icon: 'shape_ellipse_stroke',  info: 'Ellipse' },
];

export const MpiToolOptionsShapes = ComponentFactory.create({
    name: 'MpiToolOptionsShapes',
    css: ['js/components/Organisms/MpiToolOptionsShapes/MpiToolOptionsShapes.css'],

    template: () => `
        <div class="mpi-tool-options-shapes">
            <div class="mpi-tool-options-shapes__hint">
                Drag the shape or its handles. <kbd>Shift</kbd> keeps its proportions,
                <kbd>Alt</kbd> over a handle rotates around it.
            </div>
            <div class="mpi-tool-options-shapes__row" id="kind-slot"></div>
            <div class="mpi-tool-options-shapes__row" id="commit-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        // Unknown mode would silently drive the MASK layer while the rail said Paint,
        // so it fails loudly instead — the same trap MpiMaskStrip's table has.
        const mount = MOUNTS[props.mode];
        if (!mount) throw new Error(`MpiToolOptionsShapes: unknown mode "${props.mode}"`);
        const _children = [];

        viewer.el.enterMode?.(mount.canvasMode);
        // Entering from Points must give the right mouse button back — the same
        // reason the Brush tool does it.
        if (mount.dest === 'mask') viewer.el.setMaskPointsMode?.(false);

        // Arming is what routes the pointer to the gizmo and decides where a commit
        // lands. It also seeds the shape when there is not one yet.
        viewer.el.setShapeMode?.(mount.dest);

        // ── Which shape ──────────────────────────────────────────────────────
        // Settings live under ONE `shapes` key, shared by both mounts: the kind is a
        // property of the gizmo, not of the destination, so switching Mask → Paint
        // must not silently change the shape under the user.

        const settings = getToolSettings(state.currentProject || {}, 'shapes', {});
        const startKind = KINDS.some(k => k.value === settings.kind)
            ? settings.kind
            : (viewer.el.getShapeKind?.() || 'rect');
        viewer.el.setShapeKind?.(startKind);

        const kindRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: KINDS,
            value: startKind,
            name: 'shape-kind',
            iconOnly: true,
        });
        kindRadio.on('select', ({ value }) => {
            viewer.el.setShapeKind?.(value);
            Events.emit('settings:tool:update', { toolKey: 'shapes', key: 'kind', value });
        });
        qs('#kind-slot', el).appendChild(kindRadio.el);
        _children.push(kindRadio);

        // ── Commit ───────────────────────────────────────────────────────────

        const commitRow = qs('#commit-slot', el);
        for (const c of mount.commits) {
            const btn = MpiButton.mount(document.createElement('div'), {
                label: c.label, icon: c.icon, size: 'sm', variant: c.variant, info: c.info,
            });
            btn.on('click', () => viewer.el.commitShape?.(c.op));
            commitRow.appendChild(btn.el);
            _children.push(btn);
        }

        // Dragged off screen, the gizmo has no handle left to grab. One button back
        // is cheaper than making the user pan until they find it.
        const centreBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'crop', size: 'sm', variant: 'secondary', info: 'Re-centre the shape',
        });
        centreBtn.on('click', () => viewer.el.resetShape?.());
        commitRow.appendChild(centreBtn.el);
        _children.push(centreBtn);

        // ── The shared strip, brushless ──────────────────────────────────────

        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), {
            viewer, brush: false, dest: mount.dest,
        }));

        el.destroy = () => {
            // Belt and braces: mountOptions() already discarded through the shared
            // seam before destroying us, and both calls are idempotent.
            viewer.el.setShapeMode?.(null);
            viewer.el.clearShape?.();
            if (mount.dest === 'mask') viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
