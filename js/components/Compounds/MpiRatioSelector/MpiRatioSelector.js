import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { getModelRatios } from '../../../utils/ratios.js';

/**
 * MpiRatioSelector — Block-level Aspect Ratio Picker
 * 
 * Composes a trigger button + popup with ratio presets.
 */
export const MpiRatioSelector = ComponentFactory.create({
    name: 'MpiRatioSelector',
    css: ['js/components/Compounds/MpiRatioSelector/MpiRatioSelector.css'],

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
        const isFlat = modelType === 'video' || modelType === 'social';
        const orientContainerStyle = isFlat ? 'display: none;' : '';
        const headerHtml = isFlat ? '' : `
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

        const popupHtml = MpiPopup.template({
            active: isActive,
            position: 'top'
        }, popupInnerHtml);

        return `<div class="mpi-ratio-sel">
            <div class="mpi-ratio-sel__trigger">
                ${triggerBtnHtml}
            </div>
            ${popupHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        const trigger = el.querySelector('.mpi-ratio-sel__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        // Capture DOM refs before portaling (they live inside popupEl)
        const grid = el.querySelector('.mpi-ratio-sel__grid');
        const orientContainer = el.querySelector('.mpi-ratio-sel__orient-btn');
        let leaveTimer = null;

        // ── Portal ──────────────────────────────────────────────────────────────
        // MpiPopup is template-rendered here (not independently mounted), so we
        // portal it manually. This escapes ancestor overflow/transform stacking
        // contexts that would otherwise clip or misposition the fixed popup.
        document.body.appendChild(popupEl);

        // Force-dismiss from global bus
        const unsub = Events.on('ui:close-all-popups', () => {
            if (props.showPopup) closePopup();
        });

        // Remove portal node when this component is removed from the DOM.
        const domObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
                domObserver.disconnect();
                unsub(); // Cleanup bus subscription
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // ── Positioning ─────────────────────────────────────────────────────────
        const positionPopup = () => {
            const rect = trigger.getBoundingClientRect();
            popupEl.style.bottom = `${window.innerHeight - rect.top + 12}px`;
            popupEl.style.left   = `${rect.left + rect.width / 2}px`;
            popupEl.style.top    = '';
        };

        // ── Close helper ────────────────────────────────────────────────────────
        const closePopup = () => {
            props.showPopup = false;
            popupEl.classList.remove('is-active');
            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.remove('is-active');
            emit('popup_toggle', { active: false });
        };

        // ── Hover (keep open while hovering trigger OR popup) ────────────────────
        // After portaling, the popup is outside el's DOM subtree, so el's
        // mouseenter/mouseleave won't fire when the mouse moves into the popup.
        // We cancel/restart the close timer on the popup element itself too.
        const cancelClose = () => { clearTimeout(leaveTimer); leaveTimer = null; };
        const scheduleClose = () => {
            leaveTimer = setTimeout(() => { if (props.showPopup) closePopup(); }, 300);
        };

        el.addEventListener('mouseenter', cancelClose);
        el.addEventListener('mouseleave', scheduleClose);
        popupEl.addEventListener('mouseenter', cancelClose);
        popupEl.addEventListener('mouseleave', scheduleClose);

        // ── Toggle popup ─────────────────────────────────────────────────────────
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            props.showPopup = !props.showPopup;
            if (props.showPopup) positionPopup();
            popupEl.classList.toggle('is-active', props.showPopup);

            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.toggle('is-active', props.showPopup);

            emit('popup_toggle', { active: props.showPopup });
        });

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
            const isFlat = modelType === 'video' || modelType === 'social';
            if (!isFlat) {
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
            trigger.innerHTML = MpiButton.template({
                icon: triggerIconName, label: value, stroke: true, active: props.showPopup, toggleable: true
            });
        };

        // ── Popup interaction (delegated to popupEl since it's portaled) ─────────
        // Orientation change handler
        popupEl.addEventListener('click', (e) => {
            const orientBtn = e.target.closest('.mpi-ratio-sel__orient-btn');
            if (orientBtn) {
                const currentOrient = props.orientation || props.initialOrientation || 'portrait';
                props.orientation = currentOrient === 'portrait' ? 'landscape' : 'portrait';
                emit('orientation_change', { orientation: props.orientation });
                updateUI();
            }
        });

        // Ratio selection handler
        popupEl.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-ratio-sel__item');
            if (item) {
                const label = item.dataset.label;
                props.value = label;

                const ratios = getModelRatios(props.modelType || 'flux', props.orientation || 'portrait');
                const ratio = ratios.find(r => r.label === label);

                // SOCIAL_RATIOS have only `ratio` (float); generation ratios have `w`/`h`.
                const ratioFloat = ratio.ratio ?? (ratio.w && ratio.h ? ratio.w / ratio.h : null);
                emit('change', {
                    value: label,
                    ratio: ratioFloat,
                    w: ratio.w ?? null,
                    h: ratio.h ?? null,
                    orientation: props.orientation || null,
                });

                props.showPopup = false;
                popupEl.classList.remove('is-active');
                updateUI();
            }
        });
    }
});
