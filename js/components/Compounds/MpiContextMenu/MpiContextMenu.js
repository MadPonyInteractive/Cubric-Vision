import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { on } from '../../../utils/dom.js';
import { clientLogger } from '../../../services/clientLogger.js';

// ── Singleton guard — only one menu visible at a time ────────────────────────
let _activeCleanup = null;

function _dismissActive() {
    if (_activeCleanup) {
        _activeCleanup();
        _activeCleanup = null;
    }
}

// ── Static show API ───────────────────────────────────────────────────────────

/**
 * Show a context menu at the given coordinates.
 * Dismisses any existing menu first (singleton).
 * Self-dismisses on outside-click, Escape, or ui:close-all-popups.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   items: Array<{key: string, icon?: string, label: string, info?: string, disabled?: boolean, danger?: boolean}>,
 *   onSelect: (key: string) => void
 * }} opts
 */
function show({ x, y, items, onSelect }) {
    _dismissActive();

    const menuEl = document.createElement('div');
    menuEl.className = 'mpi-ctx-menu';

    const sepHtml = '<div class="mpi-ctx-menu__sep"></div>';
    menuEl.innerHTML = items.map(item => {
        if (item.separator) return sepHtml;
        return `<button
            class="mpi-ctx-menu__item${item.danger ? ' mpi-ctx-menu__item--danger' : ''}${item.disabled ? ' mpi-ctx-menu__item--disabled' : ''}"
            data-key="${item.key}"
            ${item.disabled ? 'disabled' : ''}
            ${item.info ? `data-info="${item.info}"` : ''}
            type="button"
        >
            <span class="mpi-ctx-menu__icon">${item.icon ? renderIcon(item.icon, 'sm') : ''}</span>
            <span class="mpi-ctx-menu__label">${item.label}</span>
            <span class="mpi-ctx-menu__kbd">${item.kbd ?? ''}</span>
        </button>`;
    }).join('');

    document.body.appendChild(menuEl);

    // Position at cursor, then clamp to viewport
    menuEl.style.position = 'fixed';
    menuEl.style.left = `${x}px`;
    menuEl.style.top  = `${y}px`;
    requestAnimationFrame(() => {
        const r = menuEl.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) menuEl.style.left = `${x - r.width}px`;
        if (r.bottom > window.innerHeight - 8) menuEl.style.top  = `${y - r.height}px`;
    });

    const _unsubs = [];

    const _cleanup = () => {
        _unsubs.forEach(fn => fn?.());
        if (menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
        if (_activeCleanup === _cleanup) _activeCleanup = null;
    };

    _activeCleanup = _cleanup;

    _unsubs.push(on(menuEl, 'click', (e) => {
        const btn = e.target.closest('.mpi-ctx-menu__item[data-key]');
        if (!btn || btn.disabled) return;
        const key = btn.dataset.key;
        clientLogger.info('ui', `[MpiContextMenu] select ${key}`);
        onSelect?.(key);
        _cleanup();
    }));

    // Dismiss on outside click — but NOT on contextmenu (handled separately per caller)
    _unsubs.push(on(document, 'click', (e) => {
        if (menuEl.contains(e.target)) return;
        _cleanup();
    }));

    _unsubs.push(Events.on('ui:close-all-popups', _cleanup));

    _unsubs.push(on(document, 'keydown', (e) => {
        if (e.key === 'Escape') _cleanup();
    }));

    // MutationObserver: clean up if anchor removed externally
    const _observer = new MutationObserver(() => {
        if (!document.contains(menuEl)) {
            _unsubs.forEach(fn => fn?.());
            _observer.disconnect();
            if (_activeCleanup === _cleanup) _activeCleanup = null;
        }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
}

// ── Component (mountable stub for dev gallery) ────────────────────────────────

export const MpiContextMenu = ComponentFactory.create({
    name: 'MpiContextMenu',
    css: ['js/components/Compounds/MpiContextMenu/MpiContextMenu.css'],
    template: () => `<div class="mpi-ctx-menu-host"></div>`,
    setup: () => {},
});

MpiContextMenu.show = show;
