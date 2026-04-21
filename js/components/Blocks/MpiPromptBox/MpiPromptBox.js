import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands, getAvailableCommands, getCommandComponents } from '../../../data/commandRegistry.js';
import { PROMPT_BOX_CONTROLS, getInjectionParamsFromControls } from './PromptBoxControls.js';
import { state } from '../../../state.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';

/**
 * MpiPromptBox — Prompt input Block with self-composing operation slots.
 *
 * Owns the operation dropdown internally and injects operation-specific
 * sub-controls (e.g. MpiRatioSelector for upscale) into the bottom slot.
 *
 * @param {import('../../../data/modelRegistry.js').ModelDef|null} [model=null]
 *   Active model — determines which media types the drop zone accepts.
 *   If null, no media drop zone is rendered.
 * @param {import('../../../data/modelRegistry.js').ModelDef[]} [modelList=[]]
 *   Full list of selectable models. When provided and length > 1, a model
 *   dropdown is rendered in the left slot. Requires `model` to be set.
 * @param {string} [operation='t2i'] - Initial active operation key
 * @param {string} [value=''] - Initial positive prompt value
 * @param {string} [negativeValue=''] - Initial negative prompt value
 * @param {boolean} [includeNegative=false] - Whether to show the negative prompt toggle
 * @param {boolean} [showSettings=true] - Show gear button next to model selector (only when model is set)
 * @param {boolean} [generating=false] - Initial generating state (toggles play/stop icon)
 * @param {Object} [context={}] - Runtime context for available-command filtering
 *
 * Instance API (on instance.el):
 *   el.imageCount      {number}  — current number of dropped images
 *   el.videoCount      {number}  — current number of dropped videos
 *   el.getMediaItems()           — returns copy of current media items array
 *   el.clearMedia()              — remove all dropped media
 *   el.setOperation(key)        — set active operation (also fired by radial menu event)
 *   el.setGenerating(bool)       — sync button to generating state
 *   el.updateContext(ctx)        — update context and refresh op dropdown
 *
 * Emits:
 *   'input'        { positive, negative, activeMode }
 *   'copy'         { text }
 *   'mode-change'  { mode }
 *   'media-change' { imageCount, videoCount, items }
 *   'run'          { operation, positive, negative, mediaItems, injectionParams }
 *   'cancel'       {}
 *   'model-change' { model }   - fired when the internal model dropdown changes
 *   'operation-change' { operation } - fired when operation changes
 *   'settings'     { model }  - fired when the gear button is clicked
 */
