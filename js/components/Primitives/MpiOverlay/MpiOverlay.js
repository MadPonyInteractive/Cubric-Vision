import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '/js/utils/icons.js';
import { Overlays } from '../../../managers/overlayManager.js';

/**
 * MpiOverlay — Main-Area Page Overlay Primitive
 *
 * Injects a full-page scrollable view into `#tool-container`, replacing visible
 * content. The sidebar, titlebar, and status bar remain untouched.
 * This is NOT a modal — use MpiModal for centred dialogs.
 *
 * Usage:
 *   const overlay = MpiOverlay.mount(document.createElement('div'), { closable: false });
 *   overlay.el.show();
 *   overlay.el.hide();
 *   overlay.el.appendToContainer(childEl);
 *
 * Props:
 * @param {boolean} [closable=true] - Show the X close button in the top-right corner
 *
 * Instance methods:
 *   show()                — injects into #tool-container, saving prior content via Stash Pattern
 *   hide()                — restores prior content, releases OverlayManager queue
 *   appendToContainer(el) — append a child element into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked (hide() is called automatically)
 */
export const MpiOverlay = ComponentFactory.create({
    name: 'MpiOverlay',
    css: ['js/components/Primitives/MpiOverlay/MpiOverlay.css'],

    template: (props) => {
        const closeBtn = props.closable !== false
            ? `<button class="mpi-overlay__close" aria-label="Close" type="button">
                   ${renderIcon('close', 'md')}
               </button>`
            : '';

        return `
            <div class="mpi-overlay">
                ${closeBtn}
                <div class="mpi-overlay__container"></div>
            </div>`;
    },

    setup: (el, props, emit) => {
        let _stash = null;
        let _toolContainer = null;
        let _stashedClasses = [];
        let _stashedStyle = '';

        const _doShow = () => {
            _toolContainer = document.getElementById('tool-container');
            if (!_toolContainer) return;

            // Snapshot and reset any workspace-specific classes/styles that
            // would break the overlay's flex/scroll layout (e.g. gh-workspace grid)
            _stashedClasses = [..._toolContainer.classList].filter(c => c !== 'tool-container');
            _stashedStyle = _toolContainer.getAttribute('style') || '';
            _stashedClasses.forEach(c => _toolContainer.classList.remove(c));
            _toolContainer.removeAttribute('style');

            _stash = document.createElement('div');
            _stash.style.display = 'none';
            _stash.classList.add('mpi-overlay-stash');

            while (_toolContainer.firstChild) {
                _stash.appendChild(_toolContainer.firstChild);
            }

            _toolContainer.appendChild(_stash);
            _toolContainer.appendChild(el);
        };

        el.show = () => Overlays.request({ show: _doShow, hide: el.hide, id: el });

        el.hide = () => {
            if (!_toolContainer) return;

            if (el.parentNode === _toolContainer) _toolContainer.removeChild(el);

            if (_stash && _stash.parentNode === _toolContainer) {
                while (_stash.firstChild) _toolContainer.appendChild(_stash.firstChild);
                _toolContainer.removeChild(_stash);
                _stash = null;
            }

            // Restore workspace classes and inline styles
            _stashedClasses.forEach(c => _toolContainer.classList.add(c));
            if (_stashedStyle) _toolContainer.setAttribute('style', _stashedStyle);
            _stashedClasses = [];
            _stashedStyle = '';

            _toolContainer = null;
            emit('close', {});
            Overlays.release(el);
        };

        el.appendToContainer = (childEl) => {
            const container = el.querySelector('.mpi-overlay__container');
            if (container && childEl) container.appendChild(childEl);
        };

        const closeBtn = el.querySelector('.mpi-overlay__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => el.hide());
        }

        // Safety release: if removed from DOM unexpectedly, free the overlay queue
        const _obs = new MutationObserver(() => {
            if (!document.contains(el)) { Overlays.release(el); _obs.disconnect(); }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }
});
