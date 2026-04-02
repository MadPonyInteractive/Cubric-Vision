import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { qs } from '../../../utils/dom.js';
import { COLOR_GRADES, COLOR_CONTRASTS, COLOR_SATS, COLOR_SHARPS } from '../../../utils/promptOptions.js';

/**
 * MpiStyleConfig — Color Grading & Style Settings Compound
 *
 * Renders dropdown controls for all Color Grading parameters.
 *
 * Props:
 * @param {Object} [value={}] - Initial field values keyed by field id.
 *   Keys: color_grade, color_contrast, color_sat, color_sharp
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */
export const MpiStyleConfig = ComponentFactory.create({
    name: 'MpiStyleConfig',
    css: ['js/components/Compounds/MpiStyleConfig/MpiStyleConfig.css'],

    template: () => {
        const fields = ['color_grade','color_contrast','color_sat','color_sharp'];
        const rows   = fields.map(id => `<div class="mpi-cfg__row" id="cfg-row-${id}"></div>`).join('');

        return `
            <div class="mpi-cfg mpi-style-config">
                <div class="mpi-cfg__section">
                    <span class="mpi-cfg__label">Color Grading</span>
                    ${rows}
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const values = { ...(props.value || {}) };

        /** @type {Record<string, {label:string, options:string[]}>} */
        const FIELDS = {
            color_grade:    { label: 'Grade',      options: COLOR_GRADES },
            color_contrast: { label: 'Contrast',   options: COLOR_CONTRASTS },
            color_sat:      { label: 'Saturation', options: COLOR_SATS },
            color_sharp:    { label: 'Sharpness',  options: COLOR_SHARPS }
        };

        Object.entries(FIELDS).forEach(([id, def]) => {
            const row = qs(`#cfg-row-${id}`, el);
            if (!row) return;

            row.innerHTML = `<span class="mpi-cfg__field-label">${def.label}</span>
                             <div class="mpi-cfg__field-input" id="cfg-input-${id}"></div>`;

            const dd = MpiDropdown.mount(qs(`#cfg-input-${id}`, row), {
                options:     def.options,
                value:       values[id] || '',
                placeholder: 'None',
                direction:   'down'
            });

            dd.on('change', ({ value }) => {
                values[id] = value === 'None' ? '' : value;
                emit('change', { values: { ...values } });
            });
        });
    }
});
