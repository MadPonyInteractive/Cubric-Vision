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

import { MpiOptionSelector, clampQualityTier, defaultQualityTier } from '../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiStylePicker } from '../../Primitives/MpiStylePicker/MpiStylePicker.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qsa } from '../../../utils/dom.js';
import { state } from '../../../state.js';
import { getOpSettings, getSharedSettings, getModelSettings } from '../../../data/projectModel.js';
import { getCommandDefault } from '../../../data/commandRegistry.js';
import { PROMPT_CONTROL_DEFAULTS } from '../../../data/promptControlDefaults.js';
import { Events } from '../../../events.js';
import { getModelRatios, usesQualityTier } from '../../../utils/ratios.js';

// ── Scope helpers ─────────────────────────────────────────────────────────────
//
// Controls declare `scope: 'shared' | 'perOp' | 'perModel'`.
//   'shared'   → project.shared[mediaType] (cross-model, partitioned by image|video)
//   'perOp'    → project.modelSettings[modelId].operations[opName]
//   'perModel' → project.modelSettings[modelId] (model-wide, NOT op-scoped)
// `opName` is provided by MpiPromptBox via mount opts. If a perOp control mounts
// without an opName (legacy/demo), it falls back to the shared bucket.

function _mediaTypeOf(opts) {
    return opts.model?.mediaType === 'video' ? 'video' : 'image';
}

function _readSaved(ctrl, opts) {
    if (!state.currentProject) return {};
    if (ctrl.scope === 'perOp' && opts.opName && opts.model?.id) {
        return getOpSettings(state.currentProject, opts.model.id, opts.opName);
    }
    if (ctrl.scope === 'perModel' && opts.model?.id) {
        return getModelSettings(state.currentProject, opts.model.id);
    }
    return getSharedSettings(state.currentProject, _mediaTypeOf(opts));
}

function _resolveDefault(ctrl, controlId, opts) {
    // A per-op default is about where the STARTING value comes from; `scope` is about
    // where an edited value is STORED. They are independent, so an op may override the
    // default of a perModel/shared control too — qwenEdit starts `stylization` at 0.8
    // (Qwen's style LoRAs overpower the edit at 1.0) while Krea2's ops keep the global
    // 1.0, with both still storing per model.
    if (opts.opName) {
        const opDefault = getCommandDefault(opts.opName, controlId);
        if (opDefault !== undefined) return opDefault;
    }
    return ctrl.defaultValue;
}

function _emitUpdate(ctrl, opts, key, value) {
    if (ctrl.scope === 'perOp' && opts.opName) {
        const modelId = opts.model?.id;
        if (!modelId) return;
        Events.emit('settings:model:update', {
            modelId,
            opName: opts.opName,
            key,
            value,
        });
        return;
    }
    if (ctrl.scope === 'perModel') {
        const modelId = opts.model?.id;
        if (!modelId) return;
        // Model-wide write — reuse the existing opName-less model:update path
        // (same one loras/upscaleModel use). The key must be in _MODEL_WIDE_KEYS
        // in projectService so it routes to modelSettings[modelId][key].
        Events.emit('settings:model:update', { modelId, opName: null, key, value });
        return;
    }
    Events.emit('settings:shared:update', {
        mediaType: _mediaTypeOf(opts),
        key,
        value,
    });
}

