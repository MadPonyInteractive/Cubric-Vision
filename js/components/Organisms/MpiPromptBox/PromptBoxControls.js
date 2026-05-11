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
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { state } from '../../../state.js';
import { getModelSettings } from '../../../data/projectModel.js';
import { Events } from '../../../events.js';
import { getModelRatios, RATIO_MODES } from '../../../utils/ratios.js';

/** @type {Record<string, ControlDef>} */
export const PROMPT_BOX_CONTROLS = {

    /**
     * qualityTier — Standalone quality picker for models whose ratio set is
     * partitioned by quality (RATIO_MODES[modelType] === 'quality', e.g. wan, ltx).
     * Renders as an inline radio row. Persists qualityTier under ratioSelector
     * (same key as `ratio` control) so they share a single source of truth.
     * Emits `ratio:quality-change` so the sibling ratio control can re-render
     * its ratio set without going through the popup.
     *
     * Renders nothing when the model uses orientation-mode ratios.
     */
    qualityTier: {
        nodeTitle: null,
        defaultValue: 'medium',
        mount(el, opts = {}) {
            const model = opts.model || {};
            const modelType = model.type ?? 'flux';
            const modelId = model.id;
            const mode = RATIO_MODES[modelType] ?? 'orientation';

            // Only render for quality-mode models. Leave host empty for others.
            if (mode !== 'quality') {
                this._instance = null;
                this.value = null;
                return;
            }

            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const initialTier = saved.ratioSelector?.qualityTier || this.defaultValue;
            this.value = initialTier;

            this._instance = MpiOptionSelector.mount(el, {
                variant: 'quality',
                qualityTier: initialTier,
            });

            this._instance.on('change', ({ qualityTier }) => {
                this.value = qualityTier;
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'ratioSelector',
                        value: { qualityTier },
                    });
                }
                // Notify sibling ratio control to re-render its ratio set.
                Events.emit('ratio:quality-change', { modelId, qualityTier });
            });
        },
        getValue() { return this.value; },
        getInjectionParams() { return {}; },
    },

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

            // External quality control (qualityTier entry) drives this ratio
            // control's ratio set via `ratio:quality-change`. Filter by modelId
            // so unrelated PromptBox instances don't react.
            this._qualityUnsub = Events.on('ratio:quality-change', ({ modelId: mid, qualityTier }) => {
                if (mid !== modelId) return;
                if (this._instance?.el?.setQualityTier) {
                    this._instance.el.setQualityTier(qualityTier);
                }
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
        destroy() {
            this._qualityUnsub?.();
            this._qualityUnsub = null;
            this._instance?.destroy?.();
            this._instance = null;
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

    /**
     * duration — Video length (int, 1..30, step 1).
     * Mounts MpiProgressBar slider and injects into node titled "Duration"
     * (MpiInt, inputs.value / inputs.int). Persists per-model under
     * modelSettings[modelId].duration.
     */
    duration: {
        nodeTitle: 'Duration',
        defaultValue: 5,
        mount(hostEl, opts = {}) {
            const model = opts.model || {};
            const modelId = model.id;

            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const savedNum = Number(saved.duration ?? this.defaultValue);
            const initial = Number.isFinite(savedNum) ? Math.min(30, Math.max(1, Math.round(savedNum))) : this.defaultValue;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Duration';
            const valEl = document.createElement('span');
            valEl.className = 'mpi-prompt-box__slider-val';
            valEl.textContent = `${initial} s`;
            lblRow.appendChild(nameEl);
            lblRow.appendChild(valEl);
            hostEl.appendChild(lblRow);

            const barHost = document.createElement('div');
            barHost.className = 'mpi-prompt-box__slider-track';
            hostEl.appendChild(barHost);

            this._instance = MpiProgressBar.mount(barHost, {
                min: 1,
                max: 30,
                step: 1,
                value: initial,
                interactive: true,
                wheel: true,
                handle: true,
                variant: 'primary',
                info: 'Video length in seconds',
            });

            const _renderLabel = (v) => { valEl.textContent = `${v} s`; };

            this._instance.on('input', ({ value }) => {
                _renderLabel(Math.min(30, Math.max(1, Math.round(value))));
            });

            this._instance.on('change', ({ value }) => {
                const v = Math.min(30, Math.max(1, Math.round(value)));
                this.value = v;
                _renderLabel(v);
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'duration',
                        value: v,
                    });
                }
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(30, Math.max(1, Math.round(Number(this.value ?? this.defaultValue) || this.defaultValue)));
            return { Duration: v };
        },
    },

    /**
     * motionIntensity — Motion strength (float, 0..1, step 0.01).
     * Mounts MpiProgressBar slider and injects into node titled
     * "Motion_Intensity" (MpiFloat, inputs.float). Persists per-model under
     * modelSettings[modelId].motionIntensity.
     */
    motionIntensity: {
        nodeTitle: 'Motion_Intensity',
        defaultValue: 0,
        mount(hostEl, opts = {}) {
            const model = opts.model || {};
            const modelId = model.id;

            const saved = state.currentProject ? getModelSettings(state.currentProject, modelId) : {};
            const savedNum = Number(saved.motionIntensity ?? this.defaultValue);
            const initial = Number.isFinite(savedNum) ? Math.min(1, Math.max(0, savedNum)) : this.defaultValue;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const _fmt = (v) => Number(v).toFixed(2);

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Motion';
            const valEl = document.createElement('span');
            valEl.className = 'mpi-prompt-box__slider-val';
            valEl.textContent = _fmt(initial);
            lblRow.appendChild(nameEl);
            lblRow.appendChild(valEl);
            hostEl.appendChild(lblRow);

            const barHost = document.createElement('div');
            barHost.className = 'mpi-prompt-box__slider-track';
            hostEl.appendChild(barHost);

            this._instance = MpiProgressBar.mount(barHost, {
                min: 0,
                max: 1,
                step: 0.01,
                value: initial,
                interactive: true,
                wheel: true,
                handle: true,
                variant: 'primary',
                info: 'Motion strength (0 = default, 1 = extra motion)',
            });

            const _renderLabel = (v) => { valEl.textContent = _fmt(v); };

            this._instance.on('input', ({ value }) => {
                _renderLabel(Math.min(1, Math.max(0, Number(value) || 0)));
            });

            this._instance.on('change', ({ value }) => {
                const v = Math.min(1, Math.max(0, Number(value) || 0));
                this.value = v;
                _renderLabel(v);
                if (modelId) {
                    Events.emit('settings:model:update', {
                        modelId,
                        key: 'motionIntensity',
                        value: v,
                    });
                }
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(1, Math.max(0, Number(this.value ?? this.defaultValue) || 0));
            return { Motion_Intensity: v };
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
