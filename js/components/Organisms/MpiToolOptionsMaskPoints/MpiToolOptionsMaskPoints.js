/**
 * MpiToolOptionsMaskPoints — Organism: the Points mask tool (MPI-361 / MPI-371).
 *
 * Click what you want and SAM segments whatever that point belongs to — the
 * answer to the YOLO vocabulary ceiling. Owns only what is specific to this
 * method: the Scope dial, the click instructions, and Clear points. The
 * run/commit row and the brush strip are shared components.
 *
 * The strip mounts WITHOUT its brush pair: here the user places points, and
 * painting belongs to a tool that paints.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   setMaskPointsThreshold(), clearMaskPoints()
 * No 'apply' emitted — the mask is canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory }  from '../../factory.js';
import { MpiButton }         from '../../Primitives/MpiButton/MpiButton.js';
import { MpiMaskDetectRow }  from '../../Compounds/MpiMaskDetectRow/MpiMaskDetectRow.js';
import { MpiMaskStrip }      from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs, on }            from '../../../utils/dom.js';
import { Events }            from '../../../events.js';
import { state }             from '../../../state.js';
import { getToolSettings }   from '../../../data/projectModel.js';

// `pointsThreshold` is SAMDetectorCombined.threshold — stored 0..1, shown as a
// 30-99 "Scope" slider.
const DEFAULTS = { pointsThreshold: 0.93 };

export const MpiToolOptionsMaskPoints = ComponentFactory.create({
    name: 'MpiToolOptionsMaskPoints',
    css: ['js/components/Organisms/MpiToolOptionsMaskPoints/MpiToolOptionsMaskPoints.css'],

    template: () => `
        <div class="mpi-tool-options-mask-points">
            <div class="mpi-tool-options-mask-points__slider-row">
                <div class="mpi-tool-options-mask-points__slider-label">
                    <span>Scope</span>
                    <span id="points-threshold-val"></span>
                </div>
                <div class="mpi-tool-options-mask-points__slider">
                    <input type="range" id="points-threshold-input" min="30" max="99" step="1" />
                </div>
            </div>
            <p class="mpi-tool-options-mask-points__info">
                <b>Left-click</b> what you want, <b>right-click</b> what to leave out.
                Click a dot again to remove it.
                <br>All dots describe <b>one part per run</b> — for a second part,
                Add the first, then place new dots.
                <br><b>Scope</b> steps between a few results rather than sliding —
                sweep it (35 / 50 / 70 / 93), don't nudge it.
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

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, 'mask', DEFAULTS) };

        const thresholdInput = qs('#points-threshold-input', el);
        const thresholdVal   = qs('#points-threshold-val', el);
        const initialThreshold = typeof settings.pointsThreshold === 'number'
            ? settings.pointsThreshold : DEFAULTS.pointsThreshold;
        const _applyThreshold = (pct) => {
            viewer.el.setMaskPointsThreshold?.(pct / 100);
            // Higher threshold = tighter selection, which reads backwards on a
            // slider labelled "Scope". Show the raw number so the sweep advice in
            // the info box lines up with what the user is dragging.
            thresholdVal.textContent = String(Math.round(pct));
        };
        thresholdInput.value = String(Math.round(initialThreshold * 100));
        _applyThreshold(Number(thresholdInput.value));
        const _offThreshold = on(thresholdInput, 'change', () => {
            const pct = Number(thresholdInput.value);
            _applyThreshold(pct);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'pointsThreshold', value: pct / 100 });
        });
        const _offThresholdLive = on(thresholdInput, 'input', () => {
            thresholdVal.textContent = String(Math.round(Number(thresholdInput.value)));
        });

        const clearPointsBtn = MpiButton.mount(qs('#points-clear-slot', el), {
            icon: 'trash', label: 'Clear points', size: 'sm', variant: 'secondary',
            info: 'Remove every point',
        });
        clearPointsBtn.on('click', () => viewer.el.clearMaskPoints?.());
        _children.push(clearPointsBtn);

        _children.push(MpiMaskDetectRow.mount(qs('#detect-row-slot', el), { viewer }));
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), { viewer, brush: false }));

        el.destroy = () => {
            _offThreshold();
            _offThresholdLive();
            // Leave the canvas in plain mask mode: points mode owns the right
            // button and suppresses the image context menu.
            viewer.el.setMaskPointsMode?.(false);
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
