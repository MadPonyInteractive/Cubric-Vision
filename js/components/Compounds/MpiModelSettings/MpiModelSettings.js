/**
 * MpiModelSettings — Per-model/tool settings overlay (Compound)
 *
 * Shows LoRA slot pickers + upscale model selector when opened with a modelId.
 * Shows only upscale model selector when opened with a toolKey.
 * All changes auto-save on selection — no Save/Cancel buttons.
 * Escape key closes via the global OverlayManager handler.
 *
 * Usage (model context):
 *   const overlay = MpiModelSettings.mount(document.createElement('div'));
 *   overlay.el.open({ modelId: 'sdxl-realistic' });
 *
 * Usage (tool context):
 *   overlay.el.open({ toolKey: 'videoUpscale' });
 *
 * Props: none required at mount time.
 *
 * Instance methods (on instance.el):
 *   open({ modelId?, toolKey? }) — populate from state and show overlay
 *
 * Emits:
 *   'saved' {} — a change was auto-saved to disk
 *   'close' {} — overlay dismissed
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { renderIcon } from '../../../utils/icons.js';
import { qs } from '../../../utils/dom.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import {
    getModelSettings,
    setModelSettings,
    getToolSettings,
    setToolSettings,
} from '../../../data/projectModel.js';
import { getModelById } from '../../../data/modelRegistry.js';
import { DEPS } from '../../../data/modelConstants/dependencies.js';
import { saveProjectSettings } from '../../../managers/projectManager.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { clientLogger } from '../../../services/clientLogger.js';

const LORA_COUNT = 6;

function _loraOptions(availableLoras) {
    return [
        { label: '— None —', value: '' },
        ...(availableLoras || []).map(f => ({ label: f, value: f })),
    ];
}

/** Convert a dep ID to its filename, for matching against dropdown option values. */
function _depToFilename(depId) {
    const filename = DEPS[depId]?.filename;
    return filename ? filename.split('/').pop() : null;
}

/** Reverse-lookup: filename → dep ID. Returns dep ID or null. */
function _filenameToDep(filename) {
    if (!filename) return null;
    for (const [depId, dep] of Object.entries(DEPS)) {
        if (dep.filename?.split('/').pop() === filename) return depId;
    }
    return null;
}

function _upscaleOptions(upscaleModels) {
    return (upscaleModels || []).map(f => ({ label: f, value: f }));
}

