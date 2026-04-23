import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { getModelRatios, RATIO_MODES } from '../../../utils/ratios.js';

/**
 * Resolves current { value, w, h, orientation, qualityTier } from live props.
 * Used by getValue() and by callers who need injection-ready dimensions.
 * @param {Object} props
 * @returns {{ value: string, w: number, h: number, orientation: string|null, qualityTier: string }}
 */
function resolveCurrentDimensions(props) {
    const modelType   = props.modelType || 'flux';
    const orientation = props.orientation || props.initialOrientation || 'portrait';
    const qualityTier = props.qualityTier || 'medium';
    const value       = props.value || '1:1';
    const mode        = RATIO_MODES[modelType] ?? 'orientation';
    const ratios      = getModelRatios(
        modelType,
        mode === 'orientation' ? orientation : undefined,
        mode === 'quality' ? qualityTier : undefined
    );
    const match = ratios.find(r => r.label === value) || ratios[0];
    return {
        value:       match.label,
        w:           match.w ?? 0,
        h:           match.h ?? 0,
        orientation: mode === 'orientation' ? orientation : null,
        qualityTier,
    };
}

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
        const qualityTier = props.qualityTier || 'medium';
        const isActive = props.showPopup || false;

        const mode = RATIO_MODES[modelType] ?? 'orientation';
        const ratios = getModelRatios(modelType, mode === 'orientation' ? orientation : undefined, qualityTier);

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
                info: `Switch to ${r.label} ratio`
            })}
            </div>`;
        }).join('');

        // The popup content header depends on mode
        const isFlat = mode === 'quality' || modelType === 'social';
        let headerHtml = '';
        if (mode === 'orientation') {
            const orientContainerStyle = isFlat ? 'display: none;' : '';
            headerHtml = `
            <div class="mpi-ratio-sel__header">
                ${MpiBadge.template({ label: 'RATIO', variant: 'secondary' })}
                <div class="mpi-ratio-sel__orient-btn" style="${orientContainerStyle}">
                    ${MpiButton.template({
            icon: orientIcon,
            size: 'sm',
            info: `Switch to ${orientation === 'portrait' ? 'landscape' : 'portrait'} orientation`,
        })}
                </div>
            </div>`;
        } else if (mode === 'quality') {
            const speedOptions = ['very_low', 'low', 'medium', 'high', 'very_high'];
            headerHtml = `
            <div class="mpi-ratio-sel__header">
                ${MpiBadge.template({ label: 'QUALITY', variant: 'secondary' })}
                <div class="mpi-ratio-sel__speed-radio" id="speed-radio-slot">
                    ${MpiRadioGroup.template({
                options: speedOptions,
                value: qualityTier,
                name: 'quality_tier'
            })}
                </div>
            </div>`;
        }

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
        // Seed live prop from initial value so click/orient handlers (which
        // read props.orientation directly) stay in sync with the template's
        // initialOrientation fallback.
        if (!props.orientation) props.orientation = props.initialOrientation || 'portrait';

        // Expose live accessor so callers (e.g. PromptBoxControls) can read
        // current dimensions without relying on change-event callbacks.
        el.getValue = () => resolveCurrentDimensions(props);

        const trigger = el.querySelector('.mpi-ratio-sel__trigger');
        const popupEl = el.querySelector('.mpi-popup');
        // Capture DOM refs before portaling (they live inside popupEl)
        const grid = el.querySelector('.mpi-ratio-sel__grid');
        const orientContainer = el.querySelector('.mpi-ratio-sel__orient-btn');
        let leaveTimer = null;
        const _unsubs = [];

        // ── Portal ──────────────────────────────────────────────────────────────
        // MpiPopup is template-rendered here (not independently mounted), so we
        // portal it manually. This escapes ancestor overflow/transform stacking
        // contexts that would otherwise clip or misposition the fixed popup.
        document.body.appendChild(popupEl);

        // Force-dismiss from global bus
        _unsubs.push(Events.on('ui:close-all-popups', () => {
            if (props.showPopup) closePopup();
        }));

        // Remove portal node when this component is removed from the DOM.
        const domObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
                domObserver.disconnect();
                _unsubs.forEach(fn => fn());
                document.removeEventListener('click', onOutsideClick);
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // ── Positioning ─────────────────────────────────────────────────────────
        // Popup uses CSS transform: translateX(-50%) to center on `left`.
        // After placing, measure and nudge left/right to keep popup inside viewport.
        const positionPopup = () => {
            const rect = trigger.getBoundingClientRect();
            popupEl.style.bottom = `${window.innerHeight - rect.top + 12}px`;
            popupEl.style.left   = `${rect.left + rect.width / 2}px`;
            popupEl.style.top    = '';

            // Measure after layout; clamp if overflowing left or right.
            requestAnimationFrame(() => {
                const pr = popupEl.getBoundingClientRect();
                const margin = 8;
                const overflowLeft  = margin - pr.left;
                const overflowRight = pr.right - (window.innerWidth - margin);
                if (overflowLeft > 0)  popupEl.style.left = `${parseFloat(popupEl.style.left) + overflowLeft}px`;
                if (overflowRight > 0) popupEl.style.left = `${parseFloat(popupEl.style.left) - overflowRight}px`;
            });
        };

        // ── Close helper ────────────────────────────────────────────────────────
        const closePopup = () => {
            props.showPopup = false;
            popupEl.classList.remove('is-active');
            const btn = trigger.querySelector('.mpi-btn');
            if (btn) btn.classList.remove('is-active');
            emit('popup_toggle', { active: false });
        };

        // ── Outside-click dismiss (replaces hover-close) ─────────────────────────
        // Hover-close created chaos when multiple portaled popups overlapped.
        // Popup stays open until user clicks elsewhere or presses Escape.
        const onOutsideClick = (e) => {
            if (!props.showPopup) return;
            if (popupEl.contains(e.target) || el.contains(e.target)) return;
            // Don't close when clicking portaled children (dropdowns etc).
            if (e.target.closest?.('.mpi-dropdown__list')) return;
            closePopup();
        };
        document.addEventListener('click', onOutsideClick);
        void leaveTimer; // retained for API parity; no longer scheduled

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
            const qualityTier = props.qualityTier || 'medium';
            const mode = RATIO_MODES[modelType] ?? 'orientation';
            const ratios = getModelRatios(modelType, mode === 'orientation' ? orientation : undefined, qualityTier);

            // 1. Update Grid Icons
            grid.innerHTML = ratios.map(r => {
                const isSelected = r.label === value;
                const iconName = r.icon.replace('rect_', 'ratio_');
                return `<div class="mpi-ratio-sel__item" data-label="${r.label}">
                    ${MpiButton.template({
                    icon: iconName, label: r.label, labelPosition: 'top',
                    active: isSelected, toggleable: true
                })}
                </div>`;
            }).join('');

            // 2. Update header based on mode
            const isFlat = mode === 'quality' || modelType === 'social';
            if (mode === 'orientation' && orientContainer) {
                const orientIcon = orientation === 'portrait' ? 'ratio_16_9' : 'ratio_9_16';
                orientContainer.style.display = 'block';
                orientContainer.innerHTML = MpiButton.template({
                    icon: orientIcon, size: 'sm'
                });
            } else if (orientContainer) {
                orientContainer.style.display = 'none';
            }

            // 3. Update Main Trigger Button
            const currentRatio = ratios.find(r => r.label === value) || ratios[0];
            const triggerIconName = currentRatio.icon.replace('rect_', 'ratio_');
            trigger.innerHTML = MpiButton.template({
                icon: triggerIconName, label: value, active: props.showPopup, toggleable: true
            });
        };

        // ── Popup interaction (delegated to popupEl since it's portaled) ─────────
        // Orientation change handler
        popupEl.addEventListener('click', (e) => {
            const orientBtn = e.target.closest('.mpi-ratio-sel__orient-btn');
            if (orientBtn) {
                const currentOrient = props.orientation || props.initialOrientation || 'portrait';
                const newOrient = currentOrient === 'portrait' ? 'landscape' : 'portrait';
                props.orientation = newOrient;

                // Snap to same index in new orientation
                const oldRatios = getModelRatios(props.modelType || 'flux', currentOrient);
                const currentIdx = oldRatios.findIndex(r => r.label === props.value);
                const newRatios = getModelRatios(props.modelType || 'flux', newOrient);
                const newRatio = newRatios[Math.min(currentIdx, newRatios.length - 1)];
                props.value = newRatio.label;

                emit('orientation_change', { orientation: props.orientation });
                emit('change', {
                    value: props.value,
                    ratio: newRatio.ratio ?? (newRatio.w && newRatio.h ? newRatio.w / newRatio.h : null),
                    w: newRatio.w ?? null,
                    h: newRatio.h ?? null,
                    orientation: props.orientation,
                });
                updateUI();
            }
        });

        // Speed/quality tier change handler
        popupEl.addEventListener('change', (e) => {
            const speedRadio = e.target.closest('#speed-radio-slot');
            if (speedRadio) {
                const newTier = e.target.value;
                props.qualityTier = newTier;
                emit('quality_change', { qualityTier: newTier });
                updateUI();
            }
        });

        // Ratio selection handler
        popupEl.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-ratio-sel__item');
            if (item) {
                const label = item.dataset.label;
                props.value = label;

                const mode = RATIO_MODES[props.modelType] ?? 'orientation';
                const ratios = getModelRatios(
                    props.modelType || 'flux',
                    mode === 'orientation' ? (props.orientation || 'portrait') : undefined,
                    mode === 'quality' ? (props.qualityTier || 'medium') : undefined
                );
                const ratio = ratios.find(r => r.label === label);
                if (!ratio) return;

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

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            domObserver.disconnect();
            document.removeEventListener('click', onOutsideClick);
        };
    }
});
