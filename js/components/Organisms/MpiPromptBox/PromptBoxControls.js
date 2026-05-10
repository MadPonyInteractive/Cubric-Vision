/**
 * PromptBoxControls.js — Sub-control registry for MpiPromptBox operation slots.
 *
 * Each entry maps a control ID → { nodeTitle, component, defaultValue, getValue, getInjectionParams }.
 * MpiPromptBox reads the registry to know which components to mount when an operation changes.
 * Controls are actual component files (Compounds/Primitives) — this registry is the config layer.
 *
 * Adding a new control:
 *   1. Create the component file (e.g. js/components/Compounds/MpiDenoiseSlider/)
 *   2. Import and add it here with its nodeTitle mapping
 *   3. Add the control ID to the desired operation's components[] in commandRegistry.js
 */

import { MpiOptionSelector } from '../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { getModelSettings } from '../../../data/projectModel.js';
import { Events } from '../../../events.js';
import { getModelRatios, RATIO_MODES } from '../../../utils/ratios.js';

/** @type {Record<string, ControlDef>} */
export const PROMPT_BOX_CONTROLS = {

    /**
     * ratio — Aspect ratio picker for image generation (t2i, i2i, upscale, video, etc.).
     * Mounts MpiRatioSelector and injects Width/Height into the workflow.
     * modelType sourced from model.type → determines ratio set and UI mode from ratios.js.
     * Persists selected ratio/orientation/qualityTier to project.json via modelSettings.
     */
    ratio: {
        nodeTitle: null, // not a single node; Width+Height injected separately
        defaultValue: '1:1',
        mount(el, opts = {}) {
            const model = opts.model || {};
            const modelType = model.type ?? 'flux';
            const modelId = model.id;

            // Read persisted settings from project
            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const savedRatioSettings = saved.ratioSelector || {};
            const initialOrientation = savedRatioSettings.orientation || 'portrait';
            const initialValue = savedRatioSettings.selectedRatio || this.defaultValue;
            const initialQualityTier = savedRatioSettings.qualityTier || 'medium';

            // Mount selector with saved state
            this._instance = MpiOptionSelector.mount(el, {
                variant: 'ratio',
                modelType,
                initialOrientation,
                value: initialValue,
                qualityTier: initialQualityTier,
                size: 'sm',
            });

            // Ratio selection: update displayed size + queue save via projectService
            this._instance.on('change', ({ value, w, h, orientation }) => {
                this.value = { label: value, w, h };
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'ratioSelector',
                        value: { selectedRatio: value, orientation },
                    });
                }
            });

            // Orientation change: queue save via projectService
            this._instance.on('orientation_change', ({ orientation }) => {
                if (!modelId) return;
                Events.emit('settings:model:update', {
                    modelId,
                    key: 'ratioSelector',
                    value: { orientation },
                });
            });

            // Quality tier change: queue save via projectService
            this._instance.on('quality_change', ({ qualityTier }) => {
                if (!modelId) return;
                Events.emit('settings:model:update', {
                    modelId,
                    key: 'ratioSelector',
                    value: { qualityTier },
                });
            });

            // Initialize cache with resolved dimensions (not hardcoded 1024×1024)
            const mode = RATIO_MODES[modelType] ?? 'orientation';
            const initRatios = getModelRatios(
                modelType,
                mode === 'orientation' ? initialOrientation : undefined,
                mode === 'quality' ? initialQualityTier : undefined
            );
            const initMatch = initRatios.find(r => r.label === initialValue) || initRatios[0];
            this.value = { label: initMatch.label, w: initMatch.w ?? 1024, h: initMatch.h ?? 1024 };
        },
        getValue() {
            return this.value ?? null;
        },
        getInjectionParams() {
            // Prefer live dimensions from the mounted selector; fall back to cache.
            if (this._instance?.el?.getValue) {
                const live = this._instance.el.getValue();
                if (live.w && live.h) return { Width: live.w, Height: live.h };
            }
            const v = this.value ?? { w: 1024, h: 1024 };
            return { Width: v.w, Height: v.h };
        },
    },

    /**
     * batch — Batch size picker (1..4) for image operations.
     * Mounts MpiBatchSelector and injects into node titled "Batch".
     * Persists per-model under modelSettings[modelId].batch.
     */

    /**
     * previewStage — Multi-stage video toggle.
     * When active, the workflow's `Preview_Only` boolean node is set to true,
     * producing a low-res preview MP4 instead of the final video. Registered
     * only on `_ms` ops (e.g. t2v_ms, i2v_ms). Persists per-model.
     */
    previewStage: {
        nodeTitle: null,
        defaultValue: false,
        mount(hostEl, opts = {}) {
            const model = opts.model || {};
            const modelId = model.id;

            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const initialActive = saved.previewStage === true;
            this.value = initialActive;

            this._instance = MpiButton.mount(hostEl, {
                icon: 'frameForward',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: initialActive,
                info: 'Preview initial stage — low-res preview pass before full render',
            });

            this._instance.on('click', ({ active }) => {
                this.value = !!active;
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'previewStage',
                        value: !!active,
                    });
                }
            });
        },
        getValue() {
            return this.value === true;
        },
        getInjectionParams() {
            return {};
        },
    },

    batch: {
        nodeTitle: 'Batch_Size',
        defaultValue: '1',
        mount(hostEl, opts = {}) {
            const model = opts.model || {};
            const modelId = model.id;

            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const savedNum = Number(saved.batch ?? 1);
            const initialValue = String(Number.isFinite(savedNum) ? Math.min(4, Math.max(1, savedNum)) : 1);

            this._instance = MpiOptionSelector.mount(hostEl, {
                variant: 'number',
                values: ['1', '2', '3', '4'],
                value: initialValue,
                icon: 'layers',
                popupTitle: 'BATCH',
                info: 'Batch size (images per run)',
                size: 'sm',
            });
            this.value = initialValue;

            this._instance.on('change', ({ value }) => {
                this.value = value;
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'batch',
                        value: parseInt(value, 10),
                    });
                }
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const live = this._instance?.el?.getValue?.();
            const v = parseInt(live ?? this.value ?? this.defaultValue, 10) || 1;
            // Workflow node titled "Batch_Size" (MpiInt, inputs.int).
            return { Batch_Size: v };
        },
    },

};

/**
 * Collects injection params from all active mounted controls.
 * @param {Map<string, ControlInstance>} activeControls
 * @returns {Object}
 */
export function getInjectionParamsFromControls(activeControls) {
    const params = {};
    for (const [, ctrl] of activeControls) {
        if (ctrl.getInjectionParams) {
            Object.assign(params, ctrl.getInjectionParams());
        }
    }
    return params;
}
