import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopupButton } from '../../Compounds/MpiPopupButton/MpiPopupButton.js';
import { getModelRatios } from '../../../ratioUtils.js';

/**
 * MpiRatioSelector — Block-level Aspect Ratio Picker
 * 
 * Hierarchy Note: Classified as a Block because it imports a Compound (MpiIconButton).
 * Composes a trigger button + popup with ratio presets.
 * 
 * Props:
 * @param {string} [modelType='flux'] - Model presets to use
 * @param {'portrait'|'landscape'} [initialOrientation='portrait']
 * @param {string} [value] - Current selected ratio label (e.g. "1:1")
 */
export const MpiRatioSelector = ComponentFactory.create({
    name: 'MpiRatioSelector',
    css: [
        'js/components/Compounds/MpiPopupButton/MpiPopupButton.css',
        'js/components/Blocks/MpiRatioSelector/MpiRatioSelector.css'
    ],

    template: (props) => {
        const orientation = props.orientation || props.initialOrientation || 'portrait';
        const modelType = props.modelType || 'flux';
        const value = props.value || '1:1';
        const isActive = props.showPopup || false;

        const ratios = getModelRatios(modelType, orientation);

        // Find current ratio icon
        const currentRatio = ratios.find(r => r.label === value) || ratios[0];
        const triggerIcon = currentRatio.icon.replace('rect_', 'ratio_');

        // Orientation icon (swap)
        const orientIcon = orientation === 'portrait' ? 'ratio_16_9' : 'ratio_9_16';

        // Build ratio buttons group
        const ratioBtnsHtml = ratios.map(r => {
            const isSelected = r.label === value;
            const iconName = r.icon.replace('rect_', 'ratio_');

            return `<div class="mpi-ratio-sel__item" data-label="${r.label}">
                ${MpiButton.template({
                icon: iconName,
                label: r.label,
                labelPosition: 'top',
                size: 'md',
                active: isSelected,
                toggleable: true,
                stroke: true,
                info: `Switch to ${r.label} ratio`
            })}
            </div>`;
        }).join('');

        // The popup content
        const orientContainerStyle = modelType === 'video' ? 'display: none;' : '';
        const headerHtml = modelType === 'video' ? '' : `
            <div class="mpi-ratio-sel__header">
                ${MpiBadge.template({ label: 'RATIO', variant: 'secondary' })}
                <div class="mpi-ratio-sel__orient-btn" style="${orientContainerStyle}">
                    ${MpiButton.template({
                        icon: orientIcon,
                        size: 'sm',
                        info: `Switch to ${orientation === 'portrait' ? 'landscape' : 'portrait'} orientation`,
                        stroke: true
                    })}
                </div>
            </div>`;

        const popupInnerHtml = `
            ${headerHtml}
            <div class="mpi-ratio-sel__grid">
                ${ratioBtnsHtml}
            </div>
        `;

        // main trigger button
        const triggerBtnHtml = MpiButton.template({
            icon: triggerIcon,
            label: value,
            size: 'md',
            active: isActive,
            toggleable: true,
            stroke: true,
            info: 'Select aspect ratio'
        });

        return `<div class="mpi-ratio-sel">
            ${MpiPopupButton.template({
                triggerHtml: triggerBtnHtml,
                showPopup: isActive
            }, popupInnerHtml)}
        </div>`;
    },

    setup: (el, props, emit) => {
        const popupBtnEl = el.querySelector('.mpi-popup-btn');
        const trigger = el.querySelector('.mpi-popup-btn__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        const grid = el.querySelector('.mpi-ratio-sel__grid');
        const orientContainer = el.querySelector('.mpi-ratio-sel__orient-btn');

        // Delegate nested component setup
        if (popupBtnEl) MpiPopupButton.setup(popupBtnEl, props, emit);

        // Helper to regenerate the grid content manually (avoids factory update loop)
        const updateUI = () => {
            const orientation = props.orientation || props.initialOrientation || 'portrait';
            const modelType = props.modelType || 'flux';
            const value = props.value || '1:1';
            const ratios = getModelRatios(modelType, orientation);

            // 1. Update Grid Icons
            grid.innerHTML = ratios.map(r => {
                const isSelected = r.label === value;
                const iconName = r.icon.replace('rect_', 'ratio_');
                return `<div class="mpi-ratio-sel__item" data-label="${r.label}">
                    ${MpiButton.template({
                    icon: iconName, label: r.label, labelPosition: 'top',
                    active: isSelected, toggleable: true, stroke: true
                })}
                </div>`;
            }).join('');

            // 2. Update Orientation Trigger Icon
            const orientIcon = orientation === 'portrait' ? 'ratio_16_9' : 'ratio_9_16';
            if (modelType !== 'video') {
                if (orientContainer) {
                    orientContainer.style.display = 'block';
                    orientContainer.innerHTML = MpiButton.template({
                        icon: orientIcon, size: 'sm', stroke: true
                    });
                }
            } else {
                if (orientContainer) orientContainer.style.display = 'none';
            }

            // 3. Update Main Trigger Button
            const currentRatio = ratios.find(r => r.label === value) || ratios[0];
            const triggerIconName = currentRatio.icon.replace('rect_', 'ratio_');
            const isPopupOpen = popupBtnEl ? popupBtnEl.classList.contains('is-open') : !!props.showPopup;
            trigger.innerHTML = MpiButton.template({
                icon: triggerIconName, label: value, stroke: true, active: isPopupOpen, toggleable: true
            });
        };

        // Interaction, Toggle, and Bridging logic is fully managed by MpiPopupButton.

        // Orientation change handler
        el.addEventListener('click', (e) => {
            const orientBtn = e.target.closest('.mpi-ratio-sel__orient-btn');
            if (orientBtn) {
                const currentOrient = props.orientation || props.initialOrientation || 'portrait';
                props.orientation = currentOrient === 'portrait' ? 'landscape' : 'portrait';
                emit('orientation_change', { orientation: props.orientation });
                updateUI();
            }
        });

        // Ratio selection handler
        el.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-ratio-sel__item');
            if (item) {
                const label = item.dataset.label;
                props.value = label;

                const ratios = getModelRatios(props.modelType || 'flux', props.orientation || 'portrait');
                const ratio = ratios.find(r => r.label === label);

                emit('change', {
                    value: label,
                    w: ratio.w, h: ratio.h, ratio: ratio.ratio,
                    orientation: props.orientation || 'portrait'
                });

                props.showPopup = false;
                if (popupBtnEl) popupBtnEl.classList.remove('is-open');
                if (popupEl) popupEl.classList.remove('is-active');
                updateUI();
            }
        });
    }
});
