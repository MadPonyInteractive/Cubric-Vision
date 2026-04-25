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
import { MpiDropdown }    from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup }  from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs }             from '../../../utils/dom.js';
import { Hotkeys }        from '../../../managers/hotkeyManager.js';

const DETECTION_MODELS_FALLBACK = [
    { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
    { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
    { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
];

export const MpiToolOptionsMask = ComponentFactory.create({
    name: 'MpiToolOptionsMask',
    css: ['js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css'],

    template: () => `
        <div class="mpi-tool-options-mask">
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

        // ── Auto section ─────────────────────────────────────────────────────

        const models = viewer.el.getDetectionModels?.() ?? DETECTION_MODELS_FALLBACK;
        const modelDd = MpiDropdown.mount(qs('#auto-model-slot', el), {
            options: models,
            value: models[0].value,
            info: 'Detection model',
            direction: 'up',
        });
        modelDd.on('change', ({ value }) => viewer.el.setAutoMaskModel?.(value));
        _children.push(modelDd);

        const modeRadio = MpiRadioGroup.mount(qs('#auto-mode-slot', el), {
            options: [
                { label: 'Box',     value: 'box' },
                { label: 'Segment', value: 'segment' },
            ],
            value: 'box',
            name: 'mask-auto-mode',
            info: 'Detection mode',
        });
        modeRadio.on('select', ({ value }) => viewer.el.setAutoMaskUseBox?.(value === 'box'));
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

        const brushSlot = qs('#brush-slot', el);

        const brushBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'brush', size: 'sm', variant: 'ghost', info: 'Paint mask (B)',
            toggleable: true, active: true,
        });
        const eraserBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'eraser', size: 'sm', variant: 'ghost', info: 'Erase mask (E)',
            toggleable: true, active: false,
        });
        brushSlot.appendChild(brushBtn.el);
        brushSlot.appendChild(eraserBtn.el);

        const _setBrush = () => {
            brushBtn.el.setActive(true);
            eraserBtn.el.setActive(false);
            viewer.el.setMaskBrushMode?.('brush');
        };
        const _setEraser = () => {
            eraserBtn.el.setActive(true);
            brushBtn.el.setActive(false);
            viewer.el.setMaskBrushMode?.('eraser');
        };

        brushBtn.on('click', _setBrush);
        eraserBtn.on('click', _setEraser);
        _children.push(brushBtn, eraserBtn);

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
