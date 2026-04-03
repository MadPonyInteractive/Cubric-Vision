import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { qs, ce } from '../../../utils/dom.js';

/**
 * MpiToolbar — Preset Management Toolbar Compound
 *
 * A reusable bar combining a preset selector (MpiDropdown) with save/delete
 * action buttons (MpiButton). Covers Global Presets and Tool-specific Presets.
 *
 * Props:
 * @param {Array<string|{label:string,value:string}>} [presets=[]] - Saved preset list
 * @param {string} [value=''] - Currently selected preset value
 * @param {string} [placeholder='Select preset...'] - Dropdown placeholder text
 * @param {any|any[]} [comps] - Single or list of component instances for the right area
 * @param {string} [title] - Optional title badge on the left side
 * @param {Object} [model] - Optional model strength config { value: number }
 * @param {Object} [clip] - Optional clip strength config { value: number }
 * Emits:
 * 'select'  { value: string } — user selected a preset from the dropdown
 * 'save'    {}               — save button clicked
 * 'delete'  {}               — delete button clicked
 * 'modelChange' { value: number } — model strength input changed
 * 'clipChange' { value: number } — clip strength input changed
 */
export const MpiToolbar = ComponentFactory.create({
    name: 'MpiToolbar',
    css: ['js/components/Compounds/MpiToolbar/MpiToolbar.css'],

    template: () => `
        <div class="mpi-toolbar">
            <div class="mpi-toolbar__left mpi-toolbar__left--slot"></div>
            <div class="mpi-toolbar__dropdown mpi-toolbar__dropdown--slot"></div>
            <div class="mpi-toolbar__actions mpi-toolbar__actions--slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const mountArea = (container, content) => {
            if (!container || !content) return;
            const items = Array.isArray(content) ? content : [content];
            items.forEach(item => {
                if (item && item.el) container.appendChild(item.el);
                else if (typeof item === 'string') container.innerHTML += item;
            });
        };

        // Left Side Area (Title, Model, Clip strength)
        const leftSlot = qs('.mpi-toolbar__left--slot', el);

        // Optional Title Badge
        if (props.title) {
            const titleBadge = MpiBadge.mount(document.createElement('div'), {
                label: props.title,
                variant: 'info',
                size: 'md'
            });
            leftSlot.appendChild(titleBadge.el);
        }

        // Optional Model Strength (Badge + Input)
        if (props.model) {
            const modelContainer = ce('div', { class: 'mpi-toolbar__strength-group' });
            const modelBadge = MpiBadge.mount(document.createElement('div'), {
                label: 'Model',
                variant: 'secondary',
                size: 'xs'
            });
            const modelInput = MpiInput.mount(document.createElement('div'), {
                type: 'number',
                value: props.model.value || 1.00,
                placeholder: '1.00',
                min: 0.00,
                max: 1.00,
                step: 0.01,
                decimals: 2,
                size: 'sm'
            });
            modelInput.on('change', ({ value }) => {
                props.model.value = value;
                emit('modelChange', { value });
            });
            modelContainer.appendChild(modelBadge.el);
            modelContainer.appendChild(modelInput.el);
            leftSlot.appendChild(modelContainer);
        }

        // Optional Clip Strength (Badge + Input)
        if (props.clip) {
            const clipContainer = ce('div', { class: 'mpi-toolbar__strength-group' });
            const clipBadge = MpiBadge.mount(document.createElement('div'), {
                label: 'Clip',
                variant: 'secondary',
                size: 'xs'
            });
            const clipInput = MpiInput.mount(document.createElement('div'), {
                type: 'number',
                value: props.clip.value || 1.00,
                placeholder: '1.00',
                min: 0.00,
                max: 1.00,
                step: 0.01,
                decimals: 2,
                size: 'sm'
            });
            clipInput.on('change', ({ value }) => {
                props.clip.value = value;
                emit('clipChange', { value });
            });
            clipContainer.appendChild(clipBadge.el);
            clipContainer.appendChild(clipInput.el);
            leftSlot.appendChild(clipContainer);
        }

        // Center Dropdown
        const dropdown = MpiDropdown.mount(qs('.mpi-toolbar__dropdown--slot', el), {
            options: props.presets || [],
            value: props.value || '',
            placeholder: props.placeholder || 'Select preset...',
            direction: 'down'
        });

        dropdown.on('change', ({ value }) => {
            props.value = value;
            emit('select', { value });
        });

        // Right Side Area (Prop-based components)
        const actionsSlot = qs('.mpi-toolbar__actions--slot', el);

        if (props.comps) {
            mountArea(actionsSlot, props.comps);
        } else {
            // Default preset management buttons - mount to temp containers to use appendChild pattern
            const saveBtn = MpiButton.mount(document.createElement('div'), {
                icon: 'save',
                info: 'Save current settings as a preset',
                size: 'sm',
                variant: 'ghost'
            });
            saveBtn.on('click', () => emit('save', {}));

            const delBtn = MpiButton.mount(document.createElement('div'), {
                icon: 'trash',
                info: 'Delete selected preset',
                size: 'sm',
                variant: 'ghost'
            });
            delBtn.on('click', () => emit('delete', {}));

            mountArea(actionsSlot, [saveBtn, delBtn]);
        }
    }
});
