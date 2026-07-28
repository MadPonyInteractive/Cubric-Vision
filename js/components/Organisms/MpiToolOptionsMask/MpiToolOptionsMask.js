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

const DEFAULTS = {
    model: null, useBox: true, opacity: 0.7, inverted: false,
    // MPI-361 point prompts. `pointsThreshold` is SAMDetectorCombined.threshold —
    // stored 0..1, shown as a 30-99 "Scope" slider.
    source: 'detector', pointsThreshold: 0.93,
};
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
                <div class="mpi-tool-options-mask__section" id="auto-source-slot"></div>
                <div class="mpi-tool-options-mask__detector" id="detector-group">
                    <div class="mpi-tool-options-mask__section" id="auto-model-slot"></div>
                    <div class="mpi-tool-options-mask__section" id="auto-mode-slot"></div>
                </div>
                <div class="mpi-tool-options-mask__points" id="points-group" hidden>
                    <div class="mpi-tool-options-mask__slider-row">
                        <div class="mpi-tool-options-mask__slider-label">
                            <span>Scope</span>
                            <span id="points-threshold-val"></span>
                        </div>
                        <div class="mpi-tool-options-mask__slider">
                            <input type="range" id="points-threshold-input" min="30" max="99" step="1" />
                        </div>
                    </div>
                    <p class="mpi-tool-options-mask__info">
                        <b>Left-click</b> what you want, <b>right-click</b> what to leave out.
                        Click a dot again to remove it.
                        <br>All dots describe <b>one part per run</b> — for a second part,
                        Add the first, then place new dots.
                        <br><b>Scope</b> steps between a few results rather than sliding —
                        sweep it (35 / 50 / 70 / 93), don't nudge it.
                    </p>
                    <div class="mpi-tool-options-mask__row" id="points-clear-slot"></div>
                </div>
                <div class="mpi-tool-options-mask__thumbs"  id="thumbs-slot"></div>
                <div class="mpi-tool-options-mask__row"     id="detect-slot"></div>
                <div class="mpi-tool-options-mask__row"     id="commit-slot"></div>
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

        // Detector vs Points. The YOLO detector STAYS — it is the fast one-click
        // Face / Hair / Hand / Person shortcut; points sit beside it for everything
        // YOLO has no word for ("the headphones").
        const detectorGroup = qs('#detector-group', el);
        const pointsGroup   = qs('#points-group', el);
        let _pointsMode = settings.source === 'points';

        const sourceRadio = MpiRadioGroup.mount(qs('#auto-source-slot', el), {
            options: [
                { label: 'Detect',  value: 'detector', info: 'Find a known part — face, hair, hand, person' },
                { label: 'Points',  value: 'points',   info: 'Click anything on the image to select it' },
            ],
            value: _pointsMode ? 'points' : 'detector',
            name: 'mask-auto-source',
        });
        const _applySource = (value) => {
            _pointsMode = value === 'points';
            detectorGroup.hidden = _pointsMode;
            pointsGroup.hidden   = !_pointsMode;
            viewer.el.setMaskPointsMode?.(_pointsMode);
        };
        sourceRadio.on('select', ({ value }) => {
            _applySource(value);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'source', value });
        });
        _children.push(sourceRadio);

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

        // ── Points controls ──────────────────────────────────────────────────

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

        // ── Add / Subtract — bake the detected mask into the paint layers ────
        // Shown in BOTH sources: a run's result renders green (see
        // MpiCanvas._recolorMaskLayer) and waits for the user to commit it either
        // way. A points run returns ONE region, so this is also how multi-part
        // selections are built: Add the first part, place new dots, Add again.

        const commitRow = qs('#commit-slot', el);
        const addBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'plus', label: 'Add', size: 'sm', variant: 'secondary',
            info: 'Add the detected area to the mask',
        });
        const subBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'minus', label: 'Subtract', size: 'sm', variant: 'secondary',
            info: 'Cut the detected area out of the mask',
        });
        commitRow.appendChild(addBtn.el);
        commitRow.appendChild(subBtn.el);
        addBtn.on('click', () => viewer.el.bakeAutoPicks?.('manual'));
        subBtn.on('click', () => viewer.el.bakeAutoPicks?.('subtract'));
        _children.push(addBtn, subBtn);

        _applySource(_pointsMode ? 'points' : 'detector');

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
