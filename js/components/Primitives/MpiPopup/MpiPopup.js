import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';

/**
 * MpiPopup — Floating container primitive
 *
 * Portals itself to document.body on mount so it is immune to ancestor
 * overflow:hidden and CSS transform stacking-context issues (same pattern
 * as MpiDropdown).
 *
 * Props:
 * @param {boolean}     [active=false]   - Visibility state
 * @param {string}      [variant='glass'] - Style variant
 * @param {string}      [position='top'] - Position relative to trigger (top, bottom, left, right)
 * @param {Array}       [items=[]]       - Optional list of items: { id, label, iconHtml }
 * @param {HTMLElement} [triggerEl]      - Explicit anchor for positioning; defaults to el.parentElement
 */
export const MpiPopup = ComponentFactory.create({
    name: 'MpiPopup',
    css: ['js/components/Primitives/MpiPopup/MpiPopup.css'],

    template: (props, children) => {
        const activeClass = props.active ? 'is-active' : '';
        const variant = props.variant || 'glass';
        const position = props.position || 'top';

        let contentHtml = children || '';

        if (props.items && Array.isArray(props.items)) {
            contentHtml += props.items.map(item => `
                <div class="mpi-popup__item" data-id="${item.id}">
                    ${item.iconHtml ? `<span class="mpi-popup__item-icon">${item.iconHtml}</span>` : ''}
                    <span class="mpi-popup__item-label">${item.label}</span>
                </div>
            `).join('');
        }

        return `<div class="mpi-popup mpi-popup--${variant} mpi-popup--${position} ${activeClass}">
            <div class="mpi-popup__content">
                ${contentHtml}
            </div>
        </div>`;
    },

    setup: (el, props, emit) => {
        // Capture anchor before portaling (parentElement will still be valid after move).
        // Allow an explicit triggerEl prop for callers whose anchor isn't the direct parent.
        const anchor = (props.triggerEl instanceof Element) ? props.triggerEl : el.parentElement;
        const position = props.position || 'top';
        const gap = 12;

        // Portal to body — escapes all ancestor overflow/transform stacking contexts.
        document.body.appendChild(el);

        const positionPopup = () => {
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();

            el.style.top    = '';
            el.style.bottom = '';
            el.style.left   = '';
            el.style.right  = '';

            switch (position) {
                case 'bottom':
                    el.style.top  = `${rect.bottom + gap}px`;
                    el.style.left = `${rect.left + rect.width / 2}px`;
                    break;
                case 'left':
                    el.style.right = `${window.innerWidth - rect.left + gap}px`;
                    el.style.top   = `${rect.top + rect.height / 2}px`;
                    break;
                case 'right':
                    el.style.left = `${rect.right + gap}px`;
                    el.style.top  = `${rect.top + rect.height / 2}px`;
                    break;
                default: // 'top'
                    el.style.bottom = `${window.innerHeight - rect.top + gap}px`;
                    el.style.left   = `${rect.left + rect.width / 2}px`;
                    break;
            }
        };

        // Reposition whenever is-active is added.
        const classObserver = new MutationObserver(() => {
            if (el.classList.contains('is-active')) positionPopup();
        });
        classObserver.observe(el, { attributes: true, attributeFilter: ['class'] });

        // Force-dismiss from global bus
        const unsub = Events.on('ui:close-all-popups', () => {
            if (props.active) {
                props.active = false;
                el.classList.remove('is-active');
                emit('close', {});
            }
        });

        // Remove portal node when the original anchor leaves the DOM.
        const domObserver = new MutationObserver(() => {
            if (!document.contains(anchor)) {
                if (el.parentNode) el.parentNode.removeChild(el);
                classObserver.disconnect();
                domObserver.disconnect();
                unsub(); // Cleanup bus subscription
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // Position immediately if rendered active via props.
        if (props.active) positionPopup();

        // Core interaction handling
        el.addEventListener('mouseenter', (e) => emit('mouseenter', e));
        el.addEventListener('mouseleave', (e) => emit('mouseleave', e));

        // Item click handling
        el.addEventListener('click', (e) => {
            const item = e.target.closest('.mpi-popup__item');
            if (item) emit('select', { id: item.getAttribute('data-id'), el: item });
            emit('click', e);
        });
    }
});