export const MpiPromptBox = ComponentFactory.create({
    name: 'MpiPromptBox',
    css: ['js/components/Blocks/MpiPromptBox/MpiPromptBox.css'],

    template: (props) => `
        <div class="mpi-prompt-box">
            <div class="mpi-prompt-box__lock-container" id="expand-lock-slot"></div>

            ${props.model ? `
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
                <div class="mpi-prompt-box__area mpi-prompt-box__area--left"    id="bottom-left-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--center"  id="bottom-center-slot">
                    <div id="op-dropdown-slot"></div>
                </div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--neg"    id="bottom-neg-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--right"   id="bottom-right-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--bottom"  id="bottom-bottom-slot"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        let isExpansionLocked = true;
        let isNegativeMode    = false;
        let positiveValue     = props.value || '';
        let negativeValue     = props.negativeValue || '';
        let activeOperation   = props.operation || 't2i';
        let isGenerating      = props.generating || false;

        // Runtime context for filtering available commands
        let _context = props.context || {};

        // Active sub-controls — mounted/unmounted as operation changes
        /** @type {Map<string, Object>} */
        const _activeControls = new Map();

        // Mutable model state — updated via setModel() / setModelList()
        let model = props.model || null;
        let modelList = props.modelList || [];
        let _modelDropdown = null;
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

            el.addEventListener('drop', async (e) => {
                mediaZone.classList.remove('mpi-prompt-box__media-zone--drag-over');

                // App-internal drag from MpiGroupCard — re-use existing media in prompt
                // box, no history card (the card already exists in the gallery).
                const appData = e.dataTransfer.getData('application/mpi-media');
                if (appData) {
                    try {
                        const { filePath, type } = JSON.parse(appData);
                        if (type === 'image' && !acceptsImage) return;
                        if (type === 'video' && !acceptsVideo) return;
                        _tryAddMedia({ url: filePath, file: null, mediaType: type, source: 'app' });
                    } catch { /* malformed payload */ }
                    return;
                }

                // Native file drop — upload to project media folder immediately
                const file = e.dataTransfer.files[0];
                if (!file) return;
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : null;
                if (!mediaType) return;
                if (mediaType === 'image' && !acceptsImage) return;
                if (mediaType === 'video' && !acceptsVideo) return;

                // Upload to project folder and create history card immediately
                const project = state.currentProject;
                const uploaded = project
                    ? await uploadMediaFile(file, mediaType, project.folderPath, project.id)
                    : null;
                const fileUrl = uploaded
                    ? uploaded.filePath
                    : URL.createObjectURL(file); // fallback: keep blob URL

                _tryAddMedia({ url: fileUrl, file, mediaType, source: 'file' });

                // Notify parent to create a history card for this imported media
                if (uploaded) {
                    emit('media-imported', { url: uploaded.filePath, filename: uploaded.filename, itemId: uploaded.itemId, mediaType, source: 'file' });
                    Events.emit('media:imported', { url: uploaded.filePath, filename: uploaded.filename, itemId: uploaded.itemId, mediaType });
                }
            });

            _syncDropHint();
        }

        // ── Public API ─────────────────────────────────────────────────────────
        el.imageCount    = 0;
        el.videoCount    = 0;
        el.getMediaItems = () => [..._mediaItems];
        el.clearMedia    = () => [..._mediaItems].forEach(m => _removeItem(m.id));

        el.setOperation = (key) => {
            activeOperation = key;
            _refreshOpDropdown();
            _refreshOpSlot();
            emit('operation-change', { operation: key });
        };

        // updateContext — update context and refresh op dropdown options
        el.updateContext = (ctx) => {
            _context = { ..._context, ...ctx };
            _refreshOpDropdown();
        };

        el.setGenerating = (active) => {
            isGenerating = active;
            runBtn.el.classList.toggle('is-active', active);
        };

        /**
         * Sync internal model state to a new model.
         * Updates the closure variable, syncs the dropdown selection,
         * and refreshes the operation dropdown and op slot.
         */
        el.setModel = (newModel) => {
            model = newModel;
            if (_modelDropdown) {
                _modelDropdown.el.setOptions(
                    modelList.map(m => ({ value: m.id, label: m.name })),
                    newModel.id
                );
            }
            _refreshOpDropdown();
            _refreshOpSlot();
        };

        /**
         * Update the available models list.
         * Refreshes dropdown options and operation availability.
         */
        el.setModelList = (newModelList) => {
            modelList = newModelList;
            if (_modelDropdown) {
                _modelDropdown.el.setOptions(
                    modelList.map(m => ({ value: m.id, label: m.name })),
                    model?.id ?? null
                );
            }
            _refreshOpDropdown();
            _refreshOpSlot();
        };

        // ── Radial menu → operation sync ───────────────────────────────────────
        const _onSetOperation = ({ operation }) => el.setOperation(operation);

        // ── Prompt injection (from gallery reuse button) ──────────────────────
        el.injectPrompts = ({ positive, negative }) => {
            positiveValue = positive ?? positiveValue;
            negativeValue = negative ?? negativeValue;
            if (!isNegativeMode) textareaEl.value = positiveValue;
            updateHeight();
        };
        const _onInjectPrompts = ({ positive, negative }) => el.injectPrompts({ positive, negative });

        /** @type {Array<Function>} */
        const _unsubs = [
            Events.on('workspace:set-operation', _onSetOperation),
            Events.on('workspace:inject-prompts', _onInjectPrompts),
        ];

        // ── Operation dropdown ─────────────────────────────────────────────────
        let runBtn = null;

        function _refreshOpDropdown() {
            if (!model) return;

            const opSlot = el.querySelector('#op-dropdown-slot');
            if (!opSlot) return;

            // Use getAvailableCommands for context-aware filtering
            const availableCmds = getAvailableCommands(model.mediaType, model, _context);
            // Filter out operations that don't require images/video when context requests it
            const filteredCmds = _context.filterNoInputOps
                ? availableCmds.filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                : availableCmds;
            const availableOps = filteredCmds
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));

            if (availableOps.length === 0) {
                opSlot.innerHTML = '';
                return;
            }

            // Insert label
            const labelEl = document.createElement('span');
            labelEl.className = 'mpi-prompt-box__op-label';
            labelEl.textContent = 'Op:';
            labelEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-right:0.25rem;';

            const opDropdown = MpiDropdown.mount(document.createElement('div'), {
                options: availableOps,
                value: activeOperation,
                info: 'Operation',
                direction: 'up',
            });
            opDropdown.on('change', ({ value }) => el.setOperation(value));

            opSlot.innerHTML = '';
            opSlot.appendChild(labelEl);
            opSlot.appendChild(opDropdown.el);
        }

        function _refreshOpSlot() {
            const bottomSlot = el.querySelector('#bottom-bottom-slot');
            if (!bottomSlot) return;
            bottomSlot.innerHTML = '';
            _activeControls.clear();

            const componentIds = getCommandComponents(activeOperation);

            for (const componentId of componentIds) {
                const ctrl = PROMPT_BOX_CONTROLS[componentId];
                if (!ctrl) continue;

                const ctrlEl = document.createElement('div');
                ctrlEl.style.display = 'contents';
                bottomSlot.appendChild(ctrlEl);

                ctrl.mount(ctrlEl, { model });
                _activeControls.set(componentId, ctrl);
            }
        }

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

        // ── Model selector + gear button (left slot) ──────────────────────────
        if (model) {
            const leftSlot = el.querySelector('#bottom-left-slot');

            if (modelList.length >= 1) {
                _modelDropdown = MpiDropdown.mount(document.createElement('div'), {
                    options:   modelList.map(m => ({ value: m.id, label: m.name })),
                    value:     model.id,
                    info:      'Active model',
                    direction: 'up',
                });
                _modelDropdown.on('change', ({ value }) => {
                    const selected = modelList.find(m => m.id === value);
                    if (selected) {
                        el.setModel(selected);
                        Events.emit('settings:model:select', { modelId: selected.id });
                        emit('model-change', { model: selected });
                    }
                });
                leftSlot.appendChild(_modelDropdown.el);
            }

            if (props.showSettings !== false) {
                const gearBtn = MpiButton.mount(document.createElement('div'), {
                    icon: 'settings', variant: 'ghost', size: 'sm', info: 'Model Settings',
                });
                gearBtn.on('click', () => emit('settings', { model }));
                leftSlot.appendChild(gearBtn.el);
            }
        }

        // ── Download Manager button (always visible in left slot) ─────────────
        const downloadManagerBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'download', variant: 'ghost', size: 'sm', info: 'Open Download Manager',
        });
        downloadManagerBtn.on('click', () => Events.emit('models:open', {}));
        el.querySelector('#bottom-left-slot').appendChild(downloadManagerBtn.el);

        mountArea('bottom-left-slot',  props.LeftA);
        mountArea('bottom-right-slot', props.rightA);

        // ── Negative mode toggle ───────────────────────────────────────────────
        if (props.includeNegative) {
            MpiButton.mount(el.querySelector('#bottom-neg-slot'), {
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
        const runBtnSlot = document.createElement('div');
        el.querySelector('#bottom-right-slot').appendChild(runBtnSlot);

        runBtn = MpiButton.mount(runBtnSlot, {
            icon: 'play', iconActive: 'stop',
            info: 'Generate / Stop',
            size: 'md', variant: 'primary',
            toggleable: true, active: isGenerating,
        });

        runBtn.on('toggle', (data) => {
            if (data.active) {
                // Switched to active = generating started
                isGenerating = true;
                const injectionParams = getInjectionParamsFromControls(_activeControls);
                emit('run', {
                    operation:  activeOperation,
                    positive:   positiveValue,
                    negative:   negativeValue,
                    mediaItems: el.getMediaItems(),
                    injectionParams,
                });
            } else if (isGenerating) {
                // Only emit cancel if we were actually generating (not a reset from setGenerating)
                isGenerating = false;
                emit('cancel', {});
            }
        });

        // ── Initialise operation dropdown and op slot ──────────────────────────
        _refreshOpDropdown();
        _refreshOpSlot();

        // ── Cleanup ─────────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
        };
    }
});