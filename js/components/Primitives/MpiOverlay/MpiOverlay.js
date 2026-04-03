import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '/js/utils/icons.js';
import { Overlays } from '../../../managers/overlayManager.js';

/**
 * MpiOverlay — Main-Area Page Overlay Primitive
 *
 * Injects a full-page view directly into `#tool-container`, replacing the
 * visible content. The sidebar, titlebar, and status bar remain visible.
 * This is NOT a modal — it is a scrollable page layer, styled like the
 * provisioning screen.
 *
 * Usage:
 *   const overlay = MpiOverlay.mount(document.createElement('div'), { ... });
 *   // The component self-injects into #tool-container when shown.
 *   overlay.show();
 *   overlay.hide(); // restores previous tool-container content
 *
 * Props:
 * @param {string}   [icon='info']     - MpiIcon registry key shown at top centre
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='xl'] - Icon size
 * @param {string}   [title='']        - Large title text
 * @param {string}   [text='']         - Small descriptive text shown above the container slot
 * @param {string}   [footer='']       - Small text shown below the container slot
 * @param {boolean}  [closable=true]   - Show the X close button
 *
 * Instance methods (beyond standard factory API):
 *   show()  — injects the overlay into #tool-container, saving prior content
 *   hide()  — removes the overlay and restores prior tool-container content
 *   appendToContainer(el) — append a child element into the scrollable container slot
 *
 * Emits:
 * 'close' {} — X button clicked (hide() is called automatically)
 */
export const MpiOverlay = ComponentFactory.create({
    name: 'MpiOverlay',
    css: ['js/components/Primitives/MpiOverlay/MpiOverlay.css'],

    template: (props) => {
        const closable  = props.closable !== false;
        const icon      = props.icon     || 'info';
        const iconSize  = props.iconSize || 'xl';
        const title     = props.title    || '';
        const text      = props.text     || '';
        const footer    = props.footer   || '';

        const closeBtn = closable
            ? `<button class="mpi-overlay__close" aria-label="Close" type="button">
                   ${renderIcon('close', 'md')}
               </button>`
            : '';

        const iconHtml   = `<div class="mpi-overlay__icon">${renderIcon(icon, iconSize)}</div>`;
        const titleHtml  = title  ? `<h2 class="mpi-overlay__title">${title}</h2>`   : '';
        const textHtml   = text   ? `<p class="mpi-overlay__text">${text}</p>`       : '';
        const footerHtml = footer ? `<p class="mpi-overlay__footer">${footer}</p>`   : '';

        return `
            <div class="mpi-overlay">
                ${closeBtn}
                <div class="mpi-overlay__header">
                    ${iconHtml}
                    ${titleHtml}
                    ${textHtml}
                </div>
                <div class="mpi-overlay__container"></div>
                ${footerHtml}
            </div>`;
    },

    setup: (el, props, emit) => {
        let _stash = null;
        let _toolContainer = null;

        /**
         * Internal implementation for showing the overlay in the DOM.
         * Note: This is triggered exclusively by the OverlayManager to handle queueing.
         */
        const _doShow = () => {
             _toolContainer = document.getElementById('tool-container');
             if (!_toolContainer) return;

             // 1. Create a hidden stash container to keep existing nodes alive in the document
             // This prevents portaled components (Popups, Dropdowns) from unmounting/destroying portals
             _stash = document.createElement('div');
             _stash.style.display = 'none';
             _stash.classList.add('mpi-overlay-stash');

             // 2. Move all current children to the stash
             while (_toolContainer.firstChild) {
                 _stash.appendChild(_toolContainer.firstChild);
             }

             // 3. Mount the stash and the overlay itself
             _toolContainer.appendChild(_stash);
             _toolContainer.appendChild(el);
        };

        /**
         * Injects the overlay into #tool-container, saving the current content.
         */
        el.show = () => {
            // Register with the global OverlayManager (provides queueing and hotkeys)
            Overlays.request({
                show: _doShow,
                hide: el.hide,
                id: el // Unique identifier for release
            });
        };

        /**
         * Removes the overlay from #tool-container and restores the saved content.
         */
        el.hide = () => {
            if (!_toolContainer) return;

            // 4. Remove this overlay
            if (el.parentNode === _toolContainer) {
                _toolContainer.removeChild(el);
            }

            // 5. Restore siblings from the stash
            if (_stash && _stash.parentNode === _toolContainer) {
                while (_stash.firstChild) {
                    _toolContainer.appendChild(_stash.firstChild);
                }
                _toolContainer.removeChild(_stash);
                _stash = null;
            }

            // Signal the OverlayManager that we are done
            Overlays.release(el);
        };

        /**
         * Append a component's root element into the scrollable container slot.
         * @param {HTMLElement} childEl
         */
        el.appendToContainer = (childEl) => {
            const container = el.querySelector('.mpi-overlay__container');
            if (container && childEl) container.appendChild(childEl);
        };

        // Close button
        const closeBtn = el.querySelector('.mpi-overlay__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                el.hide();
                emit('close', {});
            });
        }

        // ── Safety Release ───────────────────────────────────────────────────
        // If the overlay is removed from the DOM unceremoniously (e.g. by navigation
        // logic clearing #tool-container), we must notify OverlayManager to release 
        // the queue, otherwise the app "locks" because it thinks an overlay is active.
        const unmountObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                Overlays.release(el);
                unmountObserver.disconnect();
            }
        });
        unmountObserver.observe(document.body, { childList: true, subtree: true });
    }
});
