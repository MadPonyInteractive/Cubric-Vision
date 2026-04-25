import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands, getAvailableCommands, getCommandComponents } from '../../../data/commandRegistry.js';
import { PROMPT_BOX_CONTROLS, getInjectionParamsFromControls } from './PromptBoxControls.js';
import { state } from '../../../state.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { qs, on } from '../../../utils/dom.js';

/**
 * MpiPromptBox — Prompt input Block with self-composing operation slots.
 *
 * Bottom bar carries a settings badge (model · operation), the negative toggle
 * and the run button. All other controls (model dropdown, gear, download,
 * operation dropdown, op-specific controls) live inside a popup triggered by
 * the settings badge.
 *
 * Media chips render in a sibling `.mpi-prompt-box-media-strip` element above
 * the box — the organism owns both the media state and the strip rendering.
 *
 * Instance API (on instance.el):
 *   el.imageCount / el.videoCount
 *   el.getMediaItems()
 *   el.clearMedia()
 *   el.removeMedia(id)
 *   el.injectMedia({ url, mediaType })
 *   el.injectPrompts({ positive, negative })
 *   el.setOperation(key)
 *   el.setGenerating(bool)
 *   el.updateContext(ctx)
 *   el.setModel(model)
 *   el.setModelList(list)
 *
 * Emits:
 *   'input' | 'copy' | 'mode-change' | 'media-change' | 'media-imported'
 *   'run' | 'cancel' | 'model-change' | 'operation-change' | 'settings'
 */
