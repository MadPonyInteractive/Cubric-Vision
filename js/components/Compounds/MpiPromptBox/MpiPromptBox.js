import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands } from '../../../data/commandRegistry.js';

/**
 * MpiPromptBox — Prompt input with media drop zone and operation awareness.
 *
 * Props:
 * @param {string}  [value='']              - Initial positive prompt value
 * @param {string}  [negativeValue='']      - Initial negative prompt value
 * @param {boolean} [includeNegative=false] - Whether to show the negative prompt toggle
 * @param {any|any[]} [LeftA]               - Component instances for the left bottom area
 * @param {any|any[]} [rightA]              - Component instances for the right bottom area
 * @param {import('../../../data/modelRegistry.js').ModelDef|null} [model=null]
 *   Active model — determines which media types the drop zone accepts.
 *   If null, no media drop zone is rendered.
 * @param {string}  [operation='t2i']       - Initial active operation key
 *
 * Instance API (on instance.el):
 *   el.imageCount      {number}  — current number of dropped images
 *   el.videoCount      {number}  — current number of dropped videos
 *   el.getMediaItems()           — returns copy of current media items array
 *   el.setOperation(key)         — set active operation (also fired by radial menu event)
 *   el.clearMedia()              — remove all dropped media
 *
 * @param {boolean} [generating=false]    - Initial generating state (toggles play/stop icon)
 *
 * Instance API (on instance.el):
 *   el.setGenerating(bool)  — sync button to generating state (call when generation ends externally)
 *
 * Emits:
 *   'input'        { positive, negative, activeMode }
 *   'copy'         { text }
 *   'mode-change'  { mode }
 *   'media-change' { imageCount, videoCount, items }
 *   'run'          { operation, positive, negative, mediaItems }
 *   'cancel'       {}
 */
