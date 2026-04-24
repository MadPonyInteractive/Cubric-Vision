/**
 * MpiToolOptionsUpscale — Organism: tool-options panel for Video Upscale.
 *
 * Self-contained: factor selector + model dropdown + run button.
 * Enters video viewer upscale mode in setup; exits in destroy.
 *
 * Props:
 * @param {object} viewer - MpiVideoViewer instance
 *
 * Emits:
 *   'apply' { factor: number, model: string } — user pressed Run
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOptionSelector } from '../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { qs } from '../../../utils/dom.js';

export const MpiToolOptionsUpscale = ComponentFactory.create({
    name: 'MpiToolOptionsUpscale',
    css: ['js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.css'],

    template: () => `
        <div class="mpi-tool-options-upscale">
            <div class="mpi-tool-options-upscale__row" id="factor-slot"></div>
            <div class="mpi-tool-options-upscale__row" id="model-slot"></div>
            <div class="mpi-tool-options-upscale__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        viewer.el.enterUpscaleMode?.();

        const factorSel = MpiOptionSelector.mount(document.createElement('div'), {
            variant: 'number',
            values: ['x1.5', 'x2', 'x3', 'x4'],
            value: 'x2',
            popupTitle: 'FACTOR',
            info: 'Upscale factor',
        });
        qs('#factor-slot', el).appendChild(factorSel.el);

        const modelSlot = qs('#model-slot', el);
        let modelDd = null;
        let modelValue = '';

        const _mountModelDd = () => {
            modelSlot.innerHTML = '';
            const opts = (state.upscaleModels || []).map(f => ({ label: f, value: f }));
            modelDd = MpiDropdown.mount(modelSlot, {
                options: opts,
                value: opts[0]?.value ?? '',
                direction: 'up',
                info: 'Upscale model',
            });
            modelValue = opts[0]?.value ?? '';
            modelDd.on('change', ({ value }) => { modelValue = value; });
        };

        if (state.upscaleModels?.length) _mountModelDd();
        else loadAssets().then(() => _mountModelDd());

        const runBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'upscaler', label: 'Upscale', size: 'sm', variant: 'primary',
            info: 'Run video upscale',
        });
        qs('#actions-slot', el).appendChild(runBtn.el);
        runBtn.on('click', () => {
            const factorStr = factorSel.el.getValue?.() ?? 'x2';
            const factor = parseFloat(factorStr.replace('x', '')) || 2;
            emit('apply', { factor, model: modelValue });
        });

        el.destroy = () => {
            viewer.el.exitUpscaleMode?.();
            factorSel.destroy?.();
            modelDd?.destroy?.();
            runBtn.destroy?.();
        };
    },
});
