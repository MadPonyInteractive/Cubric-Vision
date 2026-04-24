/**
 * MpiToolOptionsAutoMask — Organism: tool-options panel for Auto Mask mode.
 *
 * Self-contained: detection model dropdown + box/segment radio + thumbs + detect + apply.
 * Enters canvas viewer automask mode in setup; exits in destroy.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires (exposed by MpiCanvasViewer in sub-commit 3):
 *   viewer.el.enterMode('automask') / exitMode()
 *   viewer.el.setAutoMaskModel(id)
 *   viewer.el.setAutoMaskUseBox(bool)
 *   viewer.el.runAutoMaskDetect()
 *   viewer.el.getAutoMaskThumbs()  — returns MpiAutoMaskThumbs instance (optional)
 *
 * Emits:
 *   'apply' {} — user pressed Apply; Block reads mask via getCurrentMaskDataURL
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs } from '../../../utils/dom.js';

// Keep in sync with canvas-viewer's DETECTION_MODELS list.
const DETECTION_MODELS = [
    { label: 'YOLO v8',  value: 'yolov8' },
    { label: 'YOLO v11', value: 'yolov11' },
];

export const MpiToolOptionsAutoMask = ComponentFactory.create({
    name: 'MpiToolOptionsAutoMask',
    css: ['js/components/Organisms/MpiToolOptionsAutoMask/MpiToolOptionsAutoMask.css'],

    template: () => `
        <div class="mpi-tool-options-auto-mask">
            <div class="mpi-tool-options-auto-mask__row" id="model-slot"></div>
            <div class="mpi-tool-options-auto-mask__row" id="mode-slot"></div>
            <div class="mpi-tool-options-auto-mask__thumbs" id="thumbs-slot"></div>
            <div class="mpi-tool-options-auto-mask__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;

        viewer.el.enterMode?.('automask');

        const _children = [];

        const modelDd = MpiDropdown.mount(qs('#model-slot', el), {
            options: DETECTION_MODELS,
            value: DETECTION_MODELS[0].value,
            info: 'Detection model',
            direction: 'up',
        });
        modelDd.on('change', ({ value }) => viewer.el.setAutoMaskModel?.(value));
        _children.push(modelDd);

        const modeRadio = MpiRadioGroup.mount(qs('#mode-slot', el), {
            options: [
                { label: 'Box',     value: 'box' },
                { label: 'Segment', value: 'segment' },
            ],
            value: 'box',
            name: 'auto-mask-mode',
            info: 'Detection mode',
        });
        modeRadio.on('select', ({ value }) => viewer.el.setAutoMaskUseBox?.(value === 'box'));
        _children.push(modeRadio);

        // Thumbs strip — canvas viewer owns the MpiAutoMaskThumbs instance. If
        // it exposes the DOM node, attach it here; otherwise leave empty slot.
        const thumbsEl = viewer.el.getAutoMaskThumbsEl?.();
        if (thumbsEl) qs('#thumbs-slot', el).appendChild(thumbsEl);

        const actionsSlot = qs('#actions-slot', el);
        const detectBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'search', label: 'Detect', size: 'sm', variant: 'ghost',
            info: 'Run detection',
        });
        const applyBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'check', label: 'Apply', size: 'sm', variant: 'primary',
            info: 'Commit auto-mask',
        });
        actionsSlot.appendChild(detectBtn.el);
        actionsSlot.appendChild(applyBtn.el);
        detectBtn.on('click', () => viewer.el.runAutoMaskDetect?.());
        applyBtn.on('click', () => emit('apply', {}));
        _children.push(detectBtn, applyBtn);

        el.destroy = () => {
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
