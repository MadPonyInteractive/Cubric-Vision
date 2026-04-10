/**
 * MpiModelSettings — Per-model/tool settings overlay (Compound)
 *
 * Shows LoRA slot pickers + upscale model selector when opened with a modelId.
 * Shows only upscale model selector when opened with a toolKey.
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
 *   'saved' {} — user confirmed changes (already persisted to disk)
 *   'close' {} — overlay dismissed without saving
 */

import { ComponentFactory }   from '../../factory.js';
import { MpiOverlay }         from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiDropdown }        from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiButton }          from '../../Primitives/MpiButton/MpiButton.js';
import { qs }                 from '../../../utils/dom.js';
import { Events }             from '../../../events.js';
import { state }              from '../../../state.js';
import {
    getModelSettings,
    setModelSettings,
    getToolSettings,
    setToolSettings,
} from '../../../data/projectModel.js';
import { saveProjectSettings } from '../../../managers/projectManager.js';
import { clientLogger }       from '../../../services/clientLogger.js';

const LORA_COUNT = 6;

function _loraOptions(availableLoras) {
    return [
        { label: '— None —', value: '' },
        ...(availableLoras || []).map(f => ({ label: f, value: f })),
    ];
}

function _upscaleOptions(upscaleModels) {
    return [
        { label: '— Default —', value: '' },
        ...(upscaleModels || []).map(f => ({ label: f, value: f })),
    ];
}

