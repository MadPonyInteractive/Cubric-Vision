/**
 * mediaContextMenu.js — Global Context Menu Component for Media
 * 
 * Centralized UI component that dynamically renders dropdowns based on media types 
 * and contexts defined in mediaActions.js.
 */
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { MEDIA_ACTIONS } from '../mediaActions.js';

export class MediaContextMenu {
    static _activeMenu = null;
    static _closeHandler = null;

    /**
     * Configures and displays the media context menu.
     *
     * @param {number} x - window clientX
     * @param {number} y - window clientY
     * @param {Object} mediaData - { url, filename, type, isSaved }
     * @param {string} context - 'history', 'library', 'input'
     * @param {Object} callbacks - { onClear, onDeleted, onSaved }
     * @param {Object} [pageOptions] - Page-specific overrides:
     *   labelOverrides: { [actionId]: string } — rename a base action label
     *   extraActions: Array<{ id, label, icon, execute(url, filename, callbacks) }> — appended after a separator
     */
    static show(x, y, mediaData, context = 'library', callbacks = {}, pageOptions = {}) {
        this.hide(); // Clear any existing and its listeners

        const { labelOverrides = {}, extraActions = [] } = pageOptions;

        const menu = document.createElement('div');
        menu.id = 'global-media-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${y}px;
            left: ${x}px;
            background: var(--surface-2);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05);
            z-index: 10000;
            padding: 0.5rem 0;
            display: flex;
            flex-direction: column;
            min-width: 150px;
        `;

        const _addBtn = (action, overrideLabel) => {
            const btn = document.createElement('button');
            const label = overrideLabel ?? action.label;
            btn.innerHTML = `${action.icon} <span style="margin-left: 8px;">${label}</span>`;
            btn.style.cssText = `
                background: transparent;
                border: none;
                color: var(--text-2);
                padding: 8px 16px;
                text-align: left;
                cursor: pointer;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                width: 100%;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(255, 255, 255, 0.08)';
            btn.onmouseout = () => btn.style.background = 'transparent';
            btn.onclick = (e) => {
                e.stopPropagation();
                action.execute(mediaData.url, mediaData.filename, callbacks, x, y);
                this.hide();
            };
            menu.appendChild(btn);
        };

        const _addSep = () => {
            const sep = document.createElement('div');
            sep.style.cssText = `height: 1px; background: var(--border-color); margin: 4px 0;`;
            sep.classList.add('menu-separator');
            menu.appendChild(sep);
        };

        let visibleCount = 0;

        MEDIA_ACTIONS.forEach(action => {
            if (action.isSeparator) {
                if (visibleCount > 0) _addSep();
                return;
            }

            // Filtering logic
            if (action.requiresDevMode && !APP_CONFIG.dev_mode) return;
            if (action.supportedTypes && !action.supportedTypes.includes(mediaData.type)) return;
            if (action.validContexts && !action.validContexts.includes(context)) return;

            // Context specific overrides (e.g., Save)
            if (action.id === 'save' && mediaData.isSaved) return;

            visibleCount++;
            _addBtn(action, labelOverrides[action.id]);
        });

        // Page-specific extra actions
        if (extraActions.length > 0) {
            if (visibleCount > 0) _addSep();
            extraActions.forEach(action => {
                visibleCount++;
                _addBtn(action);
            });
        }

        if (visibleCount === 0) {
            const noActions = document.createElement('div');
            noActions.textContent = 'No actions available';
            noActions.style.cssText = 'color: var(--text-2); font-size: 0.8rem; padding: 4px 12px; opacity: 0.7;';
            menu.appendChild(noActions);
        } else {
             // Cleanup trailing separator if the last added items were hidden
             const lastChild = menu.lastElementChild;
             if (lastChild && lastChild.classList.contains('menu-separator')) {
                 lastChild.remove();
             }
        }

        document.body.appendChild(menu);
        this._activeMenu = menu;

        // Auto-close handler stored statically for reliable removal
        this._closeHandler = (ev) => { 
            if (this._activeMenu && !this._activeMenu.contains(ev.target)) { 
                this.hide(); 
            } 
        };

        setTimeout(() => {
            document.addEventListener('mousedown', this._closeHandler);
            document.addEventListener('contextmenu', this._closeHandler);
        }, 10);
    }

    static hide() {
        if (this._closeHandler) {
            document.removeEventListener('mousedown', this._closeHandler);
            document.removeEventListener('contextmenu', this._closeHandler);
            this._closeHandler = null;
        }

        if (this._activeMenu) {
            this._activeMenu.remove();
            this._activeMenu = null;
        }
    }
}
