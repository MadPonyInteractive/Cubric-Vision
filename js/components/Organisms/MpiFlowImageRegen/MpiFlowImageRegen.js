import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiFlowImageRegen — controls for the first Flow (image-in → image-out regen).
 *
 * CONTROLS ONLY (composition): MpiBaseFlow provides the frame, the source-image
 * upload slot, Run, and the result/progress line. This component renders only the
 * extra field this flow collects — a positive prompt — into BaseFlow's content slot,
 * and exposes `el.getInputs()` so BaseFlow can merge it with the uploaded image at
 * Run time. Seeds from `props.initialInputs` (a prior run's snapshot) so reopen
 * restores the text.
 *
 * The op (flowImageRegen / flow_sdxl_regen.json) injects `positive` into
 * Input_Positive; the image goes to Input_Image via the op's mediaInputs mapping.
 */
export const MpiFlowImageRegen = ComponentFactory.create({
    name: 'MpiFlowImageRegen',
    css: ['js/components/Organisms/MpiFlowImageRegen/MpiFlowImageRegen.css'],

    template: () => `
        <div class="mpi-flow-image-regen">
            <label class="mpi-flow-image-regen__label" for="flow-regen-prompt">Prompt</label>
            <textarea class="mpi-flow-image-regen__prompt" id="flow-regen-prompt"
                placeholder="Describe the image you want…" rows="3"></textarea>
        </div>`,

    setup: (el, props) => {
        const promptEl = qs('#flow-regen-prompt', el);
        promptEl.value = props.initialInputs?.positive || '';

        // No live wiring needed — BaseFlow reads getInputs() on Run.
        const _off = on(promptEl, 'input', () => {});

        el.getInputs = () => ({ positive: promptEl.value.trim() });

        el.destroy = () => { _off(); };
    },
});