export const MpiPromptBox = ComponentFactory.create({
    name: 'MpiPromptBox',
    css: ['js/components/Organisms/MpiPromptBox/MpiPromptBox.css'],

    template: (props) => `
        <div class="mpi-prompt-box">
            <div class="mpi-prompt-box__lock-container" id="expand-lock-slot"></div>

            ${props.model ? `
            <div class="mpi-prompt-box__drop-overlay">
                <span class="mpi-prompt-box__drop-overlay-icon">${renderIcon('media', 'md')}</span>
                <span class="mpi-prompt-box__drop-overlay-text">Drop here</span>
            </div>
            ` : ''}

            <div class="mpi-prompt-box__prompts">
                <div id="textarea-slot" class="mpi-prompt-box__main-textarea"></div>
                <div class="mpi-prompt-box__copy-wrapper" id="copy-btn-slot"></div>
            </div>

            <div class="mpi-prompt-box__separator"></div>

            <div class="mpi-prompt-box__bottom">
                <div class="mpi-prompt-box__area mpi-prompt-box__area--left"  id="settings-badge-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--neg"   id="bottom-neg-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--right" id="bottom-right-slot"></div>
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
        let _context          = props.context || {};

        /** @type {Map<string, Object>} */
        const _activeControls = new Map();

        let model = props.model || null;
        let modelList = props.modelList || [];
        let _modelDropdown = null;
        let _opDropdown = null;

        const acceptsImage = model
            ? model.supportedOps.some(op => (commands[op]?.requiresImages ?? 0) >= 1)
            : false;
        const acceptsVideo = model
            ? model.supportedOps.some(op => (commands[op]?.requiresVideo  ?? 0) >= 1)
            : false;

        /** @type {Array<Function>} Cleanup functions, all run in destroy. */
        const _unsubs = [];

        // ── Media state ────────────────────────────────────────────────────────
        /** @type {Array<{id:string, url:string, file:File|null, mediaType:'image'|'video', source:'file'|'app'}>} */
        const _mediaItems = [];

        function _removeItem(id) {
            const idx = _mediaItems.findIndex(m => m.id === id);
            if (idx === -1) return;
            const item = _mediaItems.splice(idx, 1)[0];
            if (item.source === 'file') URL.revokeObjectURL(item.url);
            _emitMediaChange();
        }

        function _emitMediaChange() {
            el.imageCount = _mediaItems.filter(m => m.mediaType === 'image').length;
            el.videoCount = _mediaItems.filter(m => m.mediaType === 'video').length;
            _context = { ..._context, imageCount: el.imageCount, videoCount: el.videoCount };

            const hasMedia = el.imageCount > 0 || el.videoCount > 0;
            const curCmd = commands[activeOperation];
            const curIsTextOnly = curCmd && (curCmd.requiresImages ?? 0) === 0 && (curCmd.requiresVideo ?? 0) === 0;

            if (hasMedia && curIsTextOnly) {
                const fallback = _pickFallbackOp();
                if (fallback) {
                    el.setOperation(fallback);
                } else {
                    _refreshOpDropdown();
                }
            } else if (!hasMedia && curCmd && !curIsTextOnly) {
                const textOp = _pickTextOnlyOp();
                if (textOp) {
                    el.setOperation(textOp);
                } else {
                    _refreshOpDropdown();
                }
            } else {
                _refreshOpDropdown();
            }

            _renderStrip([..._mediaItems]);
            emit('media-change', { imageCount: el.imageCount, videoCount: el.videoCount, items: [..._mediaItems] });
        }

        function _tryAddMedia({ url, file, mediaType, source }) {
            const existing = _mediaItems.find(m => m.mediaType === mediaType);
            if (existing) _removeItem(existing.id);

            const item = { id: crypto.randomUUID(), url, file: file || null, mediaType, source };
            _mediaItems.push(item);
            _emitMediaChange();
        }

        // ── Drop events (on root el; overlay toggled via root modifier) ───────
        if (model) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
                _unsubs.push(on(el, ev, e => e.preventDefault()))
            );

            _unsubs.push(on(el, 'dragenter', () => el.classList.add('mpi-prompt-box--drag-over')));
            _unsubs.push(on(el, 'dragover',  () => el.classList.add('mpi-prompt-box--drag-over')));
            _unsubs.push(on(el, 'dragleave', (e) => {
                if (!el.contains(e.relatedTarget))
                    el.classList.remove('mpi-prompt-box--drag-over');
            }));

            _unsubs.push(on(el, 'drop', async (e) => {
                el.classList.remove('mpi-prompt-box--drag-over');

                const appData = e.dataTransfer.getData('application/mpi-media');
                if (appData) {
                    try {
                        const { filePath, type } = JSON.parse(appData);
                        if (type === 'image' && !acceptsImage) { _showIncompatibleToast(); return; }
                        if (type === 'video' && !acceptsVideo) { _showIncompatibleToast(); return; }
                        _tryAddMedia({ url: filePath, file: null, mediaType: type, source: 'app' });
                    } catch { /* malformed */ }
                    return;
                }

                const file = e.dataTransfer.files[0];
                if (!file) return;
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : null;
                if (!mediaType) return;
                if (mediaType === 'image' && !acceptsImage) { _showIncompatibleToast(); return; }
                if (mediaType === 'video' && !acceptsVideo) { _showIncompatibleToast(); return; }

                const project = state.currentProject;
                const uploaded = project
                    ? await uploadMediaFile(file, mediaType, project.folderPath, project.id)
                    : null;
                const fileUrl = uploaded
                    ? uploaded.filePath
                    : URL.createObjectURL(file);

                _tryAddMedia({ url: fileUrl, file, mediaType, source: 'file' });

                if (uploaded) {
                    emit('media-imported', { url: uploaded.filePath, filename: uploaded.filename, itemId: uploaded.itemId, mediaType, source: 'file' });
                    Events.emit('media:imported', { url: uploaded.filePath, filename: uploaded.filename, itemId: uploaded.itemId, thumbPath: uploaded.thumbPath, mediaType });
                }
            }));
        }

        // ── Public API ─────────────────────────────────────────────────────────
        el.imageCount    = 0;
        el.videoCount    = 0;
        el.getMediaItems = () => [..._mediaItems];
        el.clearMedia    = () => [..._mediaItems].forEach(m => _removeItem(m.id));
        el.removeMedia   = (id) => _removeItem(id);

        el.setOperation = (key) => {
            activeOperation = key;
            _refreshOpDropdown();
            _refreshOpSlot();
            _renderBadge();
            emit('operation-change', { operation: key });
        };

        el.updateContext = (ctx) => {
            _context = { ..._context, ...ctx };
            _refreshOpDropdown();
        };

        el.setGenerating = (active) => {
            isGenerating = active;
            runBtn.el.classList.toggle('is-active', active);
        };

        el.setModel = (newModel) => {
            model = newModel;
            _currentModelType = newModel?.mediaType ?? _currentModelType;
            if (_modelDropdown) {
                _modelDropdown.el.setOptions(
                    modelList.map(m => ({ value: m.id, label: m.name })),
                    newModel.id
                );
            }
            _refreshOpDropdown();
            _refreshOpSlot();
            _renderBadge();
        };

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

        // ── Show / hide ────────────────────────────────────────────────────────
        el.show = () => { el.classList.remove('hide'); _stripEl?.classList.remove('hide'); };
        el.hide = () => { el.classList.add('hide'); _stripEl?.classList.add('hide'); };

        // ── Media strip rendering ──────────────────────────────────────────────
        const _stripEl = document.createElement('div');
        _stripEl.className = 'mpi-prompt-box-media-strip';
        el.parentElement?.insertBefore(_stripEl, el);

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
                on(qs('.mpi-prompt-box-media-strip__remove', chip), 'click', (e) => {
                    e.stopPropagation();
                    el.removeMedia?.(item.id);
                });
                _stripEl.appendChild(chip);
            });
        }
        _renderStrip([]);

        const _onSetOperation = ({ operation }) => el.setOperation(operation);

        function _showIncompatibleToast() {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
            document.body.appendChild(wrapper);
            const toast = MpiToast.mount(wrapper, {
                message: 'Media type not supported for this model.',
                variant: 'warning',
                duration: 3000,
            });
            toast.on('close', () => wrapper.remove());
        }

        el.injectMedia = ({ url, mediaType }) => {
            if (mediaType === 'image' && !acceptsImage) { _showIncompatibleToast(); return false; }
            if (mediaType === 'video' && !acceptsVideo) { _showIncompatibleToast(); return false; }
            _tryAddMedia({ url, file: null, mediaType, source: 'app' });
            return true;
        };

        el.injectPrompts = ({ positive, negative }) => {
            positiveValue = positive ?? positiveValue;
            negativeValue = negative ?? negativeValue;
            if (!isNegativeMode) textareaEl.value = positiveValue;
            updateHeight();
        };
        const _onInjectPrompts = ({ positive, negative }) => el.injectPrompts({ positive, negative });

        let _currentModelType = props.model?.mediaType ?? props.modelList?.[0]?.mediaType ?? null;

        _unsubs.push(
            Events.on('workspace:set-operation', _onSetOperation),
            Events.on('workspace:inject-prompts', _onInjectPrompts),
            Events.on('promptbox:generation-end', () => el.setGenerating(false)),
            Events.on('state:changed', ({ key }) => {
                if (key !== 's_installedModelIds' || !_currentModelType) return;
                const updated = getModelsByType(_currentModelType).filter(m => m.installed !== false);
                el.setModelList(updated);
            }),
        );

        // ── Textarea ───────────────────────────────────────────────────────────
        const mainInput = MpiInput.mount(qs('#textarea-slot', el), {
            type: 'textarea',
            placeholder: 'Type your prompt...',
            value: positiveValue
        });

        const textareaEl = qs('textarea', mainInput.el);

        const updateHeight = () => {
            if (isExpansionLocked) { textareaEl.style.height = '3.5rem'; return; }
            textareaEl.style.height = 'auto';
            textareaEl.style.height = Math.min(Math.max(textareaEl.scrollHeight, 56), 224) + 'px';
        };

        _unsubs.push(on(textareaEl, 'input', () => {
            updateHeight();
            if (isNegativeMode) negativeValue = textareaEl.value;
            else positiveValue = textareaEl.value;
            emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
        }));

        setTimeout(updateHeight, 0);

        // ── Expansion lock ─────────────────────────────────────────────────────
        MpiButton.mount(qs('#expand-lock-slot', el), {
            icon: 'chevronDown', iconActive: 'chevronUp',
            info: 'Toggle Expanding Height',
            size: 'sm', variant: 'ghost', toggleable: true, active: !isExpansionLocked
        }).on('click', (data) => { isExpansionLocked = !data.active; updateHeight(); });

        // ── Copy button ────────────────────────────────────────────────────────
        MpiButton.mount(qs('#copy-btn-slot', el), {
            icon: 'copy', variant: 'ghost', size: 'sm', info: 'Copy current Text to Clipboard'
        }).on('click', () => {
            navigator.clipboard.writeText(textareaEl.value);
            emit('copy', { text: textareaEl.value });
        });

        // ── Settings popup (portaled) ──────────────────────────────────────────
        const popupEl = document.createElement('div');
        popupEl.innerHTML = MpiPopup.template({ active: false, position: 'top' }, `
            <div class="mpi-prompt-box__settings">
                <div class="mpi-prompt-box__settings-header">
                    ${MpiBadge.template({ label: 'SETTINGS', variant: 'secondary' })}
                </div>
                <div class="mpi-prompt-box__settings-grid">
                    <div class="mpi-prompt-box__settings-row" id="settings-model-slot"></div>
                    <div class="mpi-prompt-box__settings-row" id="settings-op-dropdown-slot"></div>
                    <div class="mpi-prompt-box__settings-row" id="settings-op-slot"></div>
                </div>
            </div>
        `).trim();
        const popupNode = popupEl.firstChild;
        document.body.appendChild(popupNode);

        let popupActive = false;
        let leaveTimer = null;

        const positionPopup = () => {
            const rect = badgeBtn.el.getBoundingClientRect();
            popupNode.style.bottom = `${window.innerHeight - rect.top + 12}px`;
            popupNode.style.left   = `${rect.left + rect.width / 2}px`;
            popupNode.style.top    = '';

            // Clamp to viewport after layout (CSS translateX(-50%) centers on left).
            requestAnimationFrame(() => {
                const pr = popupNode.getBoundingClientRect();
                const margin = 8;
                const overflowLeft  = margin - pr.left;
                const overflowRight = pr.right - (window.innerWidth - margin);
                if (overflowLeft > 0)  popupNode.style.left = `${parseFloat(popupNode.style.left) + overflowLeft}px`;
                if (overflowRight > 0) popupNode.style.left = `${parseFloat(popupNode.style.left) - overflowRight}px`;
            });
        };

        const openPopup = () => {
            popupActive = true;
            positionPopup();
            popupNode.classList.add('is-active');
            badgeBtn.el.classList.add('is-active');
        };
        const closePopup = () => {
            popupActive = false;
            popupNode.classList.remove('is-active');
            badgeBtn.el.classList.remove('is-active');
        };

        const cancelClose = () => { clearTimeout(leaveTimer); leaveTimer = null; };
        const scheduleClose = () => { /* hover-close disabled — see outside-click handler below */ };

        // ── Settings badge (trigger) ───────────────────────────────────────────
        const badgeSlot = qs('#settings-badge-slot', el);
        const badgeBtn = MpiButton.mount(badgeSlot, {
            variant: 'ghost', size: 'sm',
            toggleable: true,
            info: 'Open model & operation settings',
            extraClasses: 'mpi-prompt-box__settings-trigger',
        });
        // Replace empty button content with a badge span we can update.
        const badgeHost = document.createElement('span');
        badgeHost.className = 'mpi-prompt-box__settings-badge-host';
        badgeBtn.el.appendChild(badgeHost);

        function _renderBadge() {
            const modelName = model?.name ?? '—';
            const opLabel   = commands[activeOperation]?.label ?? activeOperation;
            badgeHost.innerHTML = MpiBadge.template({
                label: `${modelName} · ${opLabel}`,
                variant: 'secondary',
            });
        }

        badgeBtn.on('click', () => {
            if (popupActive) closePopup(); else openPopup();
        });

        // Outside-click dismiss (hover-close removed to avoid multi-popup churn).
        // Popup stays open until user clicks outside or presses Escape.
        const onPopupOutsideClick = (e) => {
            if (!popupActive) return;
            if (popupNode.contains(e.target) || badgeBtn.el.contains(e.target)) return;
            // Ignore clicks inside any portaled child surface (dropdown list,
            // nested popup like MpiRatioSelector's). These are logically inside
            // our popup but live in document.body due to portaling.
            if (e.target.closest?.('.mpi-dropdown__list')) return;
            if (e.target.closest?.('.mpi-popup')) return;
            closePopup();
        };
        _unsubs.push(on(document, 'click', onPopupOutsideClick));
        void cancelClose; void scheduleClose;

        _unsubs.push(Events.on('ui:close-all-popups', () => {
            if (popupActive) closePopup();
        }));

        // ── Settings popup content ─────────────────────────────────────────────
        const modelSlot      = qs('#settings-model-slot', popupNode);
        const opDropdownSlot = qs('#settings-op-dropdown-slot', popupNode);
        const opSlot         = qs('#settings-op-slot', popupNode);

        if (model) {
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
                modelSlot.appendChild(_modelDropdown.el);
            }

            if (props.showSettings !== false) {
                const gearBtn = MpiButton.mount(document.createElement('div'), {
                    icon: 'settings', variant: 'ghost', size: 'sm', info: 'Model Settings',
                });
                gearBtn.on('click', () => emit('settings', { model }));
                modelSlot.appendChild(gearBtn.el);
            }
        }

        // Download manager (always available)
        const downloadManagerBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'download', variant: 'ghost', size: 'sm', info: 'Open Download Manager',
        });
        downloadManagerBtn.on('click', () => Events.emit('models:open', {}));
        modelSlot.appendChild(downloadManagerBtn.el);

        function _pickTextOnlyOp() {
            if (!model) return null;
            const cmds = getAvailableCommands(model.mediaType, model, _context);
            const textOnly = cmds.filter(c => (c.requiresImages ?? 0) === 0 && (c.requiresVideo ?? 0) === 0);
            return textOnly[0]?.key ?? null;
        }

        function _pickFallbackOp() {
            if (!model) return null;
            const cmds = getAvailableCommands(model.mediaType, model, _context);
            const candidates = cmds.filter(c => (c.requiresImages ?? 0) > 0 || (c.requiresVideo ?? 0) > 0);
            const ready = candidates.find(c => c.available);
            return (ready ?? candidates[0])?.key ?? null;
        }

        function _refreshOpDropdown() {
            if (!model) return;
            if (!opDropdownSlot) return;

            const hasMedia = el.imageCount > 0 || el.videoCount > 0;
            const availableCmds = getAvailableCommands(model.mediaType, model, _context);
            const filteredCmds = _context.filterNoInputOps
                ? availableCmds.filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                : availableCmds;
            const availableOps = filteredCmds.map(cmd => {
                const isTextOnly = (cmd.requiresImages ?? 0) === 0 && (cmd.requiresVideo ?? 0) === 0;
                const disabled = !cmd.available || (hasMedia && isTextOnly);
                return { value: cmd.key, label: cmd.label, disabled };
            });

            opDropdownSlot.innerHTML = '';
            if (availableOps.length === 0) return;

            const labelEl = document.createElement('span');
            labelEl.className = 'mpi-prompt-box__op-label';
            labelEl.textContent = 'Op:';
            labelEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-right:0.25rem;';

            _opDropdown = MpiDropdown.mount(document.createElement('div'), {
                options: availableOps,
                value: activeOperation,
                info: 'Operation',
                direction: 'up',
            });
            _opDropdown.on('change', ({ value }) => el.setOperation(value));

            opDropdownSlot.appendChild(labelEl);
            opDropdownSlot.appendChild(_opDropdown.el);
        }

        function _refreshOpSlot() {
            if (!opSlot) return;
            opSlot.innerHTML = '';
            _activeControls.clear();

            const componentIds = getCommandComponents(activeOperation);

            for (const componentId of componentIds) {
                const ctrl = PROMPT_BOX_CONTROLS[componentId];
                if (!ctrl) continue;

                const ctrlEl = document.createElement('div');
                ctrlEl.style.display = 'contents';
                opSlot.appendChild(ctrlEl);

                ctrl.mount(ctrlEl, { model });
                _activeControls.set(componentId, ctrl);
            }
        }

        // ── Negative mode toggle ───────────────────────────────────────────────
        if (props.includeNegative) {
            MpiButton.mount(qs('#bottom-right-slot', el), {
                icon: 'check', iconActive: 'negative',
                info: 'Switch between Positive and Negative Prompt',
                size: 'md', variant: 'primary', toggleable: true, active: isNegativeMode
            }).on('click', (data) => {
                isNegativeMode = data.active;
                textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
                textareaEl.placeholder = isNegativeMode ? 'Type negative prompt...' : 'Type your prompt...';
                updateHeight();
                emit('mode-change', { mode: isNegativeMode ? 'negative' : 'positive' });
            });
        }

        // ── Run / Stop ─────────────────────────────────────────────────────────
        const runBtnSlot = document.createElement('div');
        qs('#bottom-right-slot', el).appendChild(runBtnSlot);

        const runBtn = MpiButton.mount(runBtnSlot, {
            icon: 'play', iconActive: 'stop',
            info: 'Generate / Stop',
            size: 'md', variant: 'primary',
            toggleable: true, active: isGenerating,
        });

        runBtn.on('toggle', (data) => {
            if (data.active) {
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
                isGenerating = false;
                emit('cancel', {});
            }
        });

        // ── Initialise ─────────────────────────────────────────────────────────
        _refreshOpDropdown();
        _refreshOpSlot();
        _renderBadge();

        // ── Portaled popup teardown on el removal ──────────────────────────────
        const domObserver = new MutationObserver(() => {
            if (!document.contains(el)) {
                if (popupNode.parentNode) popupNode.parentNode.removeChild(popupNode);
                domObserver.disconnect();
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // ── Cleanup ─────────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            domObserver.disconnect();
            if (popupNode.parentNode) popupNode.parentNode.removeChild(popupNode);
            _stripEl.remove();
            el.remove();
        };
    }
});
