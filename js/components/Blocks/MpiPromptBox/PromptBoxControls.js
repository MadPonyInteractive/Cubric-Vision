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

import { MpiRatioSelector } from '../../Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { state } from '../../../state.js';
import { getModelSettings, setModelSettings } from '../../../data/projectModel.js';
import { saveProjectSettings } from '../../../services/projectService.js';

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
            this._instance = MpiRatioSelector.mount(el, {
                modelType,
                initialOrientation,
                value: initialValue,
                qualityTier: initialQualityTier,
            });

            // Ratio selection: update displayed size + save to project
            this._instance.on('change', ({ value, w, h, orientation }) => {
                this.value = { label: value, w, h };
                if (state.currentProject && modelId) {
                    const updated = setModelSettings(state.currentProject, modelId, {
                        ratioSelector: { selectedRatio: value, orientation },
                    });
                    state.currentProject = updated;
                    saveProjectSettings();
                }
            });

            // Orientation change: save to project
            this._instance.on('orientation_change', ({ orientation }) => {
                if (!state.currentProject || !modelId) return;
                const updated = setModelSettings(state.currentProject, modelId, {
                    ratioSelector: { orientation },
                });
                state.currentProject = updated;
                saveProjectSettings();
            });

            // Quality tier change: save to project
            this._instance.on('quality_change', ({ qualityTier }) => {
                if (!state.currentProject || !modelId) return;
                const updated = setModelSettings(state.currentProject, modelId, {
                    ratioSelector: { qualityTier },
                });
                state.currentProject = updated;
                saveProjectSettings();
            });

            // Initialize with persisted value + dimensions
            this.value = { label: initialValue, w: 1024, h: 1024 };
        },
        getValue() {
            return this.value ?? null;
        },
        getInjectionParams() {
            const v = this.value ?? { w: 1024, h: 1024 };
            return { Width: v.w, Height: v.h };
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
