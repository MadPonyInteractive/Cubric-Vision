/**
 * promptBoxService.js — Shell-level PromptBox singleton manager.
 *
 * The PromptBox lives in #prompt-box-mount (a persistent element in #app-shell,
 * outside #tool-container). Workspace Blocks call PromptBoxService.mount(props)
 * to (re)configure it when they load. The old instance is destroyed automatically.
 *
 * The mount point itself is hidden/shown with #app-shell (on landing, app-shell
 * has class 'hide', so PromptBox is never visible on the landing page).
 *
 * Auto-refresh on model install:
 * When a new model is installed, the service automatically refreshes the PromptBox's
 * model list by listening to state:changed for s_installedModelIds. This ensures
 * the dropdown always reflects the current installed models without blocks having
 * to manually wire that update.
 */

import { MpiPromptBox } from '../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { Events } from '../events.js';
import { getModelsByType } from '../data/modelRegistry.js';

let _mountEl              = null;   // The #prompt-box-mount HTMLElement — set by init()
let _instance             = null;   // Current MpiPromptBox component instance
let _currentModelType     = null;   // 'image' or 'video' — tracked from last mount
let _unsubModelListUpdate = null;   // Unsubscribe function for state:changed listener

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
     * Sets up auto-refresh listener for installed models.
     * @param {Object} props - MpiPromptBox props
     * @returns {Object} The new component instance (call .on() on it to subscribe)
     */
    mount(props) {
        if (!_mountEl) {
            console.error('[PromptBoxService] init() must be called before mount()');
            return null;
        }

        // Clean up previous model list update subscription
        if (_unsubModelListUpdate) {
            _unsubModelListUpdate();
            _unsubModelListUpdate = null;
        }

        _mountEl.innerHTML = '';
        _instance = MpiPromptBox.mount(_mountEl, props);

        // Track model type from the mounted model so we know which type to re-fetch
        // when installed models change. Use mediaType from the model if available.
        if (props.model?.mediaType) {
            _currentModelType = props.model.mediaType;
        } else if (props.modelList?.length > 0) {
            _currentModelType = props.modelList[0].mediaType;
        } else {
            _currentModelType = null;
        }

        // Subscribe to state changes and refresh model list when new models are installed
        if (_currentModelType) {
            _unsubModelListUpdate = Events.on('state:changed', ({ key }) => {
                if (key === 's_installedModelIds' && _instance?.el) {
                    const updated = getModelsByType(_currentModelType)
                        .filter(m => m.installed !== false);
                    _instance.el.setModelList?.(updated);
                }
            });
        }

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
     * Convenience wrapper to inject prompts into the mounted PromptBox.
     * @param {Object} opts
     * @param {string} [opts.positive] - Positive prompt text
     * @param {string} [opts.negative] - Negative prompt text
     */
    injectPrompts({ positive, negative } = {}) {
        _instance?.el?.injectPrompts?.({ positive, negative });
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