export const MpiModelSettings = ComponentFactory.create({
    name: 'MpiModelSettings',
    css: ['js/components/Compounds/MpiModelSettings/MpiModelSettings.css'],

    template: () => `
        <div class="mpi-model-settings">
            <div class="mpi-model-settings__header">
                <div class="mpi-model-settings__icon">${renderIcon('settings', 'xl')}</div>
                <h2 class="mpi-model-settings__title">Model Settings</h2>
                <p class="mpi-model-settings__text">Setup your custom upscale model and loras here.</p>
            </div>
            <div class="mpi-model-settings__separator"></div>
            <div class="mpi-model-settings__upscale">
                <p class="mpi-model-settings__section-title">Upscale Model</p>
                <div class="mpi-model-settings__upscale-slot"></div>
            </div>
            <div class="mpi-model-settings__loras" data-section="loras">
                <p class="mpi-model-settings__section-title">LoRA Slots</p>
                <div class="mpi-model-settings__lora-list"></div>
            </div>
        </div>
    `,

    setup: (el, _props, emit) => {
        // ── MpiOverlay base ───────────────────────────────────────────────────
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => emit('close', {}));

        // ── Internal state ────────────────────────────────────────────────────
        /** @type {{ modelId?: string, toolKey?: string } | null} */
        let _context = null;

        /** Per-slot LoRA tracking (mutated by input events) */
        let _loraSlots = [];

        /** Currently selected upscale value (tracked from change event) */
        let _upscaleValue = '';

        // ── Auto-save helper ──────────────────────────────────────────────────

        async function _autoSave() {
            if (!state.currentProject || !_context) return;
            try {
                const depId = _filenameToDep(_upscaleValue) || null;
                if (_context.modelId) {
                    state.currentProject = setModelSettings(
                        state.currentProject,
                        _context.modelId,
                        { loras: _loraSlots, upscaleModel: depId }
                    );
                } else if (_context.toolKey) {
                    state.currentProject = setToolSettings(
                        state.currentProject,
                        _context.toolKey,
                        { upscaleModel: depId }
                    );
                }
                await saveProjectSettings();
                emit('saved', {});
            } catch (err) {
                clientLogger.error('model-settings', 'Failed to auto-save model settings', err);
                Events.emit('ui:error', { message: 'Failed to save settings. Please try again.' });
            }
        }

        // ── Upscale dropdown ──────────────────────────────────────────────────

        function _mountUpscaleDropdown(currentValue) {
            const slot = qs('.mpi-model-settings__upscale-slot', el);
            slot.innerHTML = '';
            _upscaleValue = currentValue || '';

            const dd = MpiDropdown.mount(slot, {
                options: _upscaleOptions(state.upscaleModels),
                value: _upscaleValue,
            });

            dd.on('change', ({ value }) => {
                _upscaleValue = value;
                _autoSave();
            });
        }

        // ── LoRA slots ────────────────────────────────────────────────────────

        function _mountLoraSlots(slots) {
            const list = qs('.mpi-model-settings__lora-list', el);
            list.innerHTML = '';

            // Normalise to exactly LORA_COUNT slots
            _loraSlots = Array.from({ length: LORA_COUNT }, (_, i) => {
                const s = slots[i] ?? {};
                return {
                    name: s.name || null,
                    strengthModel: s.strengthModel ?? 1.0,
                    strengthClip: s.strengthClip ?? 1.0,
                };
            });

            const loraOpts = _loraOptions(state.availableLoras);

            _loraSlots.forEach((slot, i) => {
                const slotEl = document.createElement('div');
                slotEl.className = [
                    'mpi-model-settings__lora-slot',
                    !slot.name ? 'mpi-model-settings__lora-slot--empty' : '',
                ].filter(Boolean).join(' ');

                const dropHost = document.createElement('div');
                dropHost.className = 'mpi-model-settings__lora-dropdown';

                const strengthsEl = document.createElement('div');
                strengthsEl.className = 'mpi-model-settings__lora-strengths';

                const modelLabel = document.createElement('label');
                modelLabel.className = 'mpi-model-settings__strength-label';
                modelLabel.textContent = 'Model';

                const modelInput = MpiInput.mount(document.createElement('div'), {
                    type: 'number',
                    size: 'sm',
                    value: slot.strengthModel,
                    min: -2,
                    max: 2,
                    step: 0.05,
                    decimals: 2,
                });

                const clipLabel = document.createElement('label');
                clipLabel.className = 'mpi-model-settings__strength-label';
                clipLabel.textContent = 'Clip';

                const clipInput = MpiInput.mount(document.createElement('div'), {
                    type: 'number',
                    size: 'sm',
                    value: slot.strengthClip,
                    min: -2,
                    max: 2,
                    step: 0.05,
                    decimals: 2,
                });

                modelInput.on('change', ({ value }) => {
                    _loraSlots[i].strengthModel = value;
                    _autoSave();
                });

                clipInput.on('change', ({ value }) => {
                    _loraSlots[i].strengthClip = value;
                    _autoSave();
                });

                strengthsEl.appendChild(modelLabel);
                strengthsEl.appendChild(modelInput.el);
                strengthsEl.appendChild(clipLabel);
                strengthsEl.appendChild(clipInput.el);

                slotEl.appendChild(dropHost);
                slotEl.appendChild(strengthsEl);
                list.appendChild(slotEl);

                const dd = MpiDropdown.mount(dropHost, {
                    options: loraOpts,
                    value: slot.name || '',
                    placeholder: `Slot ${i + 1} — None`,
                });

                dd.on('change', ({ value }) => {
                    _loraSlots[i].name = value || null;
                    slotEl.classList.toggle('mpi-model-settings__lora-slot--empty', !value);
                    _autoSave();
                });
            });
        }

        // ── Public open() method ──────────────────────────────────────────────

        el.open = async (ctx = {}) => {
            if (!state.currentProject) {
                clientLogger.error('model-settings', 'MpiModelSettings.open() called with no active project');
                return;
            }
            if (!ctx.modelId && !ctx.toolKey) {
                clientLogger.error('model-settings', 'MpiModelSettings.open() requires modelId or toolKey');
                return;
            }

            // Lazy-load asset lists if not yet populated (ComfyUI may not have fired comfy:ready)
            if (!state.upscaleModels?.length || !state.availableLoras?.length) {
                await loadAssets();
            }

            _context = ctx;

            const lorasSection = qs('[data-section="loras"]', el);

            if (ctx.modelId) {
                const settings = getModelSettings(state.currentProject, ctx.modelId);
                const model = getModelById(ctx.modelId);
                // Resolve saved dep ID → filename; fallback to model default → filename → SIAX
                const savedFile = _depToFilename(settings.upscaleModel);
                const modelDefaultFile = _depToFilename(model?.defaultUpscale);
                const siaxFile = _depToFilename('4x-NMKD-Siax');
                const defaultUpscale = savedFile || modelDefaultFile || siaxFile;
                _mountUpscaleDropdown(defaultUpscale);
                _mountLoraSlots(settings.loras);
                lorasSection.style.display = '';
            } else {
                const settings = getToolSettings(state.currentProject, ctx.toolKey);
                _mountUpscaleDropdown(_depToFilename(settings.upscaleModel) || _depToFilename('4x-NMKD-Siax'));
                lorasSection.style.display = 'none';
            }

            overlay.el.show();
        };

        // ── Cleanup ───────────────────────────────────────────────────────────
        el.destroy = () => { };
    },
});
