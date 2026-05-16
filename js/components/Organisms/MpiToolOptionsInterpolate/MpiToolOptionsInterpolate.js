/**
 * MpiToolOptionsInterpolate — Organism: tool-options panel for Video Interpolate.
 *
 * Multiplier radio group + Run button. Persists to project.json
 * `toolSettings.videoInterpolate`.
 *
 * Props:
 * @param {object} viewer - MpiVideoViewer instance
 *
 * Emits:
 *   'apply' { multiplier: number } — user pressed Run
 */

import { ComponentFactory } from '../../factory.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { qs } from '../../../utils/dom.js';

const MULT_OPTIONS = [
    { label: 'x2', value: 'x2' },
    { label: 'x3', value: 'x3' },
    { label: 'x4', value: 'x4' },
];
const MULT_VALUES = new Set(MULT_OPTIONS.map(o => o.value));

const DEFAULTS = Object.freeze({ multiplier: 'x2' });

function coerceSettings(raw) {
    return {
        multiplier: MULT_VALUES.has(raw.multiplier) ? raw.multiplier : DEFAULTS.multiplier,
    };
}

export const MpiToolOptionsInterpolate = ComponentFactory.create({
    name: 'MpiToolOptionsInterpolate',
    css: ['js/components/Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.css'],

    template: () => `
        <div class="mpi-tool-options-interpolate">
            <div class="mpi-tool-options-interpolate__section">
                <div class="mpi-tool-options-interpolate__section-label">Frame Multiplier</div>
                <div class="mpi-tool-options-interpolate__row" id="mult-slot"></div>
            </div>
            <div class="mpi-tool-options-interpolate__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        viewer.el.enterInterpolateMode?.();

        const _initial = coerceSettings(
            getToolSettings(state.currentProject || {}, 'videoInterpolate', DEFAULTS)
        );
        let _multiplier = _initial.multiplier;

        const _persistTimers = new Map();
        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'videoInterpolate', key, value });
                _persistTimers.delete(key);
            }, 200));
        };

        const multRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: MULT_OPTIONS,
            value:   _multiplier,
            name:    'interpolate-multiplier',
            info:    'Frame multiplier',
        });
        qs('#mult-slot', el).appendChild(multRadio.el);
        multRadio.on('select', ({ value }) => {
            _multiplier = value;
            persist('multiplier', _multiplier);
        });

        const runBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'interpolate_stroke', label: 'Interpolate', size: 'sm', variant: 'primary',
            info: 'Run frame interpolation',
        });
        qs('#actions-slot', el).appendChild(runBtn.el);
        runBtn.on('click', () => {
            const multiplier = parseFloat(_multiplier.replace('x', '')) || 2;
            emit('apply', { multiplier });
        });

        el.destroy = () => {
            viewer.el.exitInterpolateMode?.();
            _persistTimers.forEach(t => clearTimeout(t));
            _persistTimers.clear();
            multRadio.destroy?.();
            runBtn.destroy?.();
        };
    },
});
