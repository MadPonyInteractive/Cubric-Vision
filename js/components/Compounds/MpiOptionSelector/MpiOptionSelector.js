import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs, on } from '../../../utils/dom.js';
import { getModelRatios, RATIO_MODES } from '../../../utils/ratios.js';

/**
 * Resolve current { value, w, h, orientation, qualityTier } from live props (ratio variant only).
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

// ── Template helpers ─────────────────────────────────────────────────────────

function _templateRatio(props) {
    const orientation = props.orientation || props.initialOrientation || 'portrait';
    const modelType   = props.modelType || 'flux';
    const value       = props.value || '1:1';
    const qualityTier = props.qualityTier || 'medium';
    const isActive    = props.showPopup || false;
    const mode        = RATIO_MODES[modelType] ?? 'orientation';
    const ratios      = getModelRatios(modelType, mode === 'orientation' ? orientation : undefined, qualityTier);

    const currentRatio = ratios.find(r => r.label === value) || ratios[0];
    const triggerIcon  = currentRatio.icon.replace('rect_', 'ratio_');
    const orientIcon   = orientation === 'portrait' ? 'ratio_16_9' : 'ratio_9_16';

    const ratioBtnsHtml = ratios.map(r => {
        const isSelected = r.label === value;
        const iconName   = r.icon.replace('rect_', 'ratio_');
        return `<div class="mpi-opt-sel__item" data-label="${r.label}">
            ${MpiButton.template({ icon: iconName, label: r.label, labelPosition: 'top', size: 'md', active: isSelected, toggleable: true, info: `Switch to ${r.label} ratio` })}
        </div>`;
    }).join('');

    const isFlat = mode === 'quality' || modelType === 'social';
    let headerHtml = '';
    if (mode === 'orientation') {
        const orientContainerStyle = isFlat ? 'display: none;' : '';
        headerHtml = `
        <div class="mpi-opt-sel__header">
            ${MpiBadge.template({ label: 'RATIO', variant: 'secondary' })}
            <div class="mpi-opt-sel__orient-btn" style="${orientContainerStyle}">
                ${MpiButton.template({ icon: orientIcon, size: 'sm', info: `Switch to ${orientation === 'portrait' ? 'landscape' : 'portrait'} orientation` })}
            </div>
        </div>`;
    } else if (mode === 'quality') {
        const speedOptions = ['very_low', 'low', 'medium', 'high', 'very_high'];
        headerHtml = `
        <div class="mpi-opt-sel__header">
            ${MpiBadge.template({ label: 'QUALITY', variant: 'secondary' })}
            <div class="mpi-opt-sel__speed-radio" id="speed-radio-slot">
                ${MpiRadioGroup.template({ options: speedOptions, value: qualityTier, name: 'quality_tier' })}
            </div>
        </div>`;
    }

    const popupInnerHtml = `${headerHtml}<div class="mpi-opt-sel__grid">${ratioBtnsHtml}</div>`;

    const triggerBtnHtml = MpiButton.template({
        icon: triggerIcon, label: value, size: 'md', active: isActive, toggleable: true, stroke: true, info: 'Select aspect ratio'
    });

    return `<div class="mpi-opt-sel mpi-opt-sel--ratio">
        <div class="mpi-opt-sel__trigger">${triggerBtnHtml}</div>
        ${MpiPopup.template({ active: isActive, position: 'top' }, popupInnerHtml)}
    </div>`;
}

function _templateNumber(props) {
    const values   = props.values || [];
    const current  = props.value ?? values[0] ?? '';
    const icon     = props.icon ?? null;
    const isActive = props.showPopup || false;

    const itemsHtml = values.map(v => `
        <div class="mpi-opt-sel__item" data-value="${v}">
            ${MpiButton.template({ text: String(v), size: 'md', variant: v === current ? 'primary' : 'ghost', extraClasses: v === current ? 'is-active' : '' })}
        </div>
    `).join('');

    const popupInnerHtml = `
        ${props.popupTitle ? `<div class="mpi-opt-sel__header">${MpiBadge.template({ label: props.popupTitle, variant: 'secondary' })}</div>` : ''}
        <div class="mpi-opt-sel__grid">${itemsHtml}</div>
    `;

    const triggerHtml = MpiButton.template({
        ...(icon ? { icon, label: String(current) } : { text: String(current), variant: 'secondary' }),
        size: 'md', active: isActive, toggleable: true, info: props.info || '',
    });

    return `<div class="mpi-opt-sel mpi-opt-sel--number">
        <div class="mpi-opt-sel__trigger">${triggerHtml}</div>
        ${MpiPopup.template({ active: isActive, position: 'top' }, popupInnerHtml)}
    </div>`;
}

// ── Buttons variant ──────────────────────────────────────────────────────────

function _templateButtons(props) {
    const buttons     = props.buttons || [];
    const triggerIcon = props.triggerIcon || buttons[0]?.icon || 'settings';
    const isActive    = props.showPopup || false;

    const itemsHtml = buttons.map(b => `
        <div class="mpi-opt-sel__item" data-value="${b.value}">
            ${MpiButton.template({ icon: b.icon, label: b.label ?? '', labelPosition: 'right', size: 'md', variant: 'ghost', info: b.info || b.label || '' })}
        </div>
    `).join('');

    const popupInnerHtml = `
        ${props.popupTitle ? `<div class="mpi-opt-sel__header">${MpiBadge.template({ label: props.popupTitle, variant: 'secondary' })}</div>` : ''}
        <div class="mpi-opt-sel__grid mpi-opt-sel__grid--buttons">${itemsHtml}</div>
    `;

    const triggerHtml = MpiButton.template({
        icon: triggerIcon,
        size: props.triggerSize || 'sm',
        variant: props.triggerVariant || 'ghost',
        active: props.triggerActive || isActive,
        toggleable: true,
        info: props.info || '',
    });

    return `<div class="mpi-opt-sel mpi-opt-sel--buttons">
        <div class="mpi-opt-sel__trigger">${triggerHtml}</div>
        ${MpiPopup.template({ active: isActive, position: 'top' }, popupInnerHtml)}
    </div>`;
}

function _setupButtons(el, props, emit) {
    let _buttons       = [...(props.buttons || [])];
    let _triggerIcon   = props.triggerIcon || _buttons[0]?.icon || 'settings';
    let _triggerActive = !!props.triggerActive;

    const trigger = qs('.mpi-opt-sel__trigger', el);
    const popupEl = qs('.mpi-popup', el);
    const grid    = qs('.mpi-opt-sel__grid', el);

    const _closePopup = () => {
        props.showPopup = false;
        popupEl.classList.remove('is-active');
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.remove('is-active');
        emit('popup_toggle', { active: false });
    };

    const _renderTrigger = () => {
        trigger.innerHTML = MpiButton.template({
            icon: _triggerIcon,
            size: props.triggerSize || 'sm',
            variant: props.triggerVariant || 'ghost',
            active: _triggerActive || props.showPopup,
            toggleable: true,
            info: props.info || '',
        });
    };

    const _renderGrid = () => {
        grid.innerHTML = _buttons.map(b => `
            <div class="mpi-opt-sel__item" data-value="${b.value}">
                ${MpiButton.template({ icon: b.icon, label: b.label ?? '', labelPosition: 'right', size: 'md', variant: 'ghost', info: b.info || b.label || '' })}
            </div>
        `).join('');
    };

    el.setButtons       = (buttons) => { _buttons = [...(buttons || [])]; _renderGrid(); };
    el.setTriggerIcon   = (icon)    => { _triggerIcon = icon; _renderTrigger(); };
    el.setTriggerActive = (active)  => { _triggerActive = !!active; _renderTrigger(); };
    el.getButtons       = ()        => _buttons.slice();

    const _unsubs = [];
    const destroyPortal = _setupPortalAndDismiss(el, popupEl, trigger, () => props.showPopup, _closePopup);

    _unsubs.push(on(trigger, 'click', (e) => {
        e.stopPropagation();
        props.showPopup = !props.showPopup;
        if (props.showPopup) _positionPopup(trigger, popupEl);
        popupEl.classList.toggle('is-active', props.showPopup);
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.toggle('is-active', props.showPopup);
        emit('popup_toggle', { active: props.showPopup });
    }));

    _unsubs.push(on(popupEl, 'click', (e) => {
        const item = e.target.closest('.mpi-opt-sel__item[data-value]');
        if (!item) return;
        const value = item.dataset.value;
        const def   = _buttons.find(b => b.value === value);
        if (!def) return;
        if (def.icon) { _triggerIcon = def.icon; _renderTrigger(); }
        emit('change', { value, def });
        _closePopup();
    }));

    el.destroy = () => {
        _unsubs.forEach(fn => fn?.());
        destroyPortal();
    };
}

// ── Shared setup helpers ──────────────────────────────────────────────────────

function _setupPortalAndDismiss(el, popupEl, trigger, getShowPopup, closeFn) {
    document.body.appendChild(popupEl);

    const _unsubBus = Events.on('ui:close-all-popups', () => {
        if (getShowPopup()) closeFn();
    });

    const _offOutsideClick = on(document, 'click', (e) => {
        if (!getShowPopup()) return;
        if (popupEl.contains(e.target) || el.contains(e.target)) return;
        if (e.target.closest?.('.mpi-dropdown__list')) return;
        closeFn();
    });

    const _domObserver = new MutationObserver(() => {
        if (!document.contains(el)) {
            if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
            _domObserver.disconnect();
            _unsubBus();
            _offOutsideClick();
        }
    });
    _domObserver.observe(document.body, { childList: true, subtree: true });

    const destroy = () => {
        _domObserver.disconnect();
        _unsubBus();
        _offOutsideClick();
        if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
    };

    return destroy;
}

function _positionPopup(trigger, popupEl) {
    const rect = trigger.getBoundingClientRect();
    popupEl.style.bottom = `${window.innerHeight - rect.top + 12}px`;
    popupEl.style.left   = `${rect.left + rect.width / 2}px`;
    popupEl.style.top    = '';
    requestAnimationFrame(() => {
        const pr = popupEl.getBoundingClientRect();
        const overflowLeft  = Math.max(0, 8 - pr.left);
        const overflowRight = Math.max(0, pr.right - window.innerWidth + 8);
        if (overflowLeft  > 0) popupEl.style.left = `${parseFloat(popupEl.style.left) + overflowLeft}px`;
        if (overflowRight > 0) popupEl.style.left = `${parseFloat(popupEl.style.left) - overflowRight}px`;
    });
}

// ── Ratio variant setup ───────────────────────────────────────────────────────

function _setupRatio(el, props, emit) {
    if (!props.orientation) props.orientation = props.initialOrientation || 'portrait';

    el.getValue = () => resolveCurrentDimensions(props);

    const trigger        = qs('.mpi-opt-sel__trigger', el);
    const popupEl        = qs('.mpi-popup', el);
    const grid           = qs('.mpi-opt-sel__grid', el);
    const orientContainer = qs('.mpi-opt-sel__orient-btn', el);

    const closePopup = () => {
        props.showPopup = false;
        popupEl.classList.remove('is-active');
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.remove('is-active');
        emit('popup_toggle', { active: false });
    };

    const _unsubs = [];
    const destroyPortal = _setupPortalAndDismiss(el, popupEl, trigger, () => props.showPopup, closePopup);

    _unsubs.push(on(trigger, 'click', (e) => {
        e.stopPropagation();
        props.showPopup = !props.showPopup;
        if (props.showPopup) _positionPopup(trigger, popupEl);
        popupEl.classList.toggle('is-active', props.showPopup);
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.toggle('is-active', props.showPopup);
        emit('popup_toggle', { active: props.showPopup });
    }));

    const updateUI = () => {
        const orientation = props.orientation || props.initialOrientation || 'portrait';
        const modelType   = props.modelType || 'flux';
        const value       = props.value || '1:1';
        const qualityTier = props.qualityTier || 'medium';
        const mode        = RATIO_MODES[modelType] ?? 'orientation';
        const ratios      = getModelRatios(
            modelType,
            mode === 'orientation' ? orientation : undefined,
            mode === 'quality' ? qualityTier : undefined
        );

        grid.innerHTML = ratios.map(r => {
            const isSelected = r.label === value;
            const iconName   = r.icon.replace('rect_', 'ratio_');
            return `<div class="mpi-opt-sel__item" data-label="${r.label}">
                ${MpiButton.template({ icon: iconName, label: r.label, labelPosition: 'top', active: isSelected, toggleable: true })}
            </div>`;
        }).join('');

        const isFlat = mode === 'quality' || modelType === 'social';
        if (mode === 'orientation' && orientContainer) {
            const orientIcon = orientation === 'portrait' ? 'ratio_16_9' : 'ratio_9_16';
            orientContainer.style.display = isFlat ? 'none' : 'block';
            orientContainer.innerHTML = MpiButton.template({ icon: orientIcon, size: 'sm' });
        } else if (orientContainer) {
            orientContainer.style.display = 'none';
        }

        const currentRatio   = ratios.find(r => r.label === value) || ratios[0];
        const triggerIconName = currentRatio.icon.replace('rect_', 'ratio_');
        trigger.innerHTML = MpiButton.template({
            icon: triggerIconName, label: value, active: props.showPopup, toggleable: true
        });
    };

    // Orientation toggle + ratio selection (single delegated click handler)
    _unsubs.push(on(popupEl, 'click', (e) => {
        const orientBtn = e.target.closest('.mpi-opt-sel__orient-btn');
        if (orientBtn) {
            const currentOrient = props.orientation || props.initialOrientation || 'portrait';
            const newOrient     = currentOrient === 'portrait' ? 'landscape' : 'portrait';
            props.orientation   = newOrient;

            const oldRatios  = getModelRatios(props.modelType || 'flux', currentOrient);
            const currentIdx = oldRatios.findIndex(r => r.label === props.value);
            const newRatios  = getModelRatios(props.modelType || 'flux', newOrient);
            const newRatio   = newRatios[Math.min(currentIdx, newRatios.length - 1)];
            props.value = newRatio.label;

            emit('orientation_change', { orientation: props.orientation });
            emit('change', {
                value:       props.value,
                ratio:       newRatio.ratio ?? (newRatio.w && newRatio.h ? newRatio.w / newRatio.h : null),
                w:           newRatio.w ?? null,
                h:           newRatio.h ?? null,
                orientation: props.orientation,
            });
            updateUI();
            return;
        }

        const item = e.target.closest('.mpi-opt-sel__item[data-label]');
        if (!item) return;
        const label       = item.dataset.label;
        const modelType   = props.modelType || 'flux';
        const orientation = props.orientation || props.initialOrientation || 'portrait';
        const qualityTier = props.qualityTier || 'medium';
        const mode        = RATIO_MODES[modelType] ?? 'orientation';
        const ratios      = getModelRatios(
            modelType,
            mode === 'orientation' ? orientation : undefined,
            mode === 'quality' ? qualityTier : undefined
        );
        const ratio = ratios.find(r => r.label === label);
        if (!ratio) return;
        props.value = label;
        emit('change', {
            value:       label,
            ratio:       ratio.ratio ?? (ratio.w && ratio.h ? ratio.w / ratio.h : null),
            w:           ratio.w ?? null,
            h:           ratio.h ?? null,
            orientation: mode === 'orientation' ? props.orientation : null,
        });
        updateUI();
        closePopup();
    }));

    // Speed/quality tier change
    _unsubs.push(on(popupEl, 'change', (e) => {
        const speedRadio = e.target.closest('#speed-radio-slot');
        if (speedRadio) {
            const newTier     = e.target.value;
            props.qualityTier = newTier;
            emit('quality_change', { qualityTier: newTier });
            updateUI();
        }
    }));

    el.destroy = () => {
        _unsubs.forEach(fn => fn?.());
        destroyPortal();
    };
}

// ── Number variant setup ──────────────────────────────────────────────────────

function _setupNumber(el, props, emit) {
    const values = props.values || [];
    props.value  = props.value ?? values[0] ?? '';

    const trigger = qs('.mpi-opt-sel__trigger', el);
    const popupEl = qs('.mpi-popup', el);
    const grid    = qs('.mpi-opt-sel__grid', el);
    const icon    = props.icon ?? null;

    el.getValue = () => props.value;
    el.setValue = (v) => {
        if (!values.includes(String(v))) return;
        props.value = String(v);
        _updateUI();
    };

    const _closePopup = () => {
        props.showPopup = false;
        popupEl.classList.remove('is-active');
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.remove('is-active');
        emit('popup_toggle', { active: false });
    };

    const _unsubs = [];
    const destroyPortal = _setupPortalAndDismiss(el, popupEl, trigger, () => props.showPopup, _closePopup);

    _unsubs.push(on(trigger, 'click', (e) => {
        e.stopPropagation();
        props.showPopup = !props.showPopup;
        if (props.showPopup) _positionPopup(trigger, popupEl);
        popupEl.classList.toggle('is-active', props.showPopup);
        const btn = qs('.mpi-btn', trigger);
        if (btn) btn.classList.toggle('is-active', props.showPopup);
        emit('popup_toggle', { active: props.showPopup });
    }));

    const _updateUI = () => {
        const current = props.value;
        grid.innerHTML = values.map(v => `
            <div class="mpi-opt-sel__item" data-value="${v}">
                ${MpiButton.template({ text: String(v), size: 'md', variant: v === current ? 'primary' : 'ghost', extraClasses: v === current ? 'is-active' : '' })}
            </div>
        `).join('');

        trigger.innerHTML = MpiButton.template({
            ...(icon ? { icon, label: String(current) } : { text: String(current), variant: 'secondary' }),
            size: 'md', active: props.showPopup, toggleable: true, info: props.info || '',
        });
    };

    _unsubs.push(on(popupEl, 'click', (e) => {
        const item = e.target.closest('.mpi-opt-sel__item[data-value]');
        if (!item) return;
        const v = item.dataset.value;
        if (!values.includes(v)) return;
        props.value = v;
        emit('change', { value: v });
        _updateUI();
        _closePopup();
    }));

    el.destroy = () => {
        _unsubs.forEach(fn => fn?.());
        destroyPortal();
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const MpiOptionSelector = ComponentFactory.create({
    name: 'MpiOptionSelector',
    css: ['js/components/Compounds/MpiOptionSelector/MpiOptionSelector.css'],

    template: (props) => {
        if (props.variant === 'ratio')  return _templateRatio(props);
        if (props.variant === 'number') return _templateNumber(props);
        if (props.variant === 'buttons') return _templateButtons(props);
        return `<div class="mpi-opt-sel"></div>`;
    },

    setup: (el, props, emit) => {
        if (props.variant === 'ratio')  return _setupRatio(el, props, emit);
        if (props.variant === 'number') return _setupNumber(el, props, emit);
        if (props.variant === 'buttons') return _setupButtons(el, props, emit);
    },
});
