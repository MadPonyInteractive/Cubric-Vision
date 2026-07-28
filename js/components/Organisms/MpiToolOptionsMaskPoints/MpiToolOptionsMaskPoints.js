/**
 * MpiToolOptionsMaskPoints — Organism: the Points mask tool (MPI-361 / MPI-371).
 *
 * Click what you want and SAM3 segments whatever that point belongs to — the
 * answer to the YOLO vocabulary ceiling. Owns only what is specific to this
 * method: the click instructions and Clear points. The run/commit row and the
 * brush strip are shared components.
 *
 * The strip mounts WITHOUT its brush pair: here the user places points, and
 * painting belongs to a tool that paints.
 *
 * MPI-380 removed the "Scope" dial rather than remapping it. It drove
 * `SAMDetectorCombined.threshold`, and SAM3's point path ignores threshold
 * entirely — only `refine_iterations` applies. There is no dial to expose.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   clearMaskPoints()
 * No 'apply' emitted — the mask is canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory }  from '../../factory.js';
import { MpiButton }         from '../../Primitives/MpiButton/MpiButton.js';
import { MpiMaskDetectRow }  from '../../Compounds/MpiMaskDetectRow/MpiMaskDetectRow.js';
import { MpiMaskStrip }      from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs }                from '../../../utils/dom.js';

export const MpiToolOptionsMaskPoints = ComponentFactory.create({
    name: 'MpiToolOptionsMaskPoints',
    css: ['js/components/Organisms/MpiToolOptionsMaskPoints/MpiToolOptionsMaskPoints.css'],

    template: () => `
        <div class="mpi-tool-options-mask-points">
            <p class="mpi-tool-options-mask-points__info">
                <b>Left-click</b> what you want, <b>right-click</b> what to leave out.
                Click a dot again to remove it.
            </p>
            <div class="mpi-tool-options-mask-points__row" id="points-clear-slot"></div>
            <div id="detect-row-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];

        viewer.el.enterMode?.('mask');
        viewer.el.setMaskPointsMode?.(true);

        const clearPointsBtn = MpiButton.mount(qs('#points-clear-slot', el), {
            icon: 'trash', label: 'Clear points', size: 'sm', variant: 'secondary',
            info: 'Remove every point',
        });
        clearPointsBtn.on('click', () => viewer.el.clearMaskPoints?.());
        _children.push(clearPointsBtn);

        _children.push(MpiMaskDetectRow.mount(qs('#detect-row-slot', el), { viewer }));
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), { viewer, brush: false }));

        el.destroy = () => {
            // Leave the canvas in plain mask mode: points mode owns the right
            // button and suppresses the image context menu.
            viewer.el.setMaskPointsMode?.(false);
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