export const MpiModelSettings = ComponentFactory.create({
    name: 'MpiModelSettings',
    css: ['js/components/Compounds/MpiModelSettings/MpiModelSettings.css'],

    template: () => `
        <div class="mpi-model-settings">
            <div class="mpi-model-settings__upscale">
                <p class="mpi-model-settings__section-title">Upscale Model</p>
                <div class="mpi-model-settings__upscale-slot"></div>
            </div>
            <div class="mpi-model-settings__loras" data-section="loras">
                <p class="mpi-model-settings__section-title">LoRA Slots</p>
                <div class="mpi-model-settings__lora-list"></div>
            </div>
            <div class="mpi-model-settings__actions">
                <div class="mpi-model-settings__cancel-btn"></div>
                <div class="mpi-model-settings__save-btn"></div>
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

        /** Currently selected upscale value (tracked locally from 'change' events) */
        let _upscaleValue = '';

        /**
         * Per-slot tracking for LoRA selections.
         * @type {Array<{ name: string, strengthModel: number, strengthClip: number }>}
         */
        let _loraSlots = [];

        // ── Mount buttons ────────────────────────────────────────────────────
        const cancelBtnSlot = qs('.mpi-model-settings__cancel-btn', el);
        const saveBtnSlot   = qs('.mpi-model-settings__save-btn',   el);

        const cancelBtn = MpiButton.mount(cancelBtnSlot, { text: 'Cancel', variant: 'secondary' });
        const saveBtn   = MpiButton.mount(saveBtnSlot,   { text: 'Save',   variant: 'primary'   });

        cancelBtn.on('click', () => {
            overlay.el.hide();
            emit('close', {});
        });

        saveBtn.on('click', async () => {
            await _save();
        });

        // ── Upscale dropdown instance (replaced on each open) ─────────────────
        let _upscaleDropdown = null;

        function _mountUpscaleDropdown(currentValue) {
            const slot = qs('.mpi-model-settings__upscale-slot', el);
            slot.innerHTML = '';
            _upscaleValue = currentValue || '';

            _upscaleDropdown = MpiDropdown.mount(slot, {
                options: _upscaleOptions(state.upscaleModels),
                value:   _upscaleValue,
                placeholder: '— Default —',
            });

            _upscaleDropdown.on('change', ({ value }) => {
                _upscaleValue = value;
            });
        }

        // ── LoRA slots ────────────────────────────────────────────────────────

        /**
         * Build 6 LoRA slot rows into the lora-list container.
         * @param {Array<{ name: string|null, strengthModel: number, strengthClip: number }>} slots
         */
        function _mountLoraSlots(slots) {
            const list = qs('.mpi-model-settings__lora-list', el);
            list.innerHTML = '';

            // Reset internal tracking to match incoming slot data
            _loraSlots = slots.map(s => ({
                name:          s.name || null,
                strengthModel: s.strengthModel ?? 1.0,
                strengthClip:  s.strengthClip  ?? 1.0,
            }));

            const loraOpts = _loraOptions(state.availableLoras);

            _loraSlots.forEach((slot, i) => {
                const slotEl = document.createElement('div');
                slotEl.className = [
                    'mpi-model-settings__lora-slot',
                    !slot.name ? 'mpi-model-settings__lora-slot--empty' : '',
                ].filter(Boolean).join(' ');
                slotEl.dataset.slotIndex = String(i);

                // Dropdown host
                const dropHost = document.createElement('div');
                dropHost.className = 'mpi-model-settings__lora-dropdown';

                // Strength inputs wrapper
                const strengthsEl = document.createElement('div');
                strengthsEl.className = 'mpi-model-settings__lora-strengths';
                strengthsEl.innerHTML = `
                    <label>Model</label>
                    <input class="mpi-model-settings__strength-input"
                           type="number" step="0.05" min="0" max="2"
                           value="${slot.strengthModel ?? 1.0}"
                           data-strength="model" />
                    <label>Clip</label>
                    <input class="mpi-model-settings__strength-input"
                           type="number" step="0.05" min="0" max="2"
                           value="${slot.strengthClip ?? 1.0}"
                           data-strength="clip" />
                `;

                slotEl.appendChild(dropHost);
                slotEl.appendChild(strengthsEl);
                list.appendChild(slotEl);

                // Bind strength inputs
                strengthsEl.querySelectorAll('input').forEach(input => {
                    input.addEventListener('input', () => {
                        const v = parseFloat(input.value);
                        if (isNaN(v)) return;
                        if (input.dataset.strength === 'model') {
                            _loraSlots[i].strengthModel = v;
                        } else {
                            _loraSlots[i].strengthClip = v;
                        }
                    });
                });

                // Mount dropdown into dropHost
                const dd = MpiDropdown.mount(dropHost, {
                    options: loraOpts,
                    value:   slot.name || '',
                    placeholder: '— None —',
                });

                dd.on('change', ({ value }) => {
                    _loraSlots[i].name = value || null;
                    slotEl.classList.toggle('mpi-model-settings__lora-slot--empty', !value);
                });
            });
        }

        // ── Save handler ──────────────────────────────────────────────────────

        async function _save() {
            if (!state.currentProject || !_context) return;

            try {
                if (_context.modelId) {
                    const updatedProject = setModelSettings(
                        state.currentProject,
                        _context.modelId,
                        {
                            loras:        _loraSlots,
                            upscaleModel: _upscaleValue || null,
                        }
                    );
                    state.currentProject = updatedProject;
                } else if (_context.toolKey) {
                    const updatedProject = setToolSettings(
                        state.currentProject,
                        _context.toolKey,
                        { upscaleModel: _upscaleValue || null }
                    );
                    state.currentProject = updatedProject;
                }

                await saveProjectSettings();
                emit('saved', {});
                overlay.el.hide();
            } catch (err) {
                clientLogger.error('model-settings', 'Failed to save model settings', err);
            }
        }

        // ── Public open() method ──────────────────────────────────────────────

        /**
         * Populate settings from state and show the overlay.
         * @param {{ modelId?: string, toolKey?: string }} ctx
         */
        el.open = (ctx = {}) => {
            _context = ctx;

            const lorasSection = qs('[data-section="loras"]', el);

            if (ctx.modelId) {
                const settings = getModelSettings(state.currentProject, ctx.modelId);
                _mountUpscaleDropdown(settings.upscaleModel);
                _mountLoraSlots(settings.loras);
                lorasSection.style.display = '';
            } else if (ctx.toolKey) {
                const settings = getToolSettings(state.currentProject, ctx.toolKey);
                _mountUpscaleDropdown(settings.upscaleModel);
                lorasSection.style.display = 'none';
            } else {
                clientLogger.error('model-settings', 'MpiModelSettings.open() requires modelId or toolKey');
                return;
            }

            overlay.el.show();
        };

        // ── ui:close-all-popups ───────────────────────────────────────────────
        const _unsubCloseAll = Events.on('ui:close-all-popups', () => {
            overlay.el.hide();
            emit('close', {});
        });

        // ── Cleanup ───────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubCloseAll();
        };
    },
});
