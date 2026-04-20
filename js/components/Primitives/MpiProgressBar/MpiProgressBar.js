import { ComponentFactory } from '../../factory.js';

/**
 * MpiProgressBar — Interactive range input or static progress bar.
 * Absorbs all MpiSlider capabilities — this is the single source of truth for sliders.
 *
 * Props:
 * @param {number}  [min=0]          - Min value
 * @param {number}  [max=100]        - Max value
 * @param {number}  [step=1]         - Step increment
 * @param {number}  [value=50]       - Initial value
 * @param {string}  [info]           - Info Bar template, e.g. "Volume: {value}%"
 * @param {string}  [prefix='']      - Text prepended to value in Info Bar (if no info template)
 * @param {string}  [suffix='']      - Text appended to value in Info Bar (if no info template)
 * @param {boolean} [interactive=false] - false = static progress bar, true = draggable slider
 * @param {boolean} [wheel=false]    - Enable mouse wheel to adjust value (slider mode only)
 * @param {'primary'|'secondary'|'success'|'danger'} [variant='primary']
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

        // info template: explicit string wins, then prefix/suffix, then bare value
        const infoTpl = props.info || `${props.prefix || ''}{value}${props.suffix || ''}`;
        const info = infoTpl.replace('{value}', value);

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

        // Resolve info template once from props (supports prefix/suffix pattern too)
        const infoTpl = props.info || `${props.prefix || ''}{value}${props.suffix || ''}`;

        const updateVisuals = (val) => {
            const min = props.min !== undefined ? props.min : 0;
            const max = props.max !== undefined ? props.max : 100;
            const percent = ((val - min) / (max - min)) * 100;
            if (trackFill) trackFill.style.width = `${percent}%`;

            if (infoTpl.includes('{value}')) {
                el.dataset.info = infoTpl.replace('{value}', val);
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

        // Mouse wheel support (opt-in via wheel=true)
        if (props.wheel === true) {
            const handleWheel = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const step = props.step !== undefined ? props.step : 1;
                const min = props.min !== undefined ? props.min : 0;
                const max = props.max !== undefined ? props.max : 100;
                let val = parseFloat(input.value);

                val = e.deltaY < 0
                    ? Math.min(max, val + step)
                    : Math.max(min, val - step);

                input.value = val;
                input.dispatchEvent(new Event('input'));
                input.dispatchEvent(new Event('change'));
            };

            el.addEventListener('wheel', handleWheel, { passive: false });
            input.addEventListener('wheel', handleWheel, { passive: false });
        } else {
            el.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
            input.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
        }
    }
});

