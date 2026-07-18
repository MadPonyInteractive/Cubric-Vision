import { ComponentFactory } from '../../factory.js';
import { qs, qsa, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * MpiStylePicker — style-LoRA picker as a button + floating image grid.
 *
 * Replaces the inline dropdown for style selection. The trigger button shows the
 * currently selected style's name; clicking it opens a fixed-width, horizontally
 * scrolling grid of cards (title on top, 4:5 image below). Card 0 is the "None"
 * card — a "None" placeholder unless index 0 supplies a baseline (no-style) image,
 * which then displays like any other card. Clicking a card selects it, closes grid.
 *
 * The grid is portalled to document.body (same escape-the-stacking-context pattern
 * as MpiDropdown) and anchored above the trigger, because the prompt box lives at
 * the bottom of the viewport.
 *
 * VALUE CONTRACT: emits the selected INDEX (int), matching the old dropdown — the
 * caller injects it as `Input_Style`. Index 0 = None.
 *
 * Props:
 * @param {Array<{label:string, image?:string}>} [styles=[]] - index-aligned style entries; index 0 = None (its image, a no-style baseline, shows if given)
 * @param {number} [value=0]  - selected index
 * @param {string} [imageBase='comfy_workflows/display/'] - path prefix for style images
 * @param {string} [info]     - Info Bar description forwarded to the trigger
 *
 * Emits:
 * 'change' { index: number, label: string }
 */
export const MpiStylePicker = ComponentFactory.create({
    name: 'MpiStylePicker',
    css: ['js/components/Primitives/MpiStylePicker/MpiStylePicker.css'],

    template: (props) => {
        const styles = props.styles || [];
        const value  = Number.isInteger(props.value) ? props.value : 0;
        const info   = props.info ? ` data-info="${escapeHtml(props.info)}"` : '';
        const current = styles[value] || styles[0] || { label: 'None' };

        return `
            <div class="mpi-style-picker"${info}>
                <button type="button" class="mpi-style-picker__trigger">
                    <span class="mpi-style-picker__value">${escapeHtml(current.label)}</span>
                    <span class="mpi-style-picker__chevron" aria-hidden="true"></span>
                </button>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const styles    = props.styles || [];
        const imageBase = props.imageBase || 'comfy_workflows/display/';
        let value = Number.isInteger(props.value) ? props.value : 0;

        const trigger = qs('.mpi-style-picker__trigger', el);
        const valueEl = qs('.mpi-style-picker__value', el);
        const _unsubs = [];
        let observer = null;
        let destroyed = false;

        // ── Portalled grid panel (built once, toggled) ──────────────────────────
        const panel = document.createElement('div');
        panel.className = 'mpi-style-picker__panel';

        const cardHtml = (s, i) => {
            const selected = i === value ? ' is-selected' : '';
            const isNone = i === 0;
            // Any card (including None) shows its image when one is provided; the
            // "None" text overlay is only the fallback for an imageless None card.
            const thumb = s.image
                ? `<span class="mpi-style-picker__thumb">
                       <img class="mpi-style-picker__img" src="${escapeHtml(imageBase + s.image)}" loading="lazy" alt="">
                   </span>`
                : `<span class="mpi-style-picker__thumb mpi-style-picker__thumb--placeholder">
                       ${isNone ? '<span class="mpi-style-picker__none">None</span>' : ''}
                   </span>`;
            return `
                <button type="button" class="mpi-style-picker__card${selected}" data-index="${i}">
                    <span class="mpi-style-picker__card-title">${escapeHtml(s.label)}</span>
                    ${thumb}
                </button>
            `;
        };

        panel.innerHTML = `<div class="mpi-style-picker__grid">${styles.map(cardHtml).join('')}</div>`;
        document.body.appendChild(panel);

        // Broken images fall back to the placeholder gradient.
        qsa('.mpi-style-picker__img', panel).forEach((img) => {
            _unsubs.push(on(img, 'error', () => {
                const thumb = img.closest('.mpi-style-picker__thumb');
                if (thumb) thumb.classList.add('mpi-style-picker__thumb--placeholder');
                img.remove();
            }));
        });

        // Vertical wheel scrolls the horizontal strip, so users don't need the
        // scrollbar. It steps ONE CARD per notch (rather than raw deltaY) so a card
        // is never left half-cropped at the panel edge — CSS scroll-snap then holds
        // the landing position. preventDefault stops the gallery behind from scrolling.
        const grid = qs('.mpi-style-picker__grid', panel);
        /** Card pitch = card width + flex gap, measured live (never hardcoded). */
        const cardPitch = () => {
            const cards = qsa('.mpi-style-picker__card', grid);
            if (cards.length < 2) return cards[0]?.offsetWidth || 0;
            return cards[1].offsetLeft - cards[0].offsetLeft;
        };
        _unsubs.push(on(grid, 'wheel', (e) => {
            if (e.deltaY === 0) return;
            e.preventDefault();
            const pitch = cardPitch();
            if (!pitch) return;
            const dir = e.deltaY > 0 ? 1 : -1;
            // Snap to the nearest card boundary in the scroll direction, so repeated
            // notches always land on whole cards even from a mid-card start.
            const current = Math.round(grid.scrollLeft / pitch);
            grid.scrollTo({ left: (current + dir) * pitch });
        }, { passive: false }));

        const positionPanel = () => {
            const rect = trigger.getBoundingClientRect();
            const gap = 8;
            const margin = 8;
            const w = panel.offsetWidth;
            // Anchor above the trigger (prompt box sits at viewport bottom),
            // centered on the trigger, then clamped so both edges stay on-screen.
            const center = rect.left + rect.width / 2 + window.scrollX;
            let left = center - w / 2;
            left = Math.min(Math.max(left, margin), window.innerWidth - margin - w);
            panel.style.left   = `${Math.max(margin, left)}px`;
            panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
        };

        let cleanupScroll = null;
        let cleanupResize = null;

        const isOpen = () => panel.classList.contains('is-open');

        const closePanel = () => {
            el.classList.remove('is-open');
            panel.classList.remove('is-open');
            if (cleanupScroll) { cleanupScroll(); cleanupScroll = null; }
            if (cleanupResize) { cleanupResize(); cleanupResize = null; }
        };

        const openPanel = () => {
            // Reflect the live selection before showing (reopen highlights current).
            qsa('.mpi-style-picker__card', panel).forEach((c) =>
                c.classList.toggle('is-selected', Number(c.dataset.index) === value));
            panel.classList.add('is-open');
            el.classList.add('is-open');
            positionPanel();
            // Jump (no animation) to the selected card, aligned to the same card
            // boundary the wheel/snap use — scrollIntoView's centering would fight
            // scroll-snap-align: start and leave a cropped card at the edge.
            const sel = qs('.mpi-style-picker__card.is-selected', panel);
            if (sel) grid.scrollTo({ left: sel.offsetLeft - grid.offsetLeft, behavior: 'instant' });
            cleanupScroll = on(window, 'scroll', (e) => {
                if (panel.contains(e.target)) return;
                closePanel();
            }, { passive: true, capture: true });
            cleanupResize = on(window, 'resize', closePanel, { passive: true });
        };

        const destroy = () => {
            if (destroyed) return;
            destroyed = true;
            closePanel();
            if (panel.parentNode) panel.parentNode.removeChild(panel);
            _unsubs.forEach(fn => fn?.());
            observer?.disconnect();
        };
        el.destroy = destroy;

        _unsubs.push(on(trigger, 'click', (e) => {
            e.stopPropagation();
            isOpen() ? closePanel() : openPanel();
        }));

        _unsubs.push(on(panel, 'click', (e) => {
            e.stopPropagation();
            const card = e.target.closest('.mpi-style-picker__card');
            if (!card) return;
            const index = Number(card.dataset.index);
            if (!Number.isInteger(index)) return;

            value = index;
            props.value = index;
            valueEl.textContent = (styles[index] || {}).label ?? 'None';
            qsa('.mpi-style-picker__card', panel).forEach((c) =>
                c.classList.toggle('is-selected', c === card));

            closePanel();
            emit('change', { index, label: valueEl.textContent });
        }));

        // Close on outside click + global bus.
        _unsubs.push(on(document, 'click', (e) => {
            if (!el.contains(e.target) && !panel.contains(e.target)) closePanel();
        }));
        _unsubs.push(Events.on('ui:close-all-popups', closePanel));

        // Watch for the trigger leaving the DOM → clean up the portal node.
        observer = new MutationObserver(() => {
            if (!document.contains(el)) destroy();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
