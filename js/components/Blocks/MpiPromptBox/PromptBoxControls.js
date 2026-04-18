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
import { setModelSettings, getModelSettings } from '../../../data/projectModel.js';
import { saveProjectSettings } from '../../../managers/projectManager.js';

/** @type {Record<string, ControlDef>} */
export const PROMPT_BOX_CONTROLS = {

    /**
     * ratio — Aspect ratio picker for image/video generation (t2i, i2i, t2v, i2v, etc.).
     * Mounts MpiRatioSelector and injects Width/Height into the workflow.
     * Reads initial state from modelSettings[modelId]; persists on change.
     */
    ratio: {
        nodeTitle: null, // not a single node; Width+Height injected separately
        defaultValue: '1:1',
        mount(el, opts = {}) {
            const model = opts.model;
            const modelType = model?.type ?? 'flux';
            const modelId = model?.id;

            // Read saved ratio state from project, or use defaults
            let initialRatio = this.defaultValue;
            let initialOrientation = 'portrait';
            let initialQualityTier = 'medium';

            if (modelId && state.currentProject) {
                const modelSettings = getModelSettings(state.currentProject, modelId);
                const ratioSettings = modelSettings.ratioSelector || {};
                if (ratioSettings.selectedRatio) initialRatio = ratioSettings.selectedRatio;
                if (ratioSettings.orientation) initialOrientation = ratioSettings.orientation;
                if (ratioSettings.qualityTier) initialQualityTier = ratioSettings.qualityTier;
            }

            this._instance = MpiRatioSelector.mount(el, {
                modelType: modelType,
                initialOrientation: initialOrientation,
                qualityTier: initialQualityTier,
                value: initialRatio,
            });

            // On ratio change: save to project (debounced globally via saveProjectSettings)
            this._instance.on('change', ({ value, w, h }) => {
                this.value = { label: value, w, h };
                if (modelId && state.currentProject) {
                    const updated = setModelSettings(state.currentProject, modelId, {
                        ratioSelector: { selectedRatio: value },
                    });
                    state.currentProject = updated;
                    saveProjectSettings();
                }
            });

            // On orientation change: save to project (debounced globally via saveProjectSettings)
            this._instance.on('orientation_change', ({ orientation, value }) => {
                if (modelId && state.currentProject) {
                    const updated = setModelSettings(state.currentProject, modelId, {
                        ratioSelector: { orientation, selectedRatio: value },
                    });
                    state.currentProject = updated;
                    saveProjectSettings();
                }
            });

            // On quality tier change: save to project (debounced globally via saveProjectSettings)
            this._instance.on('quality_change', ({ qualityTier }) => {
                if (modelId && state.currentProject) {
                    const updated = setModelSettings(state.currentProject, modelId, {
                        ratioSelector: { qualityTier },
                    });
                    state.currentProject = updated;
                    saveProjectSettings();
                }
            });

            this.value = { label: initialRatio, w: 1024, h: 1024 };
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
