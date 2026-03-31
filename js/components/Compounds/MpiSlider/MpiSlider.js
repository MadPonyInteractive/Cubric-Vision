import { ComponentFactory } from '../../factory.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';

/**
 * MpiSlider — Smart Slider Compound
 * Enhances the MpiProgressBar primitive with mouse wheel support,
 * custom info bar formatting (prefix/suffix), and value mapping.
 *
 * Props:
 * @param {string}  [prefix='']     - Text shown before value in Info Bar
 * @param {string}  [suffix='']     - Text shown after value in Info Bar
 * @param {string}  [info]          - Template string (e.g. "Value: {value}%"), overrides prefix/suffix
 * @param {boolean} [wheel=true]    - Enable mouse wheel support
 * @param {number}  [min=0]         - Min value
 * @param {number}  [max=100]        - Max value
 * @param {number}  [step=1]        - Step increment
 * @param {number}  [value=50]       - Initial value
 * @param {string}  [variant='primary']
 */
export const MpiSlider = ComponentFactory.create({
    name: 'MpiSlider',
    css: ['js/components/Compounds/MpiSlider/MpiSlider.css'],

    template: (props) => {
        const val = props.value !== undefined ? props.value : 50;
        
        // Build the formatted info string
        let infoStr = props.info || `${props.prefix || ''}{value}${props.suffix || ''}`;
        
        // Delegate rendering to the ProgressBar primitive — Sliders are always interactive
        return MpiProgressBar.template({
            ...props,
            interactive: true,
            info: infoStr
        });
    },

    setup: (el, props, emit) => {
        // 🏗️ Step 1: Prepare inherited props (Goal 1)
        // Ensure the ProgressBar setup sees the Slider's specialized info string
        const infoStr = props.info || `${props.prefix || ''}{value}${props.suffix || ''}`;
        const barProps = { ...props, info: infoStr, interactive: true };
        
        MpiProgressBar.setup(el, barProps, emit);

        const input = el.querySelector('.mpi-progress__input');

        // 🔗 Step 2: Mouse Wheel Support (Goal 2)
        if (props.wheel !== false) {
            el.onwheel = (e) => {
                e.preventDefault(); // Stop page scroll
                const step = props.step || 1;
                const min = props.min !== undefined ? props.min : 0;
                const max = props.max !== undefined ? props.max : 100;
                let val = parseFloat(input.value);

                if (e.deltaY < 0) {
                    val = Math.min(max, val + step);
                } else {
                    val = Math.max(min, val - step);
                }

                input.value = val;
                
                // Manually trigger events so the Primitive's input listener 
                // picks it up and updates the visuals/info-bar data attribute.
                input.dispatchEvent(new Event('input'));
                input.dispatchEvent(new Event('change'));
            };
        }
    }
});
