import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '/js/utils/icons.js';
import { Overlays } from '../../../managers/overlayManager.js';
import { Events } from '../../../events.js';

/**
 * MpiProjectsPageOverlay — Full-viewport Page Overlay Primitive
 *
 * Identical in appearance and API to MpiOverlay but mounts over `document.body`
 * rather than `#tool-container`. Designed for use on the landing/projects page
 * where `#app-shell` is hidden and `#tool-container` is unavailable.
 *
 * Uses the Stash Pattern to keep existing body children alive in the DOM while
 * the overlay is visible, then restores them on hide().
 *
 * Usage:
 *   const overlay = MpiProjectsPageOverlay.mount(document.createElement('div'), { closable: true });
 *   overlay.el.show();
 *   overlay.el.hide();
 *   overlay.el.appendToContainer(childEl);
 *
 * Props:
 * @param {boolean} [closable=true] - Show the X close button in the top-right corner
 *
 * Instance methods:
 *   show()                — stashes body children, appends backdrop + overlay
 *   hide()                — restores body children, releases OverlayManager queue
 *   appendToContainer(el) — append a child element into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked (hide() is called automatically)
 */
export const MpiProjectsPageOverlay = ComponentFactory.create({
    name: 'MpiProjectsPageOverlay',
    css: ['js/components/Primitives/MpiProjectsPageOverlay/MpiProjectsPageOverlay.css'],

    template: (props) => {
        const closeBtn = props.closable !== false
            ? `<button class="mpi-ppo__close" aria-label="Close" type="button">
                   ${renderIcon('close', 'md')}
               </button>`
            : '';

        return `
            <div class="mpi-ppo">
                ${closeBtn}
                <div class="mpi-ppo__container"></div>
            </div>`;
    },

    setup: (el, props, emit) => {
        let _backdrop = null;
        let _stash    = null;

        const _doShow = () => {
            // Backdrop — blocks interaction with stashed content
            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-ppo-backdrop';
            document.body.appendChild(_backdrop);

            // Stash all current body children (except our new backdrop) so
            // their lifecycle observers and portals remain alive in the DOM
            _stash = document.createElement('div');
            _stash.className = 'mpi-ppo-stash';
            _stash.style.display = 'none';

            const bodyChildren = Array.from(document.body.children);
            bodyChildren.forEach(child => {
                if (child !== _backdrop) _stash.appendChild(child);
            });
            document.body.appendChild(_stash);
            document.body.appendChild(el);
        };

        el.show = () => Overlays.request({ show: _doShow, hide: el.hide, id: el });

        el.hide = () => {
            // Remove overlay element
            if (el.parentNode === document.body) document.body.removeChild(el);

            // Remove backdrop
            if (_backdrop) { _backdrop.remove(); _backdrop = null; }

            // Restore stashed children
            if (_stash) {
                Array.from(_stash.children).forEach(child => document.body.appendChild(child));
                _stash.remove();
                _stash = null;
            }

            Overlays.release(el);
        };

        el.appendToContainer = (childEl) => {
            const container = el.querySelector('.mpi-ppo__container');
            if (container && childEl) container.appendChild(childEl);
        };

        const closeBtn = el.querySelector('.mpi-ppo__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => { emit('close', {}); el.hide(); });
        }

        // Respond to global close signal (e.g. another blocking UI opening)
        const _unsub = Events.on('ui:close-all-popups', () => {
            if (_backdrop) el.hide();
        });

        // Safety release: if removed from DOM unexpectedly, free the overlay queue
        const _obs = new MutationObserver(() => {
            if (!document.contains(el)) { Overlays.release(el); _unsub(); _obs.disconnect(); }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
});
