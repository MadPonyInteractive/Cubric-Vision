/**
 * MpiToolOptionsRemoveBg — Organism: tool-options panel for Remove Background.
 *
 * BiRefNet background removal. Output background mode:
 *   - transparent (default) → RGBA PNG
 *   - color → subject composited over a solid color → flat PNG
 * The color picker is shown only in Color mode. Selection persists to
 * toolSettings.removeBackground per project (like Upscale persists factor/model).
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance (parity with siblings; unused)
 *
 * Emits:
 *   'apply' { bgMode: 'transparent'|'color', color: '#rrggbb' }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { qs } from '../../../utils/dom.js';

const BG_MODES = [
    { label: 'Transparent', value: 'transparent' },
    { label: 'Color',       value: 'color' },
];
const BG_MODE_VALUES = new Set(BG_MODES.map(o => o.value));

const DEFAULTS = Object.freeze({
    bgMode: 'transparent',
    // eslint-disable-next-line mpi/no-hardcoded-hex-color -- default pad/composite color
    color: '#000000',
});

function coerceSettings(raw) {
    return {
        bgMode: BG_MODE_VALUES.has(raw.bgMode) ? raw.bgMode : DEFAULTS.bgMode,
        color:  typeof raw.color === 'string' ? raw.color : DEFAULTS.color,
    };
}

export const MpiToolOptionsRemoveBg = ComponentFactory.create({
    name: 'MpiToolOptionsRemoveBg',
    css: ['js/components/Organisms/MpiToolOptionsRemoveBg/MpiToolOptionsRemoveBg.css'],

    template: () => `
        <div class="mpi-tool-options-remove-bg">
            <div class="mpi-tool-options-remove-bg__desc">
                Removes the background. Output a transparent PNG or fill it with a color.
            </div>
            <div class="mpi-tool-options-remove-bg__section">
                <div class="mpi-tool-options-remove-bg__section-label">Background</div>
                <div class="mpi-tool-options-remove-bg__row" id="mode-slot"></div>
            </div>
            <div class="mpi-tool-options-remove-bg__section" id="color-section" hidden>
                <div class="mpi-tool-options-remove-bg__section-label">Color</div>
                <div class="mpi-tool-options-remove-bg__row" id="color-slot"></div>
            </div>
            <div class="mpi-tool-options-remove-bg__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _initial = coerceSettings(
            getToolSettings(state.currentProject || {}, 'removeBackground', DEFAULTS)
        );
        let _bgMode = _initial.bgMode;
        let _color  = _initial.color;

        const _persistTimers = new Map();
        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'removeBackground', key, value });
                _persistTimers.delete(key);
            }, 200));
        };

        const colorSection = qs('#color-section', el);
        const _syncColorVisibility = () => { colorSection.hidden = _bgMode !== 'color'; };

        // ── Background mode radio ────────────────────────────────────────────
        const modeRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: BG_MODES, value: _bgMode, name: 'remove-bg-mode', info: 'Output background',
        });
        qs('#mode-slot', el).appendChild(modeRadio.el);
        modeRadio.on('select', ({ value }) => {
            _bgMode = value;
            persist('bgMode', _bgMode);
            _syncColorVisibility();
        });

        // ── Color picker (shown only in Color mode) ──────────────────────────
        const colorPicker = MpiColorPicker.mount(document.createElement('div'), {
            value: _color, info: 'Background color',
        });
        qs('#color-slot', el).appendChild(colorPicker.el);
        colorPicker.on('change', ({ hex }) => {
            _color = hex;
            persist('color', _color);
        });

        _syncColorVisibility();

        // ── Apply ────────────────────────────────────────────────────────────
        const applyBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'eraser', label: 'Remove Background', size: 'sm', variant: 'primary',
            info: 'Remove the background',
        });
        qs('#actions-slot', el).appendChild(applyBtn.el);
        applyBtn.on('click', () => emit('apply', { bgMode: _bgMode, color: _color }));

        el.destroy = () => {
            _persistTimers.forEach(t => clearTimeout(t));
            _persistTimers.clear();
            modeRadio.destroy?.();
            colorPicker.destroy?.();
            applyBtn.destroy?.();
        };
    },
});