/** @type {Record<string, ControlDef>} */
export const PROMPT_BOX_CONTROLS = {

    /**
     * qualityTier — Standalone quality picker for models whose ratio set is
     * partitioned by quality (usesQualityTier(modelType) — wan, ltx, krea2).
     * Renders as an inline radio row. Persists qualityTier under ratioSelector
     * (same key as `ratio` control) so they share a single source of truth.
     * Emits `ratio:quality-change` so the sibling ratio control can re-render
     * its ratio set without going through the popup.
     *
     * Renders nothing when the model uses orientation-mode ratios.
     */
    qualityTier: {
        nodeTitle: null,
        // perModel (MPI-133): the tier lives at modelSettings[modelId].qualityTier
        // so each model remembers its own quality independently — switching
        // LTX↔Wan (or reusing across models) never silently downgrades quality.
        // The sibling `ratio` control keeps selectedRatio/orientation in the
        // SHARED bucket (framing is cross-model), so this control reads ratio
        // from shared but tier from the model bucket.
        scope: 'perModel',
        defaultValue: PROMPT_CONTROL_DEFAULTS.qualityTier,
        mount(el, opts = {}) {
            const model = opts.model || {};
            const modelType = model.type ?? 'flux';
            const modelId = model.id;

            // Only render for tier-keyed models ('quality' AND 'quality-orientation').
            // Leave the host empty for orientation-only models.
            if (!usesQualityTier(modelType)) {
                this._instance = null;
                this.value = null;
                return;
            }

            // Tier from the per-model bucket; lazy-fallback to the legacy shared
            // ratioSelector.qualityTier for projects not yet migrated to SCHEMA 4.
            const modelBucket = state.currentProject
                ? getModelSettings(state.currentProject, modelId) : {};
            const sharedBucket = getSharedSettings(state.currentProject || {}, _mediaTypeOf(opts));
            const savedTier = modelBucket.qualityTier
                ?? sharedBucket.ratioSelector?.qualityTier;
            // A SAVED tier is real intent: clamp it to a tier this model has. A
            // cross-model carry (LTX 2k/4k → Wan) clamps to 'very_high' (Wan's max),
            // NOT 'medium' — so a reused 2K clip doesn't silently drop to mid.
            // With NOTHING saved there is no intent to preserve, so open on the
            // model's cheapest tier rather than clamping the shared 'medium'
            // placeholder up to Krea2's 2k. If the resolve changed the value, persist it.
            const initialTier = savedTier != null
                ? clampQualityTier(modelType, savedTier)
                : defaultQualityTier(modelType);
            const initialRatio = sharedBucket.ratioSelector?.selectedRatio || '1:1';
            // Orientation reaches the tier radio so its per-tier resolution hints read
            // the right table: a 'quality-orientation' model's 2K 16:9 is 1936×1088
            // landscape, 1088×1936 portrait. Ignored by pure-quality models.
            const initialOrientation = sharedBucket.ratioSelector?.orientation
                || PROMPT_CONTROL_DEFAULTS.orientation;
            this.value = initialTier;

            this._instance = MpiOptionSelector.mount(el, {
                variant: 'quality',
                qualityTier: initialTier,
                modelType,
                selectedRatio: initialRatio,
                orientation: initialOrientation,
            });

            if (initialTier !== modelBucket.qualityTier) {
                // Persist the resolved tier into the model bucket (covers both the
                // clamp case and the first-time migration-fallback read).
                _emitUpdate(this, opts, 'qualityTier', initialTier);
                Events.emit('ratio:quality-change', { modelId, qualityTier: initialTier });
            }

            this._instance.on('change', ({ qualityTier }) => {
                this.value = qualityTier;
                _emitUpdate(this, opts, 'qualityTier', qualityTier);
                // Notify sibling ratio control to re-render its ratio set.
                Events.emit('ratio:quality-change', { modelId, qualityTier });
            });

            // Refresh per-tier resolution info when sibling ratio control
            // changes the active ratio label.
            this._ratioUnsub = Events.on('ratio:selection-change', ({ modelId: mid, selectedRatio }) => {
                if (mid !== modelId) return;
                this._instance?.el?.setSelectedRatio?.(selectedRatio);
            });

            // ...and when it flips orientation, which swaps the hint dimensions for a
            // 'quality-orientation' model (2K 16:9 → 1936×1088 vs 1088×1936).
            this._orientUnsub = Events.on('ratio:orientation-change', ({ modelId: mid, orientation }) => {
                if (mid !== modelId) return;
                this._instance?.el?.setOrientation?.(orientation);
            });
        },
        getValue() { return this.value; },
        getInjectionParams() { return {}; },
        destroy() {
            this._ratioUnsub?.();
            this._ratioUnsub = null;
            this._orientUnsub?.();
            this._orientUnsub = null;
            this._instance?.destroy?.();
            this._instance = null;
        },
    },

    /**
     * ratio — Aspect ratio picker for image generation (t2i, i2i, upscale, video, etc.).
     * Mounts MpiRatioSelector and injects Width/Height into the workflow.
     * modelType sourced from model.type → determines ratio set and UI mode from ratios.js.
     * Persists selected ratio/orientation/qualityTier to project.json via modelSettings.
     */
    ratio: {
        nodeTitle: null, // not a single node; Width+Height injected separately
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.ratio,
        mount(el, opts = {}) {
            const model = opts.model || {};
            const modelType = model.type ?? 'flux';
            const modelId = model.id;

            // Read persisted settings from project. selectedRatio/orientation are
            // SHARED (cross-model framing); qualityTier is PER-MODEL (MPI-133) —
            // read it from the model bucket, lazy-falling back to the legacy
            // shared value for projects not yet migrated to SCHEMA 4, then clamp
            // to a tier this model supports.
            const saved = _readSaved(this, opts);
            const savedRatioSettings = saved.ratioSelector || {};
            const initialOrientation = savedRatioSettings.orientation || PROMPT_CONTROL_DEFAULTS.orientation;
            const initialValue = savedRatioSettings.selectedRatio || this.defaultValue;
            const modelBucket = state.currentProject
                ? getModelSettings(state.currentProject, modelId) : {};
            // Same resolve as the qualityTier radio: clamp a SAVED tier, but fall back
            // to the model's cheapest tier when nothing is saved. Both controls must
            // agree on a fresh project, or the ratio popup would size for 2k while the
            // radio reads 1k.
            const _savedTier = modelBucket.qualityTier ?? savedRatioSettings.qualityTier;
            const initialQualityTier = _savedTier != null
                ? clampQualityTier(modelType, _savedTier)
                : defaultQualityTier(modelType);

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
                _emitUpdate(this, opts, 'ratioSelector', { selectedRatio: value, orientation });
                // Notify sibling quality control so its per-tier resolution
                // info reflects the newly selected ratio label.
                Events.emit('ratio:selection-change', { modelId, selectedRatio: value });
            });

            // Orientation change: queue save via projectService, and notify the
            // sibling quality control — a 'quality-orientation' model's per-tier
            // hints swap dimensions with orientation.
            this._instance.on('orientation_change', ({ orientation }) => {
                _emitUpdate(this, opts, 'ratioSelector', { orientation });
                Events.emit('ratio:orientation-change', { modelId, orientation });
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

            // Initialize cache with resolved dimensions (not hardcoded 1024×1024).
            // Pass BOTH axes — getModelRatios ignores whichever its mode does not use.
            const initRatios = getModelRatios(modelType, initialOrientation, initialQualityTier);
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
                if (live.w && live.h) return { Width: live.w, Height: live.h, Ratio_Label: live.label || live.value || this.value?.label || '' };
            }
            const v = this.value ?? { w: 1024, h: 1024 };
            return { Width: v.w, Height: v.h, Ratio_Label: v.label || '' };
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
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.previewStage,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
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
                _emitUpdate(this, opts, 'previewStage', !!active);
            });
        },
        getValue() {
            return this.value === true;
        },
        getInjectionParams() {
            return {};
        },
    },

    /**
     * audioMode — LTX audio routing (Reference | Original). Only meaningful when
     * an audio file is present; the radio is disabled otherwise (baked workflow
     * defaults win with no injection). `setAudioPresent(bool)` is called by
     * MpiPromptBox from _emitMediaChange when el.audioCount crosses 0.
     *   Reference → Input_Use_Reference_Audio (voice-ID from the clip)
     *   Original  → Input_Use_Input_Audio (direct audio)
     * Either mode forces Input_Use_Transition true (the i2v motion/lipsync enabler
     * — see [[project-ltx-transition-lora-enables-lipsync]]). No seed UI, no
     * influence slider ([[feedback-no-seed-ui]]).
     */
    audioMode: {
        nodeTitle: null,
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.audioMode,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const initial = (saved.audioMode === 'original' || saved.audioMode === 'reference')
                ? saved.audioMode : this.defaultValue;
            this.value = initial;
            this._audioPresent = false;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Audio';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const radioHost = document.createElement('div');
            hostEl.appendChild(radioHost);

            this._instance = MpiRadioGroup.mount(radioHost, {
                options: [
                    { label: 'Reference', value: 'reference', icon: 'audio',
                      info: 'Reference voice — clone the speaker from the audio clip' },
                    { label: 'Original', value: 'original', icon: 'volumeHigh',
                      info: 'Original audio — use the input audio directly' },
                ],
                value: initial,
                name: 'audioMode',
                size: 'sm',
                columns: 2,
            });

            this._instance.on('select', ({ value }) => {
                if (value !== 'reference' && value !== 'original') return;
                this.value = value;
                _emitUpdate(this, opts, 'audioMode', value);
            });

            // Disabled until an audio chip is present.
            this._applyEnabled(this._audioPresent);
        },
        /** Enable/disable the radio + dim the host based on audio presence. */
        _applyEnabled(present) {
            const root = this._instance?.el;
            if (!root) return;
            qsa('.mpi-radio-group__btn', root).forEach((btn) => {
                btn.disabled = !present;
            });
            root.style.opacity = present ? '' : '0.4';
            root.style.pointerEvents = present ? '' : 'none';
        },
        /** Called by MpiPromptBox when audio media presence changes. */
        setAudioPresent(present) {
            this._audioPresent = !!present;
            this._applyEnabled(this._audioPresent);
        },
        getValue() { return this.value ?? this.defaultValue; },
        getInjectionParams() {
            // No audio → inject nothing; the workflow's baked gates apply.
            if (!this._audioPresent) return {};
            const mode = this.value ?? this.defaultValue;
            return {
                Input_Use_Reference_Audio: mode === 'reference',
                Input_Use_Input_Audio: mode === 'original',
                Input_Use_Transition: true,
            };
        },
        destroy() {
            this._instance?.destroy?.();
            this._instance = null;
        },
    },

    /**
     * useAudio — LTX "generate audio" toggle (Input_Use_Audio MpiSimpleBoolean).
     * ON → the model generates its own audio track from the prompt. Sits directly
     * under the audioMode radio. DISABLED while an audio chip is present — then the
     * audioMode radio (Reference/Original) drives audio from the clip, so this
     * gate is moot. `setAudioPresent(bool)` is called by MpiPromptBox alongside
     * audioMode's, from _emitMediaChange when el.audioCount crosses 0.
     */
    useAudio: {
        nodeTitle: 'Input_Use_Audio',
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.useAudio,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const initialActive = saved.useAudio !== false; // default ON
            this.value = initialActive;
            this._audioPresent = false;

            this._instance = MpiButton.mount(hostEl, {
                icon: 'audio',
                label: 'Generate Audio',
                labelPosition: 'right',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: initialActive,
                info: 'Generate audio — the model produces its own audio track from the prompt',
            });
            // Full-width: span the settings row like the slider controls do. The
            // ctrlEl host is display:contents, so the modifier rides the button root.
            this._instance.el?.classList.add('mpi-prompt-box__op-btn--full');

            this._instance.on('click', ({ active }) => {
                this.value = !!active;
                _emitUpdate(this, opts, 'useAudio', !!active);
            });

            // Disabled while an audio clip is present (radio drives audio then).
            this._applyEnabled(this._audioPresent);
        },
        /** Disable + dim the toggle WHEN an audio chip is present (inverse of audioMode). */
        _applyEnabled(present) {
            const root = this._instance?.el;
            if (!root) return;
            root.style.opacity = present ? '0.4' : '';
            root.style.pointerEvents = present ? 'none' : '';
        },
        /** Called by MpiPromptBox when audio media presence changes. */
        setAudioPresent(present) {
            this._audioPresent = !!present;
            this._applyEnabled(this._audioPresent);
        },
        getValue() { return this.value === true; },
        getInjectionParams() {
            // An audio clip present → the audioMode radio owns the audio gates;
            // don't fight it. Inject only when no clip is attached.
            if (this._audioPresent) return {};
            return { Input_Use_Audio: this.value === true };
        },
        destroy() {
            this._instance?.destroy?.();
            this._instance = null;
        },
    },

    batch: {
        nodeTitle: 'Input_Batch_Size',
        scope: 'shared',
        defaultValue: String(PROMPT_CONTROL_DEFAULTS.batch),
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
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
                _emitUpdate(this, opts, 'batch', parseInt(value, 10));
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const live = this._instance?.el?.getValue?.();
            const v = parseInt(live ?? this.value ?? this.defaultValue, 10) || 1;
            // Workflow node titled "Input_Batch_Size" (MpiInt, inputs.int).
            return { Input_Batch_Size: v };
        },
    },

    /**
     * duration — Video length (int, 1..30, step 1).
     * Mounts MpiProgressBar slider and injects into node titled "Duration"
     * (MpiInt, inputs.value / inputs.int). Persists per-model under
     * modelSettings[modelId].duration.
     */
    duration: {
        nodeTitle: 'Input_Duration',
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.duration,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
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
                _emitUpdate(this, opts, 'duration', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(30, Math.max(1, Math.round(Number(this.value ?? this.defaultValue) || this.defaultValue)));
            return { Input_Duration: v };
        },
    },

    /**
     * motionIntensity — Motion strength (float, 0..1, step 0.01).
     * Mounts MpiProgressBar slider and injects into node titled
     * "Motion_Intensity" (MpiFloat, inputs.float). Persists per-model under
     * modelSettings[modelId].motionIntensity.
     */
    motionIntensity: {
        nodeTitle: 'Input_Motion_Intensity',
        scope: 'shared',
        defaultValue: PROMPT_CONTROL_DEFAULTS.motionIntensity,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
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
                _emitUpdate(this, opts, 'motionIntensity', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(1, Math.max(0, Number(this.value ?? this.defaultValue) || 0));
            return { Input_Motion_Intensity: v };
        },
    },

    /**
     * useGrid — Grid upscaling toggle for model-tied `upscale` op.
     * Injects boolean into node titled "Auto_Grid". Persists per-model under
     * modelSettings[modelId].useGrid.
     */
    useGrid: {
        nodeTitle: 'Input_Auto_Grid',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.useGrid,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const initialActive = saved.useGrid === true;
            this.value = initialActive;

            this._instance = MpiButton.mount(hostEl, {
                icon: 'grid',
                label: 'Use Grid',
                labelPosition: 'right',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: initialActive,
                info: 'Use grid — tile-based upscaling for higher detail',
            });

            this._instance.on('click', ({ active }) => {
                this.value = !!active;
                _emitUpdate(this, opts, 'useGrid', !!active);
            });
        },
        getValue() {
            return this.value === true;
        },
        getInjectionParams() {
            return { Input_Auto_Grid: this.value === true };
        },
    },

    /**
     * upscaleFactor — Discrete factor picker (1.5, 2, 3, 4) for model-tied `upscale` op.
     * Injects float into node titled "Upscale_Factor". Persists per-model under
     * modelSettings[modelId].upscaleFactor.
     */
    upscaleFactor: {
        nodeTitle: 'Input_Upscale_Factor',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.upscaleFactor,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'upscaleFactor', opts);
            const savedNum = Number(saved.upscaleFactor ?? fallback);
            const allowed = [1.5, 2, 3, 4];
            const initial = allowed.includes(savedNum) ? savedNum : fallback;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Upscale';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const radioHost = document.createElement('div');
            hostEl.appendChild(radioHost);

            this._instance = MpiRadioGroup.mount(radioHost, {
                options: [
                    { label: '1.5x', value: '1.5' },
                    { label: '2x',   value: '2' },
                    { label: '3x',   value: '3' },
                    { label: '4x',   value: '4' },
                ],
                value: String(initial),
                name: 'upscaleFactor',
                size: 'sm',
                columns: 4,
                info: 'Upscale factor multiplier',
            });

            this._instance.on('select', ({ value }) => {
                const v = Number(value);
                if (!allowed.includes(v)) return;
                this.value = v;
                _emitUpdate(this, opts, 'upscaleFactor', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Number(this.value ?? this.defaultValue) || this.defaultValue;
            return { Input_Upscale_Factor: v };
        },
    },

    /**
     * denoise — Denoise strength slider (float, 0..1, step 0.01) for per-op use.
     * Currently driven by `upscale` (default 0.20) and `detail` (default 0.30).
     * Injects float into node titled "Denoise". Persists per-op under
     * modelSettings[modelId].operations[opName].denoise.
     */
    denoise: {
        nodeTitle: 'Input_Denoise',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.denoise, // fallback only; per-op override via commandRegistry.commands[op].defaults
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'denoise', opts);
            const savedNum = Number(saved.denoise ?? fallback);
            const initial = Number.isFinite(savedNum) ? Math.min(1, Math.max(0, savedNum)) : fallback;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const _fmt = (v) => Number(v).toFixed(2);

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Denoise';
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
                info: 'Denoise strength (0 = preserve, 1 = full re-render)',
            });

            const _renderLabel = (v) => { valEl.textContent = _fmt(v); };

            this._instance.on('input', ({ value }) => {
                _renderLabel(Math.min(1, Math.max(0, Number(value) || 0)));
            });

            this._instance.on('change', ({ value }) => {
                const v = Math.min(1, Math.max(0, Number(value) || 0));
                this.value = v;
                _renderLabel(v);
                _emitUpdate(this, opts, 'denoise', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(1, Math.max(0, Number(this.value ?? this.defaultValue) || 0));
            return { Denoise: v };
        },
    },

    /**
     * pidVariant — NVIDIA PiD path/VAE selector (used by the `pid` op only).
     * Injects a 1-indexed int into the "Input_Type" MpiAnySwitch node:
     * 1=flux, 2=sd3, 3=qwen, 4=sdxl. Each path is a distinct look (see
     * docs/models/pid/upscaler.md): sdxl=sharp/punchy, flux=faithful
     * color, sd3=sharp, qwen=natural all-rounder. Persists per-op.
     */
    pidVariant: {
        nodeTitle: 'Input_Type',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.pidVariant,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'pidVariant', opts);
            const savedNum = Number(saved.pidVariant ?? fallback);
            const allowed = [1, 2, 3, 4];
            const initial = allowed.includes(savedNum) ? savedNum : fallback;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Model';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const radioHost = document.createElement('div');
            hostEl.appendChild(radioHost);

            this._instance = MpiRadioGroup.mount(radioHost, {
                options: [
                    { label: 'Flux', value: '1' },
                    { label: 'SD3',  value: '2' },
                    { label: 'Qwen', value: '3' },
                    { label: 'SDXL', value: '4' },
                ],
                value: String(initial),
                name: 'pidVariant',
                size: 'sm',
                columns: 4,
                info: 'Upscaler model — Flux (faithful color), SD3 (sharp), Qwen (natural), SDXL (sharp/punchy)',
            });

            this._instance.on('select', ({ value }) => {
                const v = Number(value);
                if (!allowed.includes(v)) return;
                this.value = v;
                _emitUpdate(this, opts, 'pidVariant', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Number(this.value ?? this.defaultValue) || this.defaultValue;
            return { Input_Type: v };
        },
    },

    /**
     * pidResolution — NVIDIA PiD output-size selector (used by the `pid` op only).
     * Injects a 1-indexed int into the "Input_Resolution" MpiAnySwitch node:
     * 1=1K, 2=2K, 3=4K. PiD always renders native 4x (4K); 1K/2K downscale that
     * result (4K = passthrough, best quality). Persists per-op.
     */
    pidResolution: {
        nodeTitle: 'Input_Resolution',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.pidResolution,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'pidResolution', opts);
            const savedNum = Number(saved.pidResolution ?? fallback);
            const allowed = [1, 2, 3];
            const initial = allowed.includes(savedNum) ? savedNum : fallback;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Output';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const radioHost = document.createElement('div');
            hostEl.appendChild(radioHost);

            this._instance = MpiRadioGroup.mount(radioHost, {
                options: [
                    { label: '1K', value: '1' },
                    { label: '2K', value: '2' },
                    { label: '4K', value: '3' },
                ],
                value: String(initial),
                name: 'pidResolution',
                size: 'sm',
                columns: 3,
                info: 'Output resolution — 4K is native PiD quality; 1K/2K downscale it',
            });

            this._instance.on('select', ({ value }) => {
                const v = Number(value);
                if (!allowed.includes(v)) return;
                this.value = v;
                _emitUpdate(this, opts, 'pidResolution', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Number(this.value ?? this.defaultValue) || this.defaultValue;
            return { Input_Resolution: v };
        },
    },

    /**
     * qwenTier — Qwen-Image-Edit speed/quality tier (MPI-300). Injects a 1-indexed
     * int into the "Input_Tier" MpiInt, which drives the graph's MpiAnySwitch model
     * path + step-count switch: 1=Quality (raw ~20-step, no accelerator LoRA),
     * 2=Turbo (8-step Lightning LoRA), 3=Hyper (4-step Lightning LoRA). One int8
     * transformer for all three — only the accelerator LoRA changes. Persists per-op.
     */
    qwenTier: {
        nodeTitle: 'Input_Tier',
        scope: 'perOp',
        defaultValue: PROMPT_CONTROL_DEFAULTS.qwenTier,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'qwenTier', opts);
            const savedNum = Number(saved.qwenTier ?? fallback);
            const allowed = [1, 2, 3];
            const initial = allowed.includes(savedNum) ? savedNum : fallback;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Tier';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const radioHost = document.createElement('div');
            hostEl.appendChild(radioHost);

            this._instance = MpiRadioGroup.mount(radioHost, {
                options: [
                    { label: 'Quality', value: '1' },
                    { label: 'Turbo',   value: '2' },
                    { label: 'Hyper',   value: '3' },
                ],
                value: String(initial),
                name: 'qwenTier',
                size: 'sm',
                columns: 3,
                info: 'Speed vs quality — Quality (raw, best, slowest), Turbo (8-step), Hyper (4-step, fastest)',
            });

            this._instance.on('select', ({ value }) => {
                const v = Number(value);
                if (!allowed.includes(v)) return;
                this.value = v;
                _emitUpdate(this, opts, 'qwenTier', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Number(this.value ?? this.defaultValue) || this.defaultValue;
            return { Input_Tier: v };
        },
    },

    /**
     * krea2Turbo — Krea2 speed toggle (MPI-316). ONE button, two tiers, injected as
     * the 1-indexed `Input_Tier` int: OFF => 1 (High/raw, cfg 2.5), ON => 2 (Balanced).
     * On tier 2 the graph's `Accelerator Lora` MpiMath gate (`0.0 if a == 1 else 1.0`)
     * raises the turbo-distill LoRA to strength 1, reconstructing the old Turbo
     * transformer from the Raw weights — which is why the two Turbo weights could be
     * dropped and 4 Krea2 cards collapse to 2.
     *
     * A toggle, not a radio, because there are exactly two tiers (Qwen has three).
     *
     * scope `perModel`, NOT `perOp` — turbo is a MODE the user works in, so it must
     * hold when they move t2i -> detail -> upscale. Per-op storage would silently
     * reset it on every op switch.
     *
     * SIDE EFFECT — the negative prompt. Tier 2 runs at cfg 1, where classifier-free
     * guidance is inactive and the negative conditioning is computed then discarded.
     * Today that gating is STRUCTURAL (a separate Turbo card declared
     * `negativePrompt: false`); collapsing the cards would have turned it into an
     * invisible no-op the user can type into. So this control emits
     * `prompt:krea2-turbo` and MpiPromptBox hides the negative toggle live while it
     * is ON. The typed negative text is KEPT in memory, not cleared — flipping back
     * restores it.
     */
    krea2Turbo: {
        nodeTitle: 'Input_Tier',
        scope: 'perModel',
        defaultValue: PROMPT_CONTROL_DEFAULTS.krea2Turbo,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'krea2Turbo', opts);
            const initial = typeof saved.krea2Turbo === 'boolean' ? saved.krea2Turbo : !!fallback;
            this.value = initial;

            // Bare icon button, no label row — it sits in the button strip next to
            // the enhancer, so it mounts like enhancePrompt does.
            this._instance = MpiButton.mount(hostEl, {
                icon: 'bolt',
                info: 'Turbo — faster generation, different results and less precision',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: initial,
            });

            // Tell the box up front, so a restored ON state hides the negative toggle
            // on mount rather than only after the first click.
            Events.emit('prompt:krea2-turbo', { active: initial });

            this._instance.on('click', ({ active }) => {
                this.value = !!active;
                _emitUpdate(this, opts, 'krea2Turbo', !!active);
                Events.emit('prompt:krea2-turbo', { active: !!active });
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            // Boolean -> the graph's 1-indexed tier int. 1 = High/raw, 2 = Balanced.
            return { Input_Tier: (this.value ?? this.defaultValue) ? 2 : 1 };
        },
    },

    /**
     * styleSelect — style-LoRA picker (Krea2 pattern, MPI-242; playbook §9).
     *
     * Injects the INDEX (`Input_Style`, MpiInt), never a filename or a trigger
     * phrase. In the graph, nine MpiMath gates evaluate `b if a == N else 0.0`, so
     * this one int both selects a LoRA and zeroes the other eight — and the SAME int
     * drives MpiPromptList.specific_item to pluck the matching trigger. Two lists
     * that cannot drift, because there is only one knob.
     *
     * Labels come from the ModelDef (`styleLoraLabels`), so a future model with a
     * style rack brings its own set. Index 0 is always the "no style" entry. The
     * card images come from `styleLoraImages` (index-aligned; index 0 = None, no
     * image) under comfy_workflows/display/ — a missing entry renders a placeholder.
     *
     * Rendered as an MpiStylePicker: a trigger button showing the selected style's
     * name, opening a horizontally-scrolling grid of image cards. It replaced the
     * old inline dropdown (MPI-301) but keeps the SAME value contract — it emits the
     * selected INDEX, which is injected as `Input_Style`.
     *
     * Changing the style re-renders the Stylization slider's enabled state — at
     * index 0 the strength is inert (every gate is zeroed), so a live slider there
     * would be dead UI.
     */
    styleSelect: {
        nodeTitle: 'Input_Style',
        scope: 'perModel',
        defaultValue: PROMPT_CONTROL_DEFAULTS.styleSelect,
        mount(hostEl, opts = {}) {
            const labels = opts.model?.styleLoraLabels || ['None'];
            // ponytail: no ModelDef ships styleLoraImages yet — cards render the
            // placeholder gradient. Add an index-aligned string[] (files under
            // comfy_workflows/display/, index 0 = None ignored) to a ModelDef when
            // the style art exists; no code change needed here.
            const images = opts.model?.styleLoraImages || [];
            const saved  = _readSaved(this, opts);
            const savedNum = Number(saved.styleSelect ?? this.defaultValue);
            const initial = Number.isInteger(savedNum) && savedNum >= 0 && savedNum < labels.length
                ? savedNum
                : this.defaultValue;
            this.value = initial;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Style';
            lblRow.appendChild(nameEl);
            hostEl.appendChild(lblRow);

            const pickerHost = document.createElement('div');
            hostEl.appendChild(pickerHost);

            this._instance = MpiStylePicker.mount(pickerHost, {
                styles: labels.map((label, i) => ({ label, image: images[i] || null })),
                value: initial,
                info: 'Style — applies a built-in style LoRA and its trigger phrase',
            });

            this._instance.on('change', ({ index }) => {
                const v = Number.isInteger(index) ? index : 0;
                this.value = v;
                // The Stylization slider is a sibling control; it listens for this.
                Events.emit('promptbox:style-change', { index: v });
                _emitUpdate(this, opts, 'styleSelect', v);
            });
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = parseInt(this.value ?? this.defaultValue, 10) || 0;
            return { Input_Style: v };
        },
        destroy() {
            this._instance?.destroy?.();
            this._instance = null;
        },
    },

    /**
     * stylization — strength of the selected style LoRA (`Input_Stylization`,
     * MpiFloat). Feeds the `b` operand of every MpiMath gate; only the selected
     * slot reads it. Disabled at styleSelect 0, where all gates are zeroed.
     *
     * MpiProgressBar bakes `interactive` at mount and exposes no runtime setter, so
     * the disabled state is driven by the same class the primitive uses plus a guard
     * in the change handler. Remounting instead would drop the drag in progress.
     */
    stylization: {
        nodeTitle: 'Input_Stylization',
        scope: 'perModel',
        defaultValue: PROMPT_CONTROL_DEFAULTS.stylization,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const fallback = _resolveDefault(this, 'stylization', opts);
            const savedNum = Number(saved.stylization ?? fallback);
            const initial = Number.isFinite(savedNum) ? Math.min(1, Math.max(0, savedNum)) : fallback;
            this.value = initial;

            const styleIdx = Number(saved.styleSelect ?? PROMPT_CONTROL_DEFAULTS.styleSelect) || 0;

            hostEl.className = 'mpi-prompt-box__slider-control';
            hostEl.style.display = 'flex';

            const _fmt = (v) => Number(v).toFixed(2);

            const lblRow = document.createElement('div');
            lblRow.className = 'mpi-prompt-box__slider-lbl';
            const nameEl = document.createElement('span');
            nameEl.className = 'mpi-prompt-box__slider-name';
            nameEl.textContent = 'Stylization';
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
                info: 'Stylization — how strongly the selected style is applied',
            });

            this._enabled = styleIdx !== 0;
            const _applyEnabled = (on) => {
                this._enabled = on;
                hostEl.classList.toggle('is-disabled', !on);
                hostEl.style.opacity = on ? '' : '0.45';
                hostEl.style.pointerEvents = on ? '' : 'none';
            };
            _applyEnabled(this._enabled);

            const _renderLabel = (v) => { valEl.textContent = _fmt(v); };

            this._instance.on('input', ({ value }) => {
                if (!this._enabled) return;
                _renderLabel(Math.min(1, Math.max(0, Number(value) || 0)));
            });

            this._instance.on('change', ({ value }) => {
                if (!this._enabled) return;
                const v = Math.min(1, Math.max(0, Number(value) || 0));
                this.value = v;
                _renderLabel(v);
                _emitUpdate(this, opts, 'stylization', v);
            });

            this._unsubStyle = Events.on('promptbox:style-change', ({ index }) => {
                _applyEnabled(index !== 0);
            });
        },
        destroy() {
            this._unsubStyle?.();
            this._unsubStyle = null;
        },
        getValue() {
            return this.value ?? this.defaultValue;
        },
        getInjectionParams() {
            const v = Math.min(1, Math.max(0, Number(this.value ?? this.defaultValue) || 0));
            return { Input_Stylization: v };
        },
    },

    /**
     * enhancePrompt — in-workflow prompt expansion (`Input_Enhance_Prompt`, MpiIfElse).
     *
     * ON routes the prompt through a `TextGenerate` node, which runs the LM head of
     * the text encoder the workflow ALREADY loaded (Qwen3-VL for Krea2) — no second
     * model, no extra VRAM. It costs an autoregressive pass before sampling, which is
     * why it is opt-in, why the info string names the cost, and why commandExecutor
     * adds a progress bar for it (see stagesFor's `extraBars`).
     *
     * The prompt box is deliberately NOT rewritten — the user keeps seeing their own
     * words. What the encoder saw is captured from the graph's `Output_prompt` node
     * and is what gets saved + reused. See docs/playbooks/add-model/05-prompt-and-styles.md §10.
     */
    enhancePrompt: {
        nodeTitle: 'Input_Enhance_Prompt',
        scope: 'perModel',
        defaultValue: PROMPT_CONTROL_DEFAULTS.enhancePrompt,
        mount(hostEl, opts = {}) {
            const saved = _readSaved(this, opts);
            const initialActive = saved.enhancePrompt === true;
            this.value = initialActive;

            this._instance = MpiButton.mount(hostEl, {
                icon: 'enhance',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: initialActive,
                info: 'Enhance prompt — expands your prompt before rendering (does not play well with Pose Reference)',
            });

            this._instance.on('click', ({ active }) => {
                this.value = !!active;
                _emitUpdate(this, opts, 'enhancePrompt', !!active);
            });
        },
        getValue() {
            return this.value === true;
        },
        getInjectionParams() {
            return { Input_Enhance_Prompt: this.value === true };
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
