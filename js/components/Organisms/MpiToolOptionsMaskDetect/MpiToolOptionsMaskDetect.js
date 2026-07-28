/**
 * MpiToolOptionsMaskDetect — Organism: the Detect mask tool (MPI-371).
 *
 * The fast one-click shortcut: UltralyticsDetectorProvider on Face / Hair /
 * Hand / Person. Everything YOLO has no word for lives on the Points tool.
 *
 * Owns only what is specific to this method — the model and box/segment radios.
 * The run/commit row and the brush strip are shared components.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   getDetectionModels?(), setAutoMaskModel(), setAutoMaskUseBox()
 * No 'apply' emitted — the mask is canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory }  from '../../factory.js';
import { MpiRadioGroup }     from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiMaskDetectRow }  from '../../Compounds/MpiMaskDetectRow/MpiMaskDetectRow.js';
import { MpiMaskStrip }      from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs }                from '../../../utils/dom.js';
import { Events }            from '../../../events.js';
import { state }             from '../../../state.js';
import { getToolSettings }   from '../../../data/projectModel.js';

const DETECTION_MODELS_FALLBACK = [
    { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
    { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
    { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
];

const DEFAULTS = { model: null, useBox: true };

export const MpiToolOptionsMaskDetect = ComponentFactory.create({
    name: 'MpiToolOptionsMaskDetect',
    css: ['js/components/Organisms/MpiToolOptionsMaskDetect/MpiToolOptionsMaskDetect.css'],

    template: () => `
        <div class="mpi-tool-options-mask-detect">
            <div class="mpi-tool-options-mask-detect__section" id="model-slot"></div>
            <div class="mpi-tool-options-mask-detect__section" id="mode-slot"></div>
            <div id="detect-row-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];

        viewer.el.enterMode?.('mask');
        // Entering Detect from Points must give the right mouse button back.
        viewer.el.setMaskPointsMode?.(false);

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, 'mask', DEFAULTS) };

        const models = viewer.el.getDetectionModels?.() ?? DETECTION_MODELS_FALLBACK;
        const initialModel = models.some(m => m.value === settings.model) ? settings.model : models[0].value;

        const modelRadio = MpiRadioGroup.mount(qs('#model-slot', el), {
            options: models.map(m => ({ ...m, info: m.info ?? `Detect ${m.label.toLowerCase()}` })),
            value: initialModel,
            name: 'mask-auto-model',
        });
        modelRadio.on('select', ({ value }) => {
            viewer.el.setAutoMaskModel?.(value);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'model', value });
        });
        viewer.el.setAutoMaskModel?.(initialModel);
        _children.push(modelRadio);

        const initialUseBox = typeof settings.useBox === 'boolean' ? settings.useBox : true;
        const modeRadio = MpiRadioGroup.mount(qs('#mode-slot', el), {
            options: [
                { label: 'Box',     value: 'box',     info: 'Create Selections with boxes - Less artifacts but larger area' },
                { label: 'Segment', value: 'segment', info: 'Precise masking with possible artifacts' },
            ],
            value: initialUseBox ? 'box' : 'segment',
            name: 'mask-auto-mode',
        });
        modeRadio.on('select', ({ value }) => {
            const useBox = value === 'box';
            viewer.el.setAutoMaskUseBox?.(useBox);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'useBox', value: useBox });
        });
        viewer.el.setAutoMaskUseBox?.(initialUseBox);
        _children.push(modeRadio);

        _children.push(MpiMaskDetectRow.mount(qs('#detect-row-slot', el), { viewer }));
        // No brush pair (MPI-381): painting belongs to the Brush tool, and a
        // canvas click on a brushless tool is unambiguous.
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), { viewer, brush: false }));

        el.destroy = () => {
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
