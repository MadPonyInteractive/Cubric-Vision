import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { qs } from '../../../utils/dom.js';
import {
    CAM_TYPES, CAM_LENSES, CAM_FOCALS, CAM_APERTURES, CAM_SHUTTERS, CAM_ISOS,
    SHOT_ANGLES, SHOT_SIZES, SHOT_DEPTHS, SHOT_COMPS
} from '../../../utils/promptOptions.js';

/**
 * MpiCameraConfig — Camera & Shot Settings Compound
 *
 * Renders dropdown controls for all Camera and Shot parameters.
 *
 * Props:
 * @param {Object} [value={}] - Initial field values keyed by field id.
 *   Keys: cam_type, cam_lens, cam_focal, cam_aperture, cam_shutter, cam_iso,
 *         shot_angle, shot_size, shot_dof, shot_comp
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */
export const MpiCameraConfig = ComponentFactory.create({
    name: 'MpiCameraConfig',
    css: ['js/components/Compounds/MpiCameraConfig/MpiCameraConfig.css'],

    template: () => {
        const cameraFields = ['cam_type','cam_lens','cam_focal','cam_aperture','cam_shutter','cam_iso'];
        const shotFields   = ['shot_angle','shot_size','shot_dof','shot_comp'];
        const rows = (ids) => ids.map(id => `<div class="mpi-cfg__row" id="cfg-row-${id}"></div>`).join('');

        return `
            <div class="mpi-cfg mpi-camera-config">
                <div class="mpi-cfg__section">
                    <span class="mpi-cfg__label">Camera</span>
                    ${rows(cameraFields)}
                </div>
                <div class="mpi-cfg__section">
                    <span class="mpi-cfg__label">Shot</span>
                    ${rows(shotFields)}
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const values = { ...(props.value || {}) };

        /** @type {Record<string, {label:string, options:string[]}>} */
        const FIELDS = {
            cam_type:     { label: 'Type',          options: CAM_TYPES },
            cam_lens:     { label: 'Lens',           options: CAM_LENSES },
            cam_focal:    { label: 'Focal Length',   options: CAM_FOCALS },
            cam_aperture: { label: 'Aperture',       options: CAM_APERTURES },
            cam_shutter:  { label: 'Shutter Speed',  options: CAM_SHUTTERS },
            cam_iso:      { label: 'ISO',            options: CAM_ISOS },
            shot_angle:   { label: 'Angle',          options: SHOT_ANGLES },
            shot_size:    { label: 'Size',           options: SHOT_SIZES },
            shot_dof:     { label: 'Depth of Field', options: SHOT_DEPTHS },
            shot_comp:    { label: 'Composition',    options: SHOT_COMPS }
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
