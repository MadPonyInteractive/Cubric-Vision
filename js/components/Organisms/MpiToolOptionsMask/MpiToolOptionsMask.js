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
import { qs, on }         from '../../../utils/dom.js';
import { Hotkeys }        from '../../../managers/hotkeyManager.js';
import { Events }         from '../../../events.js';
import { state }          from '../../../state.js';
import { getToolSettings } from '../../../data/projectModel.js';

const DETECTION_MODELS_FALLBACK = [
    { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
    { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
    { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
];

const DEFAULTS = { model: null, useBox: true, opacity: 0.7, inverted: false };
const AUTO_DETECT_QUEUE_DISABLED_REASON = 'Auto detection is unavailable while Cue has running or queued jobs';

export const MpiToolOptionsMask = ComponentFactory.create({
    name: 'MpiToolOptionsMask',
    css: ['js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css'],

    template: () => `
        <div class="mpi-tool-options-mask">
            <div class="mpi-tool-options-mask__section-label">Auto masking</div>
            <div class="mpi-tool-options-mask__queue-note" id="auto-queue-note" hidden>
                Auto detection unavailable while Cue is active
            </div>
            <div class="mpi-tool-options-mask__auto" id="auto-detect-controls">
                <div class="mpi-tool-options-mask__section" id="auto-model-slot"></div>
                <div class="mpi-tool-options-mask__section" id="auto-mode-slot"></div>
                <div class="mpi-tool-options-mask__thumbs"  id="thumbs-slot"></div>
                <div class="mpi-tool-options-mask__row"     id="detect-slot"></div>
            </div>
            <div class="mpi-tool-options-mask__divider"></div>
            <div class="mpi-tool-options-mask__brush-row" id="brush-row-slot"></div>
            <div class="mpi-tool-options-mask__slider-row">
                <div class="mpi-tool-options-mask__slider-label">
                    <span>Opacity</span>
                    <span id="opacity-val"></span>
                </div>
                <div class="mpi-tool-options-mask__slider">
                    <input type="range" id="opacity-input" min="0" max="100" step="1" />
                </div>
            </div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];
        const autoControls = qs('#auto-detect-controls', el);
        const autoQueueNote = qs('#auto-queue-note', el);
        let _autoDetectBlocked = false;

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
        detectBtn.on('click', () => {
            if (_autoDetectBlocked) return;
            viewer.el.runAutoMaskDetect?.();
        });
        _children.push(detectBtn);

        function _syncAutoDetectionGate() {
            const blocked = (state.generationQueueCount || 0) > 0;
            _autoDetectBlocked = blocked;
            autoControls.classList.toggle('mpi-tool-options-mask__auto--disabled', blocked);
            autoControls.setAttribute('aria-disabled', blocked ? 'true' : 'false');
            if (blocked) autoControls.setAttribute('inert', '');
            else autoControls.removeAttribute('inert');
            autoQueueNote.hidden = !blocked;
            detectBtn.el.setDisabled?.(blocked);
            detectBtn.el.setAttribute('data-info', blocked ? AUTO_DETECT_QUEUE_DISABLED_REASON : 'Run detection');
        }

        const _offQueueGate = Events.onState('generationQueueCount', _syncAutoDetectionGate);
        _syncAutoDetectionGate();

        // ── Manual section — brush selector + invert/clear in same row ───────

        const brushRowSlot = qs('#brush-row-slot', el);

        const brushRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: [
                { label: 'Paint', value: 'brush',  icon: 'brush',  info: 'Paint mask (B)' },
                { label: 'Erase', value: 'eraser', icon: 'eraser', info: 'Erase mask (E)' },
            ],
            value: 'brush',
            name: 'mask-brush-mode',
            iconOnly: true,
        });
        brushRadio.on('select', ({ value }) => viewer.el.setMaskBrushMode?.(value));
        brushRowSlot.appendChild(brushRadio.el);
        _children.push(brushRadio);

        const invertBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'invert', size: 'sm', variant: 'secondary', info: 'Invert mask display',
        });
        const clearBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash', size: 'sm', variant: 'secondary', info: 'Clear mask',
        });
        invertBtn.el.classList.add('mpi-tool-options-mask__invert');
        brushRowSlot.appendChild(invertBtn.el);
        brushRowSlot.appendChild(clearBtn.el);

        const initialInverted = !!settings.inverted;
        const _applyInvert = (v) => {
            viewer.el.setMaskInverted?.(v);
            invertBtn.el.classList.toggle('is-active', v);
            invertBtn.el.classList.toggle('mpi-tool-options-mask__invert--on', v);
        };
        _applyInvert(initialInverted);

        invertBtn.on('click', () => {
            const next = !viewer.el.isMaskInverted?.();
            _applyInvert(next);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'inverted', value: next });
        });
        clearBtn.on('click',  () => viewer.el.clearMask?.());
        _children.push(invertBtn, clearBtn);

        const _setBrush  = () => brushRadio.el.setValue('brush');
        const _setEraser = () => brushRadio.el.setValue('eraser');

        const _unsubB = Hotkeys.bind('mask.brush.toolbar', _setBrush);
        const _unsubE = Hotkeys.bind('mask.eraser.toolbar', _setEraser);

        // ── Opacity slider ───────────────────────────────────────────────────

        const opacityInput = qs('#opacity-input', el);
        const opacityVal   = qs('#opacity-val', el);
        const initialOpacity = typeof settings.opacity === 'number' ? settings.opacity : DEFAULTS.opacity;
        const _applyOpacity = (pct) => {
            const v = Math.max(0, Math.min(1, pct / 100));
            viewer.el.setMaskOpacity?.(v);
            opacityVal.textContent = `${Math.round(pct)}%`;
        };
        opacityInput.value = String(Math.round(initialOpacity * 100));
        _applyOpacity(Number(opacityInput.value));
        const _offOpacity = on(opacityInput, 'input', () => {
            const pct = Number(opacityInput.value);
            _applyOpacity(pct);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'opacity', value: pct / 100 });
        });

        // ── Lifecycle ────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubB();
            _unsubE();
            _offQueueGate();
            _offOpacity();
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
