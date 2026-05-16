/**
 * MpiToolOptionsMask — Organism: unified mask tool-options panel.
 *
 * Merges auto-detect and manual brush/eraser into one panel. No apply button,
 * no tabs. Mask lives on canvas; PromptBox drives operations.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask()
 *   setMaskBrushMode('brush'|'eraser'), clearMask(), invertMask()
 *   getDetectionModels?(), setAutoMaskModel(), setAutoMaskUseBox()
 *   runAutoMaskDetect(), getAutoMaskThumbsEl?(), compositeMaskDataURL()
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }      from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup }  from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs }             from '../../../utils/dom.js';
import { Hotkeys }        from '../../../managers/hotkeyManager.js';
import { Events }         from '../../../events.js';
import { state }          from '../../../state.js';
import { getToolSettings } from '../../../data/projectModel.js';

const DETECTION_MODELS_FALLBACK = [
    { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
    { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
    { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
];

const DEFAULTS = { model: null, useBox: true };

export const MpiToolOptionsMask = ComponentFactory.create({
    name: 'MpiToolOptionsMask',
    css: ['js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css'],

    template: () => `
        <div class="mpi-tool-options-mask">
            <div class="mpi-tool-options-mask__section-label">Auto masking</div>
            <div class="mpi-tool-options-mask__section" id="auto-model-slot"></div>
            <div class="mpi-tool-options-mask__section" id="auto-mode-slot"></div>
            <div class="mpi-tool-options-mask__thumbs"  id="thumbs-slot"></div>
            <div class="mpi-tool-options-mask__row"     id="detect-slot"></div>
            <div class="mpi-tool-options-mask__divider"></div>
            <div class="mpi-tool-options-mask__section" id="brush-slot"></div>
            <div class="mpi-tool-options-mask__row"     id="shared-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];

        viewer.el.enterMode?.('mask');

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, 'mask', DEFAULTS) };

        // ── Auto section ─────────────────────────────────────────────────────

        const models = viewer.el.getDetectionModels?.() ?? DETECTION_MODELS_FALLBACK;
        const initialModel = models.some(m => m.value === settings.model) ? settings.model : models[0].value;

        const modelRadio = MpiRadioGroup.mount(qs('#auto-model-slot', el), {
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
        const modeRadio = MpiRadioGroup.mount(qs('#auto-mode-slot', el), {
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

        const thumbsEl = viewer.el.getAutoMaskThumbsEl?.();
        if (thumbsEl) qs('#thumbs-slot', el).appendChild(thumbsEl);

        const detectBtn = MpiButton.mount(qs('#detect-slot', el), {
            icon: 'search', label: 'Detect', size: 'sm', variant: 'primary',
            info: 'Run detection',
        });
        detectBtn.on('click', () => viewer.el.runAutoMaskDetect?.());
        _children.push(detectBtn);

        // ── Manual section ───────────────────────────────────────────────────

        const brushRadio = MpiRadioGroup.mount(qs('#brush-slot', el), {
            options: [
                { label: 'Paint', value: 'brush',  icon: 'brush',  info: 'Paint mask (B)' },
                { label: 'Erase', value: 'eraser', icon: 'eraser', info: 'Erase mask (E)' },
            ],
            value: 'brush',
            name: 'mask-brush-mode',
            iconOnly: true,
        });
        brushRadio.on('select', ({ value }) => viewer.el.setMaskBrushMode?.(value));
        _children.push(brushRadio);

        const _setBrush  = () => brushRadio.el.setValue('brush');
        const _setEraser = () => brushRadio.el.setValue('eraser');

        const _unsubB = Hotkeys.bind('mask.brush.toolbar', _setBrush);
        const _unsubE = Hotkeys.bind('mask.eraser.toolbar', _setEraser);

        // ── Shared row ───────────────────────────────────────────────────────

        const sharedSlot = qs('#shared-slot', el);

        const invertBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'invert', size: 'sm', variant: 'ghost', info: 'Invert mask',
        });
        const clearBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash', size: 'sm', variant: 'ghost', info: 'Clear mask',
        });
        sharedSlot.appendChild(invertBtn.el);
        sharedSlot.appendChild(clearBtn.el);

        invertBtn.on('click', () => viewer.el.invertMask?.());
        clearBtn.on('click',  () => viewer.el.clearMask?.());
        _children.push(invertBtn, clearBtn);

        // ── Lifecycle ────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubB();
            _unsubE();
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