export const MpiPromptBox = ComponentFactory.create({
    name: 'MpiPromptBox',
    css: ['js/components/Compounds/MpiPromptBox/MpiPromptBox.css'],

    template: (props) => {
        const hasModel = !!props.model;

        return `
            <div class="mpi-prompt-box">
                <div class="mpi-prompt-box__lock-container" id="expand-lock-slot"></div>

                ${hasModel ? `
                <div class="mpi-prompt-box__media-zone" id="media-zone">
                    <div class="mpi-prompt-box__media-chips" id="media-chips"></div>
                    <div class="mpi-prompt-box__drop-hint" id="drop-hint">
                        <span class="mpi-prompt-box__drop-hint-icon">${renderIcon('media', 'sm')}</span>
                        <span class="mpi-prompt-box__drop-hint-text"></span>
                    </div>
                </div>
                ` : ''}

                <div class="mpi-prompt-box__prompts">
                    <div id="textarea-slot" class="mpi-prompt-box__main-textarea"></div>
                    <div class="mpi-prompt-box__copy-wrapper" id="copy-btn-slot"></div>
                </div>

                <div class="mpi-prompt-box__separator"></div>

                <div class="mpi-prompt-box__bottom">
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--left" id="bottom-left-slot"></div>
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--center" id="bottom-center-slot"></div>
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--right" id="bottom-right-slot"></div>
                </div>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        let isExpansionLocked = true;
        let isNegativeMode    = false;
        let positiveValue     = props.value || '';
        let negativeValue     = props.negativeValue || '';
        let activeOperation   = props.operation || 't2i';
        let isGenerating      = props.generating || false;

        // ── Derive accepted drop types from the model's supported ops ──────────
        // Accept 'image' drops if any of the model's ops require image input.
        // Accept 'video' drops if any of the model's ops require video input.
        const model = props.model || null;
        const acceptsImage = model
            ? model.supportedOps.some(op => (commands[op]?.requiresImages ?? 0) >= 1)
            : false;
        const acceptsVideo = model
            ? model.supportedOps.some(op => (commands[op]?.requiresVideo  ?? 0) >= 1)
            : false;

        // ── Media state ────────────────────────────────────────────────────────
        /** @type {Array<{id:string, url:string, file:File|null, mediaType:'image'|'video', source:'file'|'app'}>} */
        const _mediaItems = [];

        const mediaZone = el.querySelector('#media-zone');
        const chipsEl   = el.querySelector('#media-chips');
        const dropHint  = el.querySelector('#drop-hint');

        function _syncDropHint() {
            if (!dropHint) return;
            const empty = _mediaItems.length === 0;
            dropHint.style.display = empty ? '' : 'none';
            if (empty) {
                const parts = [];
                if (acceptsImage) parts.push('image');
                if (acceptsVideo) parts.push('video');
                dropHint.querySelector('.mpi-prompt-box__drop-hint-text').textContent =
                    `Drop ${parts.join(' or ')} here`;
            }
            mediaZone.classList.toggle('mpi-prompt-box__media-zone--has-media', !empty);
        }

        function _addChip(item) {
            const chip = document.createElement('div');
            chip.className = 'mpi-prompt-box__media-chip';
            chip.dataset.id = item.id;
            chip.innerHTML = item.mediaType === 'image'
                ? `<img src="${item.url}" class="mpi-prompt-box__chip-thumb" alt="">
                   <button class="mpi-prompt-box__chip-remove" title="Remove">${renderIcon('close', 'xs')}</button>`
                : `<div class="mpi-prompt-box__chip-video-thumb">${renderIcon('video', 'sm')}</div>
                   <button class="mpi-prompt-box__chip-remove" title="Remove">${renderIcon('close', 'xs')}</button>`;

            chip.querySelector('.mpi-prompt-box__chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                _removeItem(item.id);
            });
            chipsEl.appendChild(chip);
        }

        function _removeItem(id) {
            const idx = _mediaItems.findIndex(m => m.id === id);
            if (idx === -1) return;
            const item = _mediaItems.splice(idx, 1)[0];
            if (item.source === 'file') URL.revokeObjectURL(item.url);
            chipsEl.querySelector(`[data-id="${id}"]`)?.remove();
            _syncDropHint();
            _emitMediaChange();
        }

        function _emitMediaChange() {
            el.imageCount = _mediaItems.filter(m => m.mediaType === 'image').length;
            el.videoCount = _mediaItems.filter(m => m.mediaType === 'video').length;
            emit('media-change', { imageCount: el.imageCount, videoCount: el.videoCount, items: [..._mediaItems] });
        }

        function _tryAddMedia({ url, file, mediaType, source }) {
            // Max 1 per type — replace existing rather than stack
            const existing = _mediaItems.find(m => m.mediaType === mediaType);
            if (existing) _removeItem(existing.id);

            const item = { id: crypto.randomUUID(), url, file: file || null, mediaType, source };
            _mediaItems.push(item);
            _addChip(item);
            _syncDropHint();
            _emitMediaChange();
        }

        // ── Drop zone events ───────────────────────────────────────────────────
        if (mediaZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
                el.addEventListener(ev, e => e.preventDefault())
            );

            el.addEventListener('dragenter', () => mediaZone.classList.add('mpi-prompt-box__media-zone--drag-over'));
            el.addEventListener('dragover',  () => mediaZone.classList.add('mpi-prompt-box__media-zone--drag-over'));
            el.addEventListener('dragleave', (e) => {
                if (!el.contains(e.relatedTarget))
                    mediaZone.classList.remove('mpi-prompt-box__media-zone--drag-over');
            });

            el.addEventListener('drop', (e) => {
                mediaZone.classList.remove('mpi-prompt-box__media-zone--drag-over');

                // App-internal drag from MpiGroupCard
                const appData = e.dataTransfer.getData('application/mpi-media');
                if (appData) {
                    try {
                        const { filePath, type } = JSON.parse(appData);
                        if (type === 'image' && !acceptsImage) return;
                        if (type === 'video' && !acceptsVideo) return;
                        _tryAddMedia({ url: `/${filePath}`, file: null, mediaType: type, source: 'app' });
                    } catch { /* malformed payload */ }
                    return;
                }

                // Native file drop
                const file = e.dataTransfer.files[0];
                if (!file) return;
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : null;
                if (!mediaType) return;
                if (mediaType === 'image' && !acceptsImage) return;
                if (mediaType === 'video' && !acceptsVideo) return;

                _tryAddMedia({ url: URL.createObjectURL(file), file, mediaType, source: 'file' });
            });

            _syncDropHint();
        }

        // ── Public API ─────────────────────────────────────────────────────────
        el.imageCount    = 0;
        el.videoCount    = 0;
        el.getMediaItems = () => [..._mediaItems];
        el.clearMedia    = () => [..._mediaItems].forEach(m => _removeItem(m.id));
        el.setOperation  = (key) => { activeOperation = key; };

        // ── Radial menu → operation sync ───────────────────────────────────────
        const _onSetOperation = ({ operation }) => el.setOperation(operation);
        Events.on('workspace:set-operation', _onSetOperation);

        // Cleanup listener when element leaves the DOM
        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                Events.off('workspace:set-operation', _onSetOperation);
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });

        // ── Textarea ───────────────────────────────────────────────────────────
        const mainInput = MpiInput.mount(el.querySelector('#textarea-slot'), {
            type: 'textarea',
            placeholder: 'Type your prompt...',
            value: positiveValue
        });

        const textareaEl = mainInput.el.querySelector('textarea');

        const updateHeight = () => {
            if (isExpansionLocked) { textareaEl.style.height = '3.5rem'; return; }
            textareaEl.style.height = 'auto';
            textareaEl.style.height = Math.min(Math.max(textareaEl.scrollHeight, 56), 224) + 'px';
        };

        textareaEl.addEventListener('input', () => {
            updateHeight();
            if (isNegativeMode) negativeValue = textareaEl.value;
            else positiveValue = textareaEl.value;
            emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
        });

        setTimeout(updateHeight, 0);

        // ── Expansion lock ─────────────────────────────────────────────────────
        MpiButton.mount(el.querySelector('#expand-lock-slot'), {
            icon: 'chevronDown', iconActive: 'chevronUp',
            info: 'Toggle Expanding Height',
            size: 'sm', variant: 'ghost', toggleable: true, active: !isExpansionLocked
        }).on('click', (data) => { isExpansionLocked = !data.active; updateHeight(); });

        // ── Copy button ────────────────────────────────────────────────────────
        MpiButton.mount(el.querySelector('#copy-btn-slot'), {
            icon: 'copy', variant: 'ghost', size: 'sm', info: 'Copy current Text to Clipboard'
        }).on('click', () => {
            navigator.clipboard.writeText(textareaEl.value);
            emit('copy', { text: textareaEl.value });
        });

        // ── Bottom areas ───────────────────────────────────────────────────────
        const mountArea = (slotId, content) => {
            const container = el.querySelector(`#${slotId}`);
            if (!container || !content) return;
            const items = Array.isArray(content) ? content : [content];
            items.forEach(item => {
                if (item?.el) container.appendChild(item.el);
                else if (typeof item === 'string') container.innerHTML += item;
            });
        };

        mountArea('bottom-left-slot',  props.LeftA);
        mountArea('bottom-right-slot', props.rightA);

        // ── Negative mode toggle ───────────────────────────────────────────────
        if (props.includeNegative) {
            MpiButton.mount(el.querySelector('#bottom-center-slot'), {
                icon: 'check', iconActive: 'negative',
                info: 'Switch between Positive and Negative Prompt',
                size: 'sm', variant: 'primary', toggleable: true, active: isNegativeMode
            }).on('click', (data) => {
                isNegativeMode = data.active;
                textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
                textareaEl.placeholder = isNegativeMode ? 'Type negative prompt...' : 'Type your prompt...';
                updateHeight();
                emit('mode-change', { mode: isNegativeMode ? 'negative' : 'positive' });
            });
        }

        // ── Run / Stop button ──────────────────────────────────────────────────
        // Append run button slot last so it always sits rightmost in bottom-right
        const runBtnSlot = document.createElement('div');
        el.querySelector('#bottom-right-slot').appendChild(runBtnSlot);

        const runBtn = MpiButton.mount(runBtnSlot, {
            icon: 'play', iconActive: 'stop',
            info: 'Generate / Stop',
            size: 'md', variant: 'primary',
            toggleable: true, active: isGenerating,
        });

        runBtn.on('toggle', (data) => {
            if (data.active) {
                // Switched to active = generating started
                isGenerating = true;
                emit('run', {
                    operation:  activeOperation,
                    positive:   positiveValue,
                    negative:   negativeValue,
                    mediaItems: el.getMediaItems(),
                });
            } else if (isGenerating) {
                // Only emit cancel if we were actually generating (not a reset from setGenerating)
                isGenerating = false;
                emit('cancel', {});
            }
        });

        // Public API: external code can sync the button when generation ends/starts
        el.setGenerating = (active) => {
            isGenerating = active;
            runBtn.el.classList.toggle('is-active', active);
        };
    }
});
