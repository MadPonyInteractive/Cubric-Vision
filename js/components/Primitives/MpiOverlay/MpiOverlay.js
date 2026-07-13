import { ComponentFactory } from '../../factory.js';
import { renderIcon } from '/js/utils/icons.js';
import { Overlays } from '../../../managers/overlayManager.js';
import { Events } from '../../../events.js';
import { gid, qs } from '../../../utils/dom.js';

/**
 * MpiOverlay — Page Overlay Primitive
 *
 * Full scrollable page overlay. Three mount targets supported:
 *   - 'tool-container' (default) — injects into `#tool-container`, sidebar/titlebar/statusbar remain visible
 *   - 'body'                     — injects into `document.body` with a backdrop, covers entire viewport
 *   - 'main-area'                — injects into `.main-area` (position:absolute), covers tool-container +
 *                                  prompt-box, leaves `#shell-info-bar` (status bar) live + interactive.
 *                                  Publishes its assigned z-index as the `--app-overlay-z` CSS var so the
 *                                  queue slide-over can stack above it.
 *
 * Both modes use the Stash Pattern: existing children are moved to a hidden
 * stash so their lifecycle observers and portals remain alive in the DOM.
 * Workspace-specific classes/styles on `#tool-container` are also stashed.
 *
 * Usage:
 *   const overlay = MpiOverlay.mount(document.createElement('div'), {
 *       closable: true,
 *       mountTarget: 'body',   // or 'tool-container'
 *   });
 *   overlay.el.show();
 *   overlay.el.hide();
 *   overlay.el.appendToContainer(childEl);
 *
 * Props:
 * @param {boolean} [closable=true] - Show the X close button in the top-right corner
 * @param {('tool-container'|'body'|'main-area')} [mountTarget='tool-container'] - Where to inject the overlay
 *
 * Instance methods:
 *   show()                — injects into the chosen target, saving prior content via Stash Pattern
 *   hide()                — restores prior content, releases OverlayManager queue
 *   appendToContainer(el) — append a child element into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked or `ui:close-all-popups` received (hide() called automatically)
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

        const modeClass = props.mountTarget === 'body'
            ? 'mpi-overlay--body'
            : props.mountTarget === 'main-area'
                ? 'mpi-overlay--main'
                : 'mpi-overlay--tool';

        return `
            <div class="mpi-overlay ${modeClass}">
                ${closeBtn}
                <div class="mpi-overlay__container"></div>
            </div>`;
    },

    setup: (el, props, emit) => {
        const mountTarget = props.mountTarget === 'body' ? 'body'
            : props.mountTarget === 'main-area' ? 'main-area'
            : 'tool-container';
        const useBackdrop = mountTarget === 'body';

        let _stash = null;
        let _target = null;
        let _backdrop = null;
        let _stashedClasses = [];
        let _stashedStyle = '';
        let _isHiding = false;  // Guard against double-call of hide()
        let _isShown = false;   // Guard against re-entrant show() during Overlays.request
        let _overlayEntry = null;
        let _zIndex = null;
        const _overlayId = Math.random().toString(36).slice(2, 9);

        const _doShow = () => {
            _target = mountTarget === 'body'
                ? document.body
                : mountTarget === 'main-area'
                    ? qs('.main-area')
                    : gid('tool-container');
            if (!_target) {
                console.warn(`[MpiOverlay:${_overlayId}] mount target "${mountTarget}" not found`);
                return;
            }

            // Backdrop (body-mount only) — blocks interaction with stashed content
            if (useBackdrop) {
                _backdrop = document.createElement('div');
                _backdrop.className = 'mpi-overlay-backdrop';
                if (_zIndex !== null) _backdrop.style.zIndex = _zIndex - 1;
                _target.appendChild(_backdrop);
            }

            // Snapshot and reset workspace-specific classes/styles that would
            // break the overlay's flex/scroll layout (tool-container only)
            if (mountTarget === 'tool-container') {
                _stashedClasses = [..._target.classList].filter(c => c !== 'tool-container');
                _stashedStyle = _target.getAttribute('style') || '';
                _stashedClasses.forEach(c => _target.classList.remove(c));
                _target.removeAttribute('style');
            }

            // Stash children so lifecycle observers/portals remain alive
            _stash = document.createElement('div');
            _stash.style.display = 'none';
            _stash.classList.add('mpi-overlay-stash');

            // Keep the custom OS titlebar (min/max/close, drag region) live +
            // visible — body-mode overlays sit BELOW it (inset: var(--titlebar-h)),
            // so stashing it would leave a dead gap and make the window
            // uncloseable/undraggable while the overlay is open.
            const titlebar = mountTarget === 'body' ? gid('titlebar') : null;
            // TRAP 1: 'main-area' mode covers tool-container + prompt-box but the
            // overlay is inset above #shell-info-bar so the status bar stays visible.
            // Stashing it (like every other .main-area child) would kill the live
            // job telemetry + memory monitor. Keep it out of the stash.
            const infoBar = mountTarget === 'main-area' ? gid('shell-info-bar') : null;
            const children = Array.from(_target.children);
            children.forEach(child => {
                // Keep the toast stack live + on top: stashing it (like the titlebar)
                // would detach every in-flight toast — and a toast fired WHILE the
                // overlay is open (e.g. a disk-full warning from an Install click in
                // the Model Library) belongs ABOVE the overlay, not buried under it.
                // The stack is position:fixed z-20000 so it paints over the overlay
                // regardless of DOM order. (Its MutationObserver also stops
                // false-dismissing toasts that a stash would have yanked from the DOM.)
                const isToastStack = child.classList && child.classList.contains('mpi-toast-stack');
                if (child !== _backdrop && child !== titlebar && child !== infoBar && !isToastStack) _stash.appendChild(child);
            });

            // Insert the stash at the FRONT (before any spared sibling like
            // #shell-info-bar / #titlebar), NOT appended. Appending lands the stash —
            // and therefore every restored child on hide — AFTER the spared node,
            // permanently flipping DOM order (info-bar was last → became first →
            // its sticky bottom:0 collapsed to the top of .main-area). Front-insert
            // keeps the spared node last, so on restore the flow order is preserved
            // and the sticky status bar stays at the bottom with no CSS band-aid.
            _target.insertBefore(_stash, _target.firstChild);
            // TRAP 1b: stashing #tool-container removes the flex:1 filler that pushed the
            // spared #shell-info-bar to the bottom — without it the footer collapses UP to
            // the top of .main-area (behind the overlay, under the OS titlebar). Pin the bar
            // to the bottom for the overlay's lifetime (main-area mode only). Removed on hide.
            if (mountTarget === 'main-area') _target.classList.add('main-area--app-overlay');
            if (_zIndex !== null) el.style.zIndex = _zIndex;
            _target.appendChild(el);
            _isShown = true;
        };

        el.show = () => {
            if (_isShown) return;
            _overlayEntry = { show: _doShow, hide: el.hide, id: el };
            const { zIndex } = Overlays.request(_overlayEntry);
            _zIndex = zIndex;
            // _doShow ran inside Overlays.request() BEFORE _zIndex was known, so the
            // z-index is applied here (post-request). el is already appended by _doShow.
            if (_zIndex !== null && el.style) el.style.zIndex = _zIndex;
            // TRAP 3: publish the assigned z as --app-overlay-z so the queue slide-over
            // can stack above this overlay (main-area mode only — that's the App overlay).
            if (mountTarget === 'main-area' && _zIndex !== null) {
                document.documentElement.style.setProperty('--app-overlay-z', String(_zIndex));
            }
        };

        el.hide = () => {
            _isShown = false; // reset first — needed for queued overlays (hide may be called before _doShow ever ran)
            if (_isHiding) return;
            _isHiding = true;
            if (!_target) { _isHiding = false; return; }

            if (el.parentNode === _target) _target.removeChild(el);

            // Undo the TRAP 1b bottom-pin (see _doShow). Safe unconditionally.
            _target.classList.remove('main-area--app-overlay');

            // TRAP 3: drop the published z (removeProperty, NOT set to 0 — 0 would
            // pin the queue below its own baseline). Safe to call unconditionally.
            document.documentElement.style.removeProperty('--app-overlay-z');

            if (_backdrop) {
                _backdrop.remove();
                _backdrop = null;
            }

            if (_stash && _stash.parentNode === _target) {
                // Re-insert stashed children AT the stash's position (front), before
                // any spared sibling, preserving their original relative order — see
                // the front-insert note in _doShow.
                while (_stash.firstChild) _target.insertBefore(_stash.firstChild, _stash);
                _target.removeChild(_stash);
                _stash = null;
            }

            // Restore workspace classes and inline styles (tool-container only)
            if (mountTarget === 'tool-container') {
                _stashedClasses.forEach(c => _target.classList.add(c));
                if (_stashedStyle) _target.setAttribute('style', _stashedStyle);
            }
            _stashedClasses = [];
            _stashedStyle = '';

            _target = null;
            _isShown = false;
            _zIndex = null;
            emit('close', {});
            Overlays.release(_overlayEntry);
            _overlayEntry = null;
            _isHiding = false;
        };

        el.appendToContainer = (childEl) => {
            const container = qs('.mpi-overlay__container', el);
            if (container && childEl) container.appendChild(childEl);
        };

        const closeBtn = qs('.mpi-overlay__close', el);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => el.hide());
        }

        // Global close signal — only react when shown. EXCEPT when fired by an
        // overlay/modal opening on top of us (MpiOkCancel / showError / engine
        // dialogs): a child pop-up must not take the full-page overlay down with
        // it (MPI-79 pattern, mirrors MpiSlideOver). Escape and Overlays.reset()
        // fire this bare → the overlay still closes on those.
        const _unsub = Events.on('ui:close-all-popups', (payload) => {
            if (payload?.reason === 'overlay-open') return;
            if (_isShown) el.hide();
        });

        // Safety release: if removed from DOM unexpectedly, free the overlay queue
        const _obs = new MutationObserver(() => {
            if (!document.contains(el)) {
                Overlays.release(el);
                _unsub();
                _obs.disconnect();
            }
        });
        _obs.observe(document.body, { childList: true, subtree: true });

        // Teardown contract
        el.destroy = () => {
            _unsub();
            _obs.disconnect();
            if (_isShown) el.hide();
        };
    }
});
