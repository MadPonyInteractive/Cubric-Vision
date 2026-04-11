/**
 * promptBoxService.js — Shell-level PromptBox singleton manager.
 *
 * The PromptBox lives in #prompt-box-mount (a persistent element in #app-shell,
 * outside #tool-container). Workspace Blocks call PromptBoxService.mount(props)
 * to (re)configure it when they load. The old instance is destroyed automatically.
 *
 * The mount point itself is hidden/shown with #app-shell (on landing, app-shell
 * has class 'hide', so PromptBox is never visible on the landing page).
 */

import { MpiPromptBox } from '../components/Blocks/MpiPromptBox/MpiPromptBox.js';

let _mountEl   = null;   // The #prompt-box-mount HTMLElement — set by init()
let _instance  = null;   // Current MpiPromptBox component instance

export const PromptBoxService = {
    /**
     * Initialize with the DOM element. Called once from shell.js on startup.
     * @param {HTMLElement} mountEl - The #prompt-box-mount element
     */
    init(mountEl) {
        _mountEl = mountEl;
    },

    /**
     * (Re)mount the PromptBox with fresh props.
     * Destroys the previous instance by clearing the mount point.
     * @param {Object} props - MpiPromptBox props
     * @returns {Object} The new component instance (call .on() on it to subscribe)
     */
    mount(props) {
        if (!_mountEl) {
            console.error('[PromptBoxService] init() must be called before mount()');
            return null;
        }
        _mountEl.innerHTML = '';
        _instance = MpiPromptBox.mount(_mountEl, props);
        return _instance;
    },

    /**
     * Show the PromptBox area. Called when entering selection mode exit.
     */
    show() {
        if (_mountEl) _mountEl.classList.remove('hide');
    },

    /**
     * Hide the PromptBox area. Called when selection mode activates.
     */
    hide() {
        if (_mountEl) _mountEl.classList.add('hide');
    },

    /**
     * Direct access to the mounted PromptBox component instance API.
     * The component instance has updateContext(), setGenerating(), setOperation(),
     * setModel(), setModelList(), getMediaItems(), etc. attached directly to the
     * DOM element by MpiPromptBox.setup().
     *
     * Returns null if no PromptBox is currently mounted.
     * @returns {HTMLElement|null}
     */
    get component() {
        return _instance?.el ?? null;
    },

    /**
     * Alias for component — for callers that expect a DOM element.
     * @deprecated Use .component instead. This returns the same value but the
     * name is misleading since the component instance API (updateContext,
     * setGenerating, etc.) is attached to it, not a plain DOM element.
     * @returns {HTMLElement|null}
     */
    get el() {
        return this.component;
    },
};