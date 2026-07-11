import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiAppImageRegen — controls for the first App (image-in → image-out regen).
 *
 * CONTROLS ONLY (composition): MpiBaseApp provides the frame, the source-image
 * upload slot, Run, and the result/progress line. This component renders only the
 * extra field this app collects — a positive prompt — into BaseApp's content slot,
 * and exposes `el.getInputs()` so BaseApp can merge it with the uploaded image at
 * Run time. Seeds from `props.initialInputs` (a prior run's snapshot) so reopen
 * restores the text.
 *
 * The op (appImageRegen / App_sdxl_regen.json) injects `positive` into
 * Input_Positive; the image goes to Input_Image via the op's mediaInputs mapping.
 */
export const MpiAppImageRegen = ComponentFactory.create({
    name: 'MpiAppImageRegen',
    css: ['js/components/Organisms/MpiAppImageRegen/MpiAppImageRegen.css'],

    template: () => `
        <div class="mpi-app-image-regen">
            <label class="mpi-app-image-regen__label" for="app-regen-prompt">Prompt</label>
            <textarea class="mpi-app-image-regen__prompt" id="app-regen-prompt"
                placeholder="Describe the image you want…" rows="3"></textarea>
        </div>`,

    setup: (el, props) => {
        const promptEl = qs('#app-regen-prompt', el);
        promptEl.value = props.initialInputs?.positive || '';

        // No live wiring needed — BaseApp reads getInputs() on Run.
        const _off = on(promptEl, 'input', () => {});

        el.getInputs = () => ({ positive: promptEl.value.trim() });

        el.destroy = () => { _off(); };
    },
});
