import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';

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
 * Emits:
 * 'select'  { value: string } — user selected a preset from the dropdown
 * 'save'    {}               — save button clicked
 * 'delete'  {}               — delete button clicked
 */
export const MpiToolbar = ComponentFactory.create({
    name: 'MpiToolbar',
    css: ['js/components/Compounds/MpiToolbar/MpiToolbar.css'],

    template: () => `
        <div class="mpi-toolbar">
            <div class="mpi-toolbar__dropdown mpi-toolbar__dropdown--slot"></div>
            <div class="mpi-toolbar__actions mpi-toolbar__actions--slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
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
        const mountArea = (container, content) => {
            if (!container || !content) return;
            const items = Array.isArray(content) ? content : [content];
            items.forEach(item => {
                if (item && item.el) container.appendChild(item.el);
                else if (typeof item === 'string') container.innerHTML += item;
            });
        };

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
