/**
 * MpiToolOptionsUpscale — Organism: tool-options panel for Image / Video Upscale.
 *
 * Model dropdown on top (with "None" entry that runs the workflow without an
 * upscale model via the `Upscale_Using_Model` boolean), Upscale Factor radio
 * group below, Run button. Selections persist to
 * `toolSettings.{imageUpscale|videoUpscale}` per kind.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer or MpiVideoViewer instance
 * @param {'image'|'video'} [kind='video'] - Determines persistence key + workflow op
 *
 * Emits:
 *   'apply' { factor: number, model: string } — user pressed Run.
 *     `model === ''` means "no upscale model" (None).
 */

import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { qs } from '../../../utils/dom.js';

const FACTOR_OPTIONS = [
    { label: 'x1.5', value: 'x1.5' },
    { label: 'x2',   value: 'x2'   },
    { label: 'x3',   value: 'x3'   },
    { label: 'x4',   value: 'x4'   },
];
const FACTOR_VALUES = new Set(FACTOR_OPTIONS.map(o => o.value));

const NONE_OPTION = { label: 'None', value: '' };

const DEFAULTS = Object.freeze({
    factor: 'x2',
    model:  '',
});

function coerceSettings(raw) {
    return {
        factor: FACTOR_VALUES.has(raw.factor) ? raw.factor : DEFAULTS.factor,
        model:  typeof raw.model === 'string' ? raw.model : DEFAULTS.model,
    };
}

export const MpiToolOptionsUpscale = ComponentFactory.create({
    name: 'MpiToolOptionsUpscale',
    css: ['js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.css'],

    template: () => `
        <div class="mpi-tool-options-upscale">
            <div class="mpi-tool-options-upscale__section">
                <div class="mpi-tool-options-upscale__section-label">Upscale Model</div>
                <div class="mpi-tool-options-upscale__row" id="model-slot"></div>
            </div>
            <div class="mpi-tool-options-upscale__section">
                <div class="mpi-tool-options-upscale__section-label">Upscale Factor</div>
                <div class="mpi-tool-options-upscale__row" id="factor-slot"></div>
            </div>
            <div class="mpi-tool-options-upscale__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        const kind = props.kind === 'image' ? 'image' : 'video';
        const toolKey = kind === 'image' ? 'imageUpscale' : 'videoUpscale';

        if (kind === 'video') viewer.el.enterUpscaleMode?.();

        const _initial = coerceSettings(
            getToolSettings(state.currentProject || {}, toolKey, DEFAULTS)
        );
        let _factor = _initial.factor;
        let _model  = _initial.model;

        const _persistTimers = new Map();
        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey, key, value });
                _persistTimers.delete(key);
            }, 200));
        };

        // ── Model dropdown ──────────────────────────────────────────────────
        const modelSlot = qs('#model-slot', el);
        let modelDd = null;

        const _mountModelDd = () => {
            modelSlot.innerHTML = '';
            const modelOpts = (state.upscaleModels || []).map(f => ({ label: f, value: f }));
            const opts = [NONE_OPTION, ...modelOpts];
            // Default: persisted value if still valid, else first real model, else None.
            let initial;
            if (_model === '' || modelOpts.some(o => o.value === _model)) {
                initial = _model;
            } else {
                initial = modelOpts[0]?.value ?? '';
            }
            modelDd = MpiDropdown.mount(modelSlot, {
                options: opts,
                value: initial,
                direction: 'down',
                info: 'Upscale model (None = no model)',
            });
            if (initial !== _model) {
                _model = initial;
                persist('model', _model);
            }
            modelDd.on('change', ({ value }) => {
                _model = value;
                persist('model', _model);
            });
        };

        if (state.upscaleModels?.length) _mountModelDd();
        else loadAssets().then(() => _mountModelDd());

        // ── Factor radio group ──────────────────────────────────────────────
        const factorRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: FACTOR_OPTIONS,
            value:   _factor,
            name:    `upscale-factor-${kind}`,
            info:    'Upscale factor',
        });
        qs('#factor-slot', el).appendChild(factorRadio.el);
        factorRadio.on('select', ({ value }) => {
            _factor = value;
            persist('factor', _factor);
        });

        // ── Run ─────────────────────────────────────────────────────────────
        const runBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'upscaler', label: 'Upscale', size: 'sm', variant: 'primary',
            info: kind === 'image' ? 'Run image upscale' : 'Run video upscale',
        });
        qs('#actions-slot', el).appendChild(runBtn.el);
        runBtn.on('click', () => {
            const factor = parseFloat(_factor.replace('x', '')) || 2;
            emit('apply', { factor, model: _model });
        });

        el.destroy = () => {
            if (kind === 'video') viewer.el.exitUpscaleMode?.();
            _persistTimers.forEach(t => clearTimeout(t));
            _persistTimers.clear();
            factorRadio.destroy?.();
            modelDd?.destroy?.();
            runBtn.destroy?.();
        };
    },
});
