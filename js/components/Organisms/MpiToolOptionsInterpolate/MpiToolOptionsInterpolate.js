/**
 * MpiToolOptionsInterpolate — Organism: tool-options panel for Video Interpolate.
 *
 * Self-contained: multiplier selector + run button.
 * Enters video viewer interpolate mode in setup; exits in destroy.
 *
 * Props:
 * @param {object} viewer - MpiVideoViewer instance
 *
 * Emits:
 *   'apply' { multiplier: number } — user pressed Run
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOptionSelector } from '../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';

export const MpiToolOptionsInterpolate = ComponentFactory.create({
    name: 'MpiToolOptionsInterpolate',
    css: ['js/components/Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.css'],

    template: () => `
        <div class="mpi-tool-options-interpolate">
            <div class="mpi-tool-options-interpolate__row" id="mult-slot"></div>
            <div class="mpi-tool-options-interpolate__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        viewer.el.enterInterpolateMode?.();

        const multSel = MpiOptionSelector.mount(document.createElement('div'), {
            variant: 'number',
            values: ['x2', 'x3', 'x4'],
            value: 'x2',
            popupTitle: 'MULTIPLIER',
            info: 'Frame multiplier',
        });
        qs('#mult-slot', el).appendChild(multSel.el);

        const runBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'interpolate_stroke', label: 'Interpolate', size: 'sm', variant: 'primary',
            info: 'Run frame interpolation',
        });
        qs('#actions-slot', el).appendChild(runBtn.el);
        runBtn.on('click', () => {
            const multStr = multSel.el.getValue?.() ?? 'x2';
            const multiplier = parseFloat(multStr.replace('x', '')) || 2;
            emit('apply', { multiplier });
        });

        el.destroy = () => {
            viewer.el.exitInterpolateMode?.();
            multSel.destroy?.();
            runBtn.destroy?.();
        };
    },
});
