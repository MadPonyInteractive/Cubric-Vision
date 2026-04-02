import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { qs } from '../../../utils/dom.js';
import { LIGHT_TYPES, LIGHT_COLORS, LIGHT_INTENSITIES, LIGHT_DIRS } from '../../../utils/promptOptions.js';

/**
 * MpiLightingConfig — Lighting Settings Compound
 *
 * Renders dropdown controls for all Lighting parameters.
 *
 * Props:
 * @param {Object} [value={}] - Initial field values keyed by field id.
 *   Keys: light_type, light_color, light_intensity, light_dir
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */
export const MpiLightingConfig = ComponentFactory.create({
    name: 'MpiLightingConfig',
    css: ['js/components/Compounds/MpiLightingConfig/MpiLightingConfig.css'],

    template: () => {
        const fields = ['light_type','light_color','light_intensity','light_dir'];
        const rows   = fields.map(id => `<div class="mpi-cfg__row" id="cfg-row-${id}"></div>`).join('');

        return `
            <div class="mpi-cfg mpi-lighting-config">
                <div class="mpi-cfg__section">
                    <span class="mpi-cfg__label">Lighting</span>
                    ${rows}
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const values = { ...(props.value || {}) };

        /** @type {Record<string, {label:string, options:string[]}>} */
        const FIELDS = {
            light_type:      { label: 'Type',      options: LIGHT_TYPES },
            light_color:     { label: 'Color',     options: LIGHT_COLORS },
            light_intensity: { label: 'Intensity', options: LIGHT_INTENSITIES },
            light_dir:       { label: 'Direction', options: LIGHT_DIRS }
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
