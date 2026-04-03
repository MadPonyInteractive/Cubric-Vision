import { ComponentFactory } from '../../factory.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiInstalledDisplay — Installed Item Info Compound
 *
 * Displays metadata and actions for an installed item (e.g., a downloaded model
 * or workflow). Mirrors the legacy model-manager card layout.
 *
 * Props:
 * @param {string} [title='']          - Title text displayed on the top-left
 * @param {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @param {string} [text='']           - Descriptive text body
 * @param {string} [icon='info']       - MpiIcon registry key for the info row icon
 * @param {string} [iconText='']       - Text shown alongside the icon in the info row
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='sm'] - Size of the info row icon
 * @param {'muted'|'accent'|'primary'|'danger'|'success'} [iconColor='danger']
 *   - Color modifier for the info row icon
 * @param {boolean} [showDeleteModels=false] - Whether to show the Delete Models toggle button
 * @param {boolean} [deleteModelsActive=false] - Initial toggle state for Delete Models
 * @param {string} [deleteLabel='Uninstall']    - Label for the primary action button
 *
 * Emits:
 * 'delete'        {}                        — Uninstall/Delete button clicked
 * 'deleteModels'  { active: boolean }       — Delete Models toggle changed
 */
export const MpiInstalledDisplay = ComponentFactory.create({
    name: 'MpiInstalledDisplay',
    css: ['js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css'],

    template: () => `
        <div class="mpi-installed-display">
            <div class="mpi-installed-display__header">
                <span class="mpi-installed-display__title" id="idtitle-slot"></span>
                <span class="mpi-installed-display__meta" id="idmeta-slot"></span>
            </div>
            <div class="mpi-installed-display__text" id="idtext-slot"></div>
            <div class="mpi-installed-display__info-row" id="idinfo-slot"></div>
            <div class="mpi-installed-display__badge-row" id="idbadge-slot"></div>
            <div class="mpi-installed-display__actions" id="idactions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // Title
        const titleSlot = qs('#idtitle-slot', el);
        if (props.title) titleSlot.textContent = props.title;

        // Meta (top-right)
        const metaSlot = qs('#idmeta-slot', el);
        if (props.meta) metaSlot.textContent = props.meta;

        // Text body
        const textSlot = qs('#idtext-slot', el);
        if (props.text) textSlot.textContent = props.text;

        // Icon + text row
        const infoSlot = qs('#idinfo-slot', el);
        if (props.icon || props.iconText) {
            const iconWrap = document.createElement('div');
            iconWrap.className = 'mpi-installed-display__info-inner';

            if (props.icon) {
                const iconInst = MpiIcon.mount(document.createElement('div'), {
                    name: props.icon,
                    size: props.iconSize || 'sm',
                    color: props.iconColor || 'danger'
                });
                iconWrap.appendChild(iconInst.el);
            }

            if (props.iconText) {
                const iconTextEl = document.createElement('span');
                iconTextEl.className = 'mpi-installed-display__icon-text';
                iconTextEl.textContent = props.iconText;
                iconWrap.appendChild(iconTextEl);
            }

            infoSlot.appendChild(iconWrap);
        } else {
            infoSlot.style.display = 'none';
        }

        // INSTALLED badge
        const badgeSlot = qs('#idbadge-slot', el);
        const badge = MpiBadge.mount(document.createElement('div'), {
            label: 'INSTALLED',
            variant: 'success'
        });
        badgeSlot.appendChild(badge.el);

        // Actions row
        const actionsSlot = qs('#idactions-slot', el);

        // Optional Delete Models toggle button (left side)
        if (props.showDeleteModels) {
            const delModels = MpiButton.mount(document.createElement('div'), {
                icon: 'trash',
                label: 'Delete Models',
                labelPosition: 'right',
                variant: 'outline',
                size: 'md',
                toggleable: true,
                active: props.deleteModelsActive || false
            });
            delModels.on('click', ({ active }) => {
                emit('deleteModels', { active: !!active });
            });
            actionsSlot.appendChild(delModels.el);
        }

        // Spacer pushes Uninstall to the right
        const spacer = document.createElement('div');
        spacer.className = 'mpi-installed-display__spacer';
        actionsSlot.appendChild(spacer);

        // Uninstall / Delete button (right side)
        const deleteBtn = MpiButton.mount(document.createElement('div'), {
            text: props.deleteLabel || 'Uninstall',
            variant: 'secondary',
            size: 'md'
        });
        deleteBtn.on('click', () => {
            emit('delete', {});
        });
        actionsSlot.appendChild(deleteBtn.el);
    }
});
