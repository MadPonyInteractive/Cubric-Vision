/**
 * promptBoxService.js — Shell-level PromptBox singleton manager.
 *
 * The PromptBox lives in #prompt-box-mount (a persistent element in #app-shell,
 * outside #tool-container). Workspace Blocks call PromptBoxService.mount(props)
 * to (re)configure it when they load.
 *
 * Also owns the external media strip rendered *above* the PromptBox — the
 * component emits `media-change`, the service paints chips here.
 *
 * Auto-refresh on model install: subscribes to state:changed for
 * s_installedModelIds and refreshes the dropdown model list automatically.
 */

import { MpiPromptBox } from '../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { Events } from '../events.js';
import { getModelsByType } from '../data/modelRegistry.js';
import { renderIcon } from '../utils/icons.js';

let _mountEl              = null;   // #prompt-box-mount
let _stripEl              = null;   // Media strip element (above the box)
let _boxHostEl            = null;   // Wrapper the MpiPromptBox is mounted into
let _instance             = null;
let _currentModelType     = null;
let _unsubModelListUpdate = null;

function _ensureScaffold() {
    if (!_mountEl) return;
    _mountEl.innerHTML = '';

    _stripEl = document.createElement('div');
    _stripEl.className = 'mpi-prompt-box-media-strip';
    _mountEl.appendChild(_stripEl);

    _boxHostEl = document.createElement('div');
    _boxHostEl.className = 'mpi-prompt-box-host';
    _mountEl.appendChild(_boxHostEl);
}

function _renderStrip(items) {
    if (!_stripEl) return;
    _stripEl.innerHTML = '';
    items.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'mpi-prompt-box-media-strip__chip';
        chip.dataset.id = item.id;
        chip.innerHTML = item.mediaType === 'image'
            ? `<img src="${item.url}" class="mpi-prompt-box-media-strip__thumb" alt="">
               <button class="mpi-prompt-box-media-strip__remove" title="Remove">${renderIcon('close', 'xs')}</button>`
            : `<div class="mpi-prompt-box-media-strip__video-thumb">${renderIcon('video', 'sm')}</div>
               <button class="mpi-prompt-box-media-strip__remove" title="Remove">${renderIcon('close', 'xs')}</button>`;
        chip.querySelector('.mpi-prompt-box-media-strip__remove').addEventListener('click', (e) => {
            e.stopPropagation();
            _instance?.el?.removeMedia?.(item.id);
        });
        _stripEl.appendChild(chip);
    });
}

export const PromptBoxService = {
    /**
     * Initialize with the DOM element. Called once from shell.js on startup.
     * @param {HTMLElement} mountEl
     */
    init(mountEl) {
        _mountEl = mountEl;
    },

    /**
     * (Re)mount the PromptBox with fresh props.
     * @param {Object} props
     * @returns {Object} component instance
     */
    mount(props) {
        if (!_mountEl) {
            console.error('[PromptBoxService] init() must be called before mount()');
            return null;
        }

        if (_unsubModelListUpdate) {
            _unsubModelListUpdate();
            _unsubModelListUpdate = null;
        }

        if (_instance?.el?.destroy) {
            _instance.el.destroy();
        }

        _ensureScaffold();
        _instance = MpiPromptBox.mount(_boxHostEl, props);

        // Paint media strip in response to box media changes
        _instance.on('media-change', ({ items }) => _renderStrip(items));
        _renderStrip([]);

        if (props.model?.mediaType) {
            _currentModelType = props.model.mediaType;
        } else if (props.modelList?.length > 0) {
            _currentModelType = props.modelList[0].mediaType;
        } else {
            _currentModelType = null;
        }

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

    show() {
        if (_mountEl) _mountEl.classList.remove('hide');
    },

    hide() {
        if (_mountEl) _mountEl.classList.add('hide');
    },

    injectPrompts({ positive, negative } = {}) {
        _instance?.el?.injectPrompts?.({ positive, negative });
    },

    injectMedia({ url, mediaType } = {}) {
        return _instance?.el?.injectMedia?.({ url, mediaType }) ?? false;
    },

    get component() {
        return _instance?.el ?? null;
    },

    /** @deprecated Use .component */
    get el() {
        return this.component;
    },
};
