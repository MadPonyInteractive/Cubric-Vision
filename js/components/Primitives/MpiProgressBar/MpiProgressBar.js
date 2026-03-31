import { ComponentFactory } from '../../factory.js';

/**
 * MpiProgressBar — Interactive range input or static progress bar display.
 * Base primitive for sliders and progress status.
 * 
 * Props:
 * @param {number} [min=0] - Min value
 * @param {number} [max=100] - Max value
 * @param {number} [step=1] - Step increment
 * @param {number} [value=50] - Initial value
 * @param {string} [info] - Tooltip/Info Bar text
 * @param {boolean} [interactive=false] - If false, input is disabled (static progress bar)
 * @param {'primary'|'secondary'|'success'|'danger'} [variant='primary'] - Color variant
 */
export const MpiProgressBar = ComponentFactory.create({
    name: 'MpiProgressBar',
    css: ['js/components/Primitives/MpiProgressBar/MpiProgressBar.css'],

    template: (props) => {
        const min = props.min !== undefined ? props.min : 0;
        const max = props.max !== undefined ? props.max : 100;
        const step = props.step !== undefined ? props.step : 1;
        const value = props.value !== undefined ? props.value : 50;
        const variant = props.variant || 'primary';
        const info = (props.info || '').replace('{value}', value);
        
        const isInteractive = props.interactive === true;
        const isDisabledAttr = isInteractive ? '' : 'disabled';
        const stateClass = isInteractive ? 'mpi-progress--interactive' : 'mpi-progress--disabled';

        return `<div class="mpi-progress mpi-progress--${variant} ${stateClass}" data-info="${info}">
            <div class="mpi-progress__track-container">
                <input 
                    type="range" 
                    class="mpi-progress__input" 
                    min="${min}" 
                    max="${max}" 
                    step="${step}" 
                    value="${value}"
                    ${isDisabledAttr}
                >
                <div class="mpi-progress__track-fill" style="width: ${((value - min) / (max - min)) * 100}%"></div>
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        const input = el.querySelector('.mpi-progress__input');
        const trackFill = el.querySelector('.mpi-progress__track-fill');

        const updateVisuals = (val) => {
            const min = props.min !== undefined ? props.min : 0;
            const max = props.max !== undefined ? props.max : 100;
            const percent = ((val - min) / (max - min)) * 100;
            if (trackFill) trackFill.style.width = `${percent}%`;

            if (props.info && props.info.includes('{value}')) {
                el.dataset.info = props.info.replace('{value}', val);
            }
        };

        input.oninput = (e) => {
            const val = parseFloat(e.target.value);
            updateVisuals(val);
            emit('input', { value: val });
        };

        input.onchange = (e) => {
            emit('change', { value: parseFloat(e.target.value) });
        };
    }
});
