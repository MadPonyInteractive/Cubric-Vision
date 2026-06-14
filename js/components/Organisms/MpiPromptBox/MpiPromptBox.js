import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands, getAvailableCommands, getCommandComponents, getCommandMediaInputs } from '../../../data/commandRegistry.js';
import { PROMPT_BOX_CONTROLS, getInjectionParamsFromControls } from './PromptBoxControls.js';
import { state } from '../../../state.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs, on } from '../../../utils/dom.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { activeGenerations } from '../../../services/activeGenerations.js';

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
 *   el.injectMedia({ url, mediaType, role? })  — role tags chip to a slot key (e.g. 'startFrame', 'endFrame')
 *   el.getMediaByRole(role)         — returns role-assigned item or undefined
 *   el.removeMediaByRole(role)      — removes the chip currently assigned to that role
 *   el.swapMediaRoles(roleA, roleB) — flips role tags between two chips (no re-upload)
 *   el.remainingCapacity(mediaType) → number of free media slots for type
 *                                     under the current operation
 *   el.injectPrompts({ positive, negative })
 *   el.setOperation(key)
 *   el.setGenerating(bool)
 *   el.updateContext(ctx)
 *   el.setModel(model)
 *   el.setModelList(list)
 *
 * Emits:
 *   'input' | 'mode-change' | 'media-change' | 'media-imported'
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

            <div class="mpi-prompt-box__col mpi-prompt-box__col--neg" id="bottom-neg-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--prompt" id="textarea-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--settings" id="settings-badge-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--run" id="bottom-right-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        let isExpansionLocked = state.promptExpanded === false;
        let isNegativeMode    = false;
        let positiveValue     = props.value || '';
        let negativeValue     = props.negativeValue || '';
        let activeOperation   = props.operation || 't2i';
        let isGenerating      = props.generating || false;
        let _remoteTransitioning = false; // MPI-73: remote engine connecting/disconnecting — block Cue
        let _context          = props.context || {};

        /** @type {Map<string, Object>} */
        const _activeControls = new Map();

        let runSlotEl = null;
        let runBtn = null;
        let stopBtn = null;
        let clearBtn = null;

        // ── Hold-to-loop state ────────────────────────────────────────────────
        const HOLD_THRESHOLD_MS = 700;
        let _holdTimer = null;
        let _holdStartTs = 0;
        let _holdDidArm = false;       // True if current pointerdown reached threshold (suppresses click).
        let _holdSuppressClick = false; // Carry-over flag set when threshold reached, reset on next click handler.

        let model = props.model || null;
        let modelList = props.modelList || [];
        let _modelDropdown = null;
        let _opDropdown = null;

        /** @type {Array<Function>} Cleanup functions, all run in destroy. */
        const _unsubs = [];

        // ── Media state ────────────────────────────────────────────────────────
        /** @type {Array<{id:string, url:string, file:File|null, mediaType:'image'|'video'|'audio', source:'file'|'app', role?:string}>} */
        const _mediaItems = [];

        function _mediaSlotsForOperation(operation = activeOperation) {
            return getCommandMediaInputs(operation);
        }

        function _maxMediaForOperation(operation, mediaType) {
            const slots = _mediaSlotsForOperation(operation).filter(slot => slot.mediaType === mediaType);
            if (slots.length) return slots.length;
            const cmd = commands[operation];
            if (!cmd) return 0;
            if (mediaType === 'image') return Math.max(0, Number(cmd.requiresImages) || 0);
            if (mediaType === 'video') return Math.max(0, Number(cmd.requiresVideo) || 0);
            return 0;
        }

        function _maxMediaForCurrentOperation(mediaType) {
            const activeMax = _maxMediaForOperation(activeOperation, mediaType);
            if (activeMax > 0) return activeMax;
            if (!model?.supportedOps?.length) return 0;
            return model.supportedOps.reduce((max, op) => Math.max(max, _maxMediaForOperation(op, mediaType)), 0);
        }

        function _acceptsMediaType(mediaType) {
            return _maxMediaForCurrentOperation(mediaType) > 0;
        }

        function _withAssignedRoles(items = _mediaItems, operation = activeOperation) {
            const slots = _mediaSlotsForOperation(operation);
            if (!slots.length) return items.map(item => ({ ...item }));

            const usedIds = new Set();
            const assigned = new Map();
            const nextItems = items.map(item => ({ ...item, role: item.role || undefined }));

            for (const slot of slots) {
                const explicit = nextItems.find(item =>
                    item.role === slot.key &&
                    item.mediaType === slot.mediaType &&
                    !usedIds.has(item.id)
                );
                if (!explicit) continue;
                usedIds.add(explicit.id);
                assigned.set(slot.key, explicit);
            }

            for (const slot of slots) {
                if (assigned.has(slot.key)) continue;
                const item = nextItems.find(candidate =>
                    candidate.mediaType === slot.mediaType &&
                    !usedIds.has(candidate.id)
                );
                if (!item) continue;
                item.role = slot.key;
                usedIds.add(item.id);
                assigned.set(slot.key, item);
            }

            return nextItems;
        }

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
            el.audioCount = _mediaItems.filter(m => m.mediaType === 'audio').length;
            _context = { ..._context, imageCount: el.imageCount, videoCount: el.videoCount, audioCount: el.audioCount };

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

            const renderedItems = _withAssignedRoles();
            _renderStrip(renderedItems);
            emit('media-change', { imageCount: el.imageCount, videoCount: el.videoCount, audioCount: el.audioCount, items: renderedItems });
        }

        function _tryAddMedia({ url, file, mediaType, source, role }) {
            const maxCount = _maxMediaForCurrentOperation(mediaType);
            if (maxCount <= 0) { _showIncompatibleToast(); return; }

            const sameType = _mediaItems.filter(m => m.mediaType === mediaType);
            // Role-aware replacement: if the new item carries an explicit role,
            // displace any existing item already tagged with that role first
            // (so "Set as end frame" overwrites a prior end-frame chip
            // regardless of capacity).
            if (role) {
                const sameRole = _mediaItems.find(m => m.role === role && m.mediaType === mediaType);
                if (sameRole) _removeItem(sameRole.id);
            }

            const afterRoleDrop = _mediaItems.filter(m => m.mediaType === mediaType);
            if (maxCount === 1) {
                afterRoleDrop.forEach(item => _removeItem(item.id));
            } else if (afterRoleDrop.length >= maxCount) {
                _removeItem(afterRoleDrop[0].id);
            }

            const item = { id: crypto.randomUUID(), url, file: file || null, mediaType, source };
            if (role) item.role = role;
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
                        if (!_acceptsMediaType(type)) { _showIncompatibleToast(); return; }
                        _tryAddMedia({ url: filePath, file: null, mediaType: type, source: 'app' });
                    } catch { /* malformed */ }
                    return;
                }

                const file = e.dataTransfer.files[0];
                if (!file) return;
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : file.type.startsWith('audio/') ? 'audio'
                                : null;
                if (!mediaType) return;
                if (!_acceptsMediaType(mediaType)) { _showIncompatibleToast(); return; }

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
                    Events.emit('media:imported', {
                        url: uploaded.filePath,
                        filename: uploaded.filename,
                        itemId: uploaded.itemId,
                        thumbPath: uploaded.thumbPath,
                        pixelDimensions: uploaded.pixelDimensions,
                        mediaType,
                    });
                }
            }));
        }

        // ── Public API ─────────────────────────────────────────────────────────
        el.imageCount    = 0;
        el.videoCount    = 0;
        el.getMediaItems = () => _withAssignedRoles();
        el.clearMedia    = () => [..._mediaItems].forEach(m => _removeItem(m.id));
        el.removeMedia   = (id) => _removeItem(id);
        el.getMediaByRole = (role) => _withAssignedRoles().find(m => m.role === role);
        el.removeMediaByRole = (role) => {
            const item = _withAssignedRoles().find(m => m.role === role);
            if (item) _removeItem(item.id);
        };
        el.swapMediaRoles = (roleA, roleB) => {
            const assigned = _withAssignedRoles();
            const a = assigned.find(m => m.role === roleA);
            const b = assigned.find(m => m.role === roleB);
            if (!a && !b) return;
            // Mutate the live _mediaItems so role tags flip without re-upload.
            const liveA = a ? _mediaItems.find(m => m.id === a.id) : null;
            const liveB = b ? _mediaItems.find(m => m.id === b.id) : null;
            if (liveA) liveA.role = roleB;
            if (liveB) liveB.role = roleA;
            _emitMediaChange();
        };

        el.setOperation = (key) => {
            activeOperation = key;
            _refreshOpDropdown();
            _refreshOpSlot();
            _renderBadge();
            emit('operation-change', { operation: key });
        };

        el.updateContext = (ctx) => {
            const prevHistoryMode = _context.historyMode === true;
            _context = { ..._context, ...ctx };
            _refreshOpDropdown();
            const nextHistoryMode = _context.historyMode === true;
            if (prevHistoryMode !== nextHistoryMode) {
                el.classList.toggle('mpi-prompt-box--history-mode', nextHistoryMode);
                _refreshOpSlot();
            }
        };

        el.setGenerating = (active) => {
            isGenerating = active;
            // Cue cluster only — Stop + Clear disabled-state mirror activity.
            stopBtn?.el?.setDisabled?.(!active);
            clearBtn?.el?.setDisabled?.(!active);
        };

        function _pickOpForModel(candidate) {
            if (!candidate?.supportedOps?.length) return activeOperation;
            const supported = candidate.supportedOps;
            const cmds = getAvailableCommands(candidate.mediaType, candidate, _context);
            const byKey = new Map(cmds.map(c => [c.key, c]));
            const hasImages = (el.imageCount ?? 0) > 0;
            const hasVideo  = (el.videoCount  ?? 0) > 0;
            const hasMedia  = hasImages || hasVideo;

            const matches = (cmd) => {
                if (!cmd) return false;
                if (hasImages && (cmd.requiresImages ?? 0) === 0) return false;
                if (hasVideo  && (cmd.requiresVideo  ?? 0) === 0) return false;
                if (!hasMedia && ((cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)) return false;
                return true;
            };

            const currentCmd = byKey.get(activeOperation);
            if (supported.includes(activeOperation) && matches(currentCmd)) return activeOperation;

            const ranked = supported.map(k => byKey.get(k)).filter(Boolean);
            const ready = ranked.find(c => matches(c) && c.available);
            if (ready) return ready.key;
            const fit = ranked.find(c => matches(c));
            if (fit) return fit.key;
            return supported[0];
        }

        function _modelDropdownOptions() {
            return modelList.map(m => ({
                value: m.id,
                label: m.name,
                meta: m.dropdownMeta || '',
            }));
        }

        el.setModel = (newModel) => {
            model = newModel;
            _currentModelType = newModel?.mediaType ?? _currentModelType;
            const picked = _pickOpForModel(newModel);
            if (_modelDropdown) {
                _modelDropdown.el.setOptions(
                    _modelDropdownOptions(),
                    newModel.id
                );
            }
            if (picked && picked !== activeOperation) {
                el.setOperation(picked);
            } else {
                _refreshOpDropdown();
                _refreshOpSlot();
                _renderBadge();
            }
            if (typeof _refreshRunLabel === 'function') _refreshRunLabel();
        };

        el.setModelList = (newModelList) => {
            modelList = newModelList;

            // If current model no longer in list (e.g. uninstalled), pick first available
            // and propagate change so badge, op dropdown, and consumers stay in sync.
            const stillPresent = model && modelList.some(m => m.id === model.id);
            let nextOp = activeOperation;
            if (!stillPresent) {
                const next = modelList[0] ?? null;
                model = next;
                _currentModelType = next?.mediaType ?? _currentModelType;
                if (next) {
                    nextOp = _pickOpForModel(next) ?? next.supportedOps?.[0] ?? activeOperation;
                    emit('model-change', { model: next });
                }
            } else if (model) {
                nextOp = _pickOpForModel(model) ?? activeOperation;
            }

            // Guard: activeOperation may be invalid for current model (e.g. mixed image/video lists)
            if (model && !model.supportedOps?.includes(nextOp)) {
                nextOp = model.supportedOps?.[0] ?? nextOp;
            }

            if (_modelDropdown) {
                _modelDropdown.el.setOptions(
                    _modelDropdownOptions(),
                    model?.id ?? null
                );
            }
            if (nextOp !== activeOperation) {
                el.setOperation(nextOp);
            } else {
                _refreshOpDropdown();
                _refreshOpSlot();
                _renderBadge();
            }
        };

        // ── Show / hide ────────────────────────────────────────────────────────
        el.show = () => { el.classList.remove('hide'); _stripEl?.classList.remove('hide'); };
        el.hide = () => { el.classList.add('hide'); _stripEl?.classList.add('hide'); };

        // ── Media strip rendering ──────────────────────────────────────────────
        const _stripEl = document.createElement('div');
        _stripEl.className = 'mpi-prompt-box-media-strip';
        el.prepend(_stripEl);

        function _renderStrip(items) {
            if (!_stripEl) return;
            _stripEl.innerHTML = '';
            items.forEach(item => {
                const chip = document.createElement('div');
                chip.className = `mpi-prompt-box-media-strip__chip mpi-prompt-box-media-strip__chip--${item.mediaType}`;
                chip.dataset.id = item.id;
                chip.draggable = false;
                const mediaHtml = item.mediaType === 'image'
                    ? `<img src="${item.url}" class="mpi-prompt-box-media-strip__thumb" alt="" draggable="false">`
                    : item.mediaType === 'video'
                        ? `<video src="${item.url}" class="mpi-prompt-box-media-strip__thumb" muted playsinline preload="metadata" draggable="false"></video>
                           <span class="mpi-prompt-box-media-strip__type">${renderIcon('video', 'xs')}</span>`
                        : `<div class="mpi-prompt-box-media-strip__audio-thumb">${renderIcon('audio', 'sm')}</div>
                           <span class="mpi-prompt-box-media-strip__type">${renderIcon('audio', 'xs')}</span>`;
                chip.innerHTML = `
                    ${mediaHtml}
                    <button class="mpi-prompt-box-media-strip__remove" title="Remove">${renderIcon('close', 'xs')}</button>
                `;
                // Belt + suspenders: kill any drag that escapes draggable=false
                // (browsers ignore the attr on some media elements during specific
                // gesture sequences). Prevents the strip from acting as a source
                // for OS-style file drags that would re-import on the gallery.
                chip.addEventListener('dragstart', (e) => e.preventDefault());
                on(qs('.mpi-prompt-box-media-strip__remove', chip), 'click', (e) => {
                    e.stopPropagation();
                    el.removeMedia?.(item.id);
                });
                _stripEl.appendChild(chip);
            });
        }
        _renderStrip([]);

        // Init-time history-mode class (props.context may carry historyMode at mount)
        if (_context.historyMode === true) el.classList.add('mpi-prompt-box--history-mode');

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

        el.injectMedia = ({ url, mediaType, role }) => {
            if (!_acceptsMediaType(mediaType)) { _showIncompatibleToast(); return false; }
            _tryAddMedia({ url, file: null, mediaType, source: 'app', role });
            return true;
        };

        // Remaining slots for `mediaType` under the current operation. Used by
        // callers performing bulk imports to know how many they can inject
        // before overflow eviction kicks in.
        el.remainingCapacity = (mediaType) => {
            const max = _maxMediaForCurrentOperation(mediaType);
            if (max <= 0) return 0;
            const used = _mediaItems.filter(m => m.mediaType === mediaType).length;
            return Math.max(0, max - used);
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
            // Operation changes are driven by the parent block's
            // `workspace:set-operation` handler — the block validates the op
            // against the active model + context (mask, media counts) and then
            // calls `el.setOperation()`. PromptBox does NOT subscribe directly,
            // to avoid two sources of truth (block-validated vs raw event).
            Events.on('workspace:inject-prompts', _onInjectPrompts),
            Events.on('promptbox:generation-end', () => el.setGenerating(false)),
            // Note: model list management is owned by the parent block (gallery /
            // history workspace). They call el.setModelList() with the appropriate
            // mediaType-scoped or all-installed list. Don't double-update here.
        );

        // ── Textarea ───────────────────────────────────────────────────────────
        const mainInput = MpiInput.mount(qs('#textarea-slot', el), {
            type: 'textarea',
            placeholder: 'Type your prompt...',
            value: positiveValue
        });

        const textareaEl = qs('textarea', mainInput.el);

        // Hidden mirror textarea — measures content height without fighting
        // the live textarea's CSS min-height/layout cache. scrollHeight on the
        // live element refused to shrink after deletes (layout box vs intrinsic
        // content mismatch). Mirror is offscreen, gets the same width + text
        // styling at measure time, then we read its scrollHeight as ground
        // truth for current value.
        const _heightProbe = document.createElement('textarea');
        _heightProbe.setAttribute('aria-hidden', 'true');
        _heightProbe.tabIndex = -1;
        _heightProbe.style.cssText =
            'position:absolute;left:-9999px;top:-9999px;visibility:hidden;' +
            'height:0;min-height:0;max-height:none;overflow:hidden;' +
            'border:0;padding:0;margin:0;resize:none;';
        document.body.appendChild(_heightProbe);

        const updateHeight = () => {
            if (isExpansionLocked) { textareaEl.style.height = '32px'; return; }
            // Copy text + width-relevant styles into the probe and read its
            // scrollHeight. This sidesteps the live textarea's min-height /
            // layout-cache trap where scrollHeight returns the previous
            // expanded height instead of the current content height.
            const cs = getComputedStyle(textareaEl);
            _heightProbe.style.width      = textareaEl.clientWidth + 'px';
            _heightProbe.style.font       = cs.font;
            _heightProbe.style.lineHeight = cs.lineHeight;
            _heightProbe.style.padding    = cs.padding;
            _heightProbe.style.boxSizing  = cs.boxSizing;
            _heightProbe.style.letterSpacing = cs.letterSpacing;
            _heightProbe.value = textareaEl.value;
            const sh = _heightProbe.scrollHeight;
            const prevScroll = textareaEl.scrollTop;
            textareaEl.style.height = Math.min(Math.max(sh, 32), 224) + 'px';
            textareaEl.scrollTop = prevScroll;
        };
        _unsubs.push(() => _heightProbe.remove());

        _unsubs.push(on(textareaEl, 'input', () => {
            updateHeight();
            if (isNegativeMode) negativeValue = textareaEl.value;
            else positiveValue = textareaEl.value;
            emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
        }));

        // Escape blurs the textarea so app-level hotkeys regain focus.
        // Registered via Hotkeys (allowWhileTyping + when-gate scoped to this
        // textarea) so it composes with other escape handlers instead of
        // bypassing the registry. See hotkeyRegistry.js 'promptBox.blur'.
        _unsubs.push(Hotkeys.bind('promptBox.blur', () => textareaEl.blur()));

        setTimeout(updateHeight, 0);

        // ── Expansion lock ─────────────────────────────────────────────────────
        MpiButton.mount(qs('#expand-lock-slot', el), {
            icon: 'chevronDown', iconActive: 'chevronUp',
            info: 'Toggle Expanding Height',
            size: 'sm', variant: 'ghost', toggleable: true, active: !isExpansionLocked
        }).on('click', (data) => {
            isExpansionLocked = !data.active;
            state.promptExpanded = !isExpansionLocked;
            updateHeight();
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
            variant: 'secondary', size: 'sm',
            toggleable: true,
            info: 'Open model & operation settings',
            extraClasses: 'mpi-prompt-box__settings-trigger',
        });
        // Replace empty button content with a badge span we can update.
        const badgeHost = document.createElement('span');
        badgeHost.className = 'mpi-prompt-box__settings-badge-host';
        badgeBtn.el.appendChild(badgeHost);

        function _renderBadge() {
            const modelName  = model?.name ?? '—';
            const opLabel    = commands[activeOperation]?.label ?? activeOperation;
            const batchCtrl  = _activeControls.get('batch');
            const batchCount = batchCtrl ? parseInt(batchCtrl.getValue(), 10) : 1;
            const batchTag   = batchCount > 1
                ? `<span class="mpi-prompt-box__badge-batch">×${batchCount}</span>`
                : '';
            badgeHost.innerHTML = `
                <span class="mpi-prompt-box__badge-line">
                    <span class="mpi-prompt-box__badge-model">${modelName}</span>
                    <span class="mpi-prompt-box__badge-sep">·</span>
                    <span class="mpi-prompt-box__badge-op">${opLabel}</span>
                </span>
                ${batchTag}
            `;
        }

        _unsubs.push(Events.on('settings:shared:update', ({ key }) => { if (key === 'batch') _renderBadge(); }));

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
                    options:   _modelDropdownOptions(),
                    value:     model.id,
                    info:      'Active model',
                    direction: 'up',
                    extraClasses: 'mpi-dropdown--model-select',
                    wrapLabels: true,
                });
                _modelDropdown.on('change', ({ value }) => {
                    const selected = modelList.find(m => m.id === value);
                    if (selected) {
                        el.setModel(selected);
                        Events.emit('settings:model:select', { modelId: selected.id });
                        emit('model-change', { model: selected });
                        requestAnimationFrame(() => {
                            if (document.contains(el)) openPopup();
                        });
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
                info: 'Current model operation - Also accessible by holding Tab',
                direction: 'up',
            });
            _opDropdown.on('change', ({ value }) => el.setOperation(value));

            opDropdownSlot.appendChild(labelEl);
            opDropdownSlot.appendChild(_opDropdown.el);
        }

        function _refreshOpSlot() {
            if (!opSlot) return;
            for (const ctrl of _activeControls.values()) {
                try { ctrl.destroy?.(); } catch {}
            }
            opSlot.innerHTML = '';
            _activeControls.clear();

            const componentIds = getCommandComponents(activeOperation);

            for (const componentId of componentIds) {
                const ctrl = PROMPT_BOX_CONTROLS[componentId];
                if (!ctrl) continue;

                // History workspace forces single-stage execution; the
                // multi-stage preview toggle is never shown there. Persisted
                // per-model previewStage value is left untouched so the toggle
                // restores in gallery contexts.
                if (componentId === 'previewStage' && _context.historyMode === true) continue;

                const ctrlEl = document.createElement('div');
                ctrlEl.style.display = 'contents';
                opSlot.appendChild(ctrlEl);

                try {
                    ctrl.mount(ctrlEl, { model, opName: activeOperation });
                    _activeControls.set(componentId, ctrl);
                } catch (err) {
                    clientLogger.error('PromptBox', `Control "${componentId}" mount failed`, err);
                }
            }
        }

        // ── Negative mode toggle ───────────────────────────────────────────────
        if (props.includeNegative) {
            MpiButton.mount(qs('#bottom-neg-slot', el), {
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

        // ── Run / Stop ─────────────────────────────────────────────────────────
        runSlotEl = qs('#bottom-right-slot', el);

        // Label rules:
        //   loopArmed=false, depth=0  → 'Cue'
        //   loopArmed=false, depth>0  → 'Cue xN'
        //   loopArmed=true,  depth<=1 → 'Loop'        (steady-state loop = 1 active dispatch, no real backlog)
        //   loopArmed=true,  depth>=2 → 'Loop xN'     (backlog draining before loop reaches steady-state)
        const _runLabel = (count = state.generationQueueCount || 0) => {
            const armed = !!state.loopArmed;
            const n = Math.max(0, Number(count) || 0);
            if (armed) return n >= 2 ? `Loop x${n}` : 'Loop';
            return n > 0 ? `Cue x${n}` : 'Cue';
        };

        el.getRunPayload = () => {
            const injectionParams = getInjectionParamsFromControls(_activeControls);
            const previewCtrl = _activeControls.get('previewStage');
            const historyMode = _context.historyMode === true;
            const previewOnly = !historyMode && previewCtrl?.getValue?.() === true;
            return {
                operation:  activeOperation,
                positive:   positiveValue,
                negative:   negativeValue,
                mediaItems: el.getMediaItems(),
                injectionParams,
                previewOnly,
                historyMode,
            };
        };

        const _emitRun    = () => emit('run', el.getRunPayload());
        const _emitCancel = () => emit('cancel', {});

        // Seed: if loop just armed but nothing is running/pending, kick off
        // one job so the dispatcher has something to re-fire from.
        const _seedLoopIfIdle = () => {
            if (!state.loopArmed) return;
            if ((state.generationQueueCount || 0) > 0) return;
            isGenerating = true;
            stopBtn?.el?.setDisabled?.(false);
            clearBtn?.el?.setDisabled?.(false);
            _emitRun();
        };

        function _refreshRunLabel() {
            runBtn?.el?.setLabel?.(_runLabel());
            runBtn?.el?.classList.toggle('mpi-prompt-box__cue-btn--armed', !!state.loopArmed);
        }

        function _renderRunCluster() {
            if (!runSlotEl) return;
            runSlotEl.innerHTML = '';
            runBtn = null;
            stopBtn = null;
            clearBtn = null;

            // Idle reconcile — fresh mount must not show stale active flag.
            // Consult activeGenerations too: long-running jobs (e.g. video) can
            // outlive the Cue queue depth, so depth=0 alone doesn't mean idle.
            // Parent block may still re-assert setGenerating(true) post-mount
            // for block-owned busy state (continue / stage2 branches).
            const _anyRunning = activeGenerations.list().some(e => e.status === 'running');
            if ((state.generationQueueCount || 0) === 0 && !_anyRunning) isGenerating = false;
            else if (_anyRunning) isGenerating = true;

            const runHost   = document.createElement('div');
            const stopHost  = document.createElement('div');
            const clearHost = document.createElement('div');
            runSlotEl.appendChild(runHost);
            runSlotEl.appendChild(stopHost);
            runSlotEl.appendChild(clearHost);

            runBtn = MpiButton.mount(runHost, {
                icon: 'play',
                info: 'Tap to cue. Hold to toggle loop.',
                size: 'sm', variant: 'primary',
                label: _runLabel(),
                extraClasses: 'mpi-prompt-box__cue-btn',
            });
            // Charge-fill sweep element (CSS scaleX 0→1 over HOLD_THRESHOLD_MS).
            const fillEl = document.createElement('span');
            fillEl.className = 'mpi-prompt-box__cue-fill';
            runBtn.el.appendChild(fillEl);

            // Tap = enqueue. Hold ≥700ms = toggle loopArmed (suppresses click).
            const _resetFill = () => {
                fillEl.style.transition = 'none';
                fillEl.style.transform = 'scaleX(0)';
                // Force reflow so next transition takes effect.
                void fillEl.offsetWidth;
            };
            const _cancelHold = () => {
                if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
                _holdDidArm = false;
                _resetFill();
            };
            on(runBtn.el, 'pointerdown', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                if (runBtn.el.hasAttribute('disabled')) return;
                // Loop already armed: ignore hold gesture (no charge anim, no toggle).
                if (state.loopArmed) return;
                _holdStartTs = Date.now();
                _holdDidArm = false;
                _resetFill();
                fillEl.style.transition = `transform ${HOLD_THRESHOLD_MS}ms linear`;
                fillEl.style.transform = 'scaleX(1)';
                _holdTimer = setTimeout(() => {
                    _holdDidArm = true;
                    _holdSuppressClick = true;
                    state.loopArmed = true;
                    _holdTimer = null;
                    _seedLoopIfIdle();
                }, HOLD_THRESHOLD_MS);
            });
            on(runBtn.el, 'pointerup',     _cancelHold);
            on(runBtn.el, 'pointerleave',  _cancelHold);
            on(runBtn.el, 'pointercancel', _cancelHold);

            runBtn.on('click', () => {
                // Suppress click that came from a hold-to-arm gesture.
                if (_holdSuppressClick) { _holdSuppressClick = false; return; }
                // Tap while loopArmed = disarm loop. Current job + pending continue.
                if (state.loopArmed) {
                    state.loopArmed = false;
                    return;
                }
                isGenerating = true;
                stopBtn?.el?.setDisabled?.(false);
                clearBtn?.el?.setDisabled?.(false);
                runBtn.el.setLabel?.(_runLabel((state.generationQueueCount || 0) + 1));
                _emitRun();
            });

            stopBtn = MpiButton.mount(stopHost, {
                icon: 'stop',
                info: 'Stop current job',
                size: 'sm', variant: 'secondary',
                disabled: !isGenerating,
            });
            stopBtn.on('click', () => {
                if (!isGenerating) return;
                _emitCancel();
            });

            clearBtn = MpiButton.mount(clearHost, {
                icon: 'trash',
                info: 'Clear pending queue',
                size: 'sm', variant: 'secondary',
                disabled: !isGenerating,
            });
            clearBtn.on('click', () => {
                emit('queue-clear', {});
            });

            // Sync armed class on initial mount.
            runBtn.el.classList.toggle('mpi-prompt-box__cue-btn--armed', !!state.loopArmed);
        }

        _renderRunCluster();

        // ── Run / Stop / Loop hotkeys ──────────────────────────────────────────
        const _triggerRun = () => {
            // MPI-73: the run hotkey bypasses the (now-disabled) Cue button — block
            // it too while the remote engine is connecting/disconnecting.
            if (_remoteTransitioning) return;
            if (state.loopArmed) {
                state.loopArmed = false;
                return;
            }
            isGenerating = true;
            stopBtn?.el?.setDisabled?.(false);
            clearBtn?.el?.setDisabled?.(false);
            runBtn?.el?.setLabel?.(_runLabel((state.generationQueueCount || 0) + 1));
            _emitRun();
        };

        const _triggerStop = () => {
            if (!isGenerating) return;
            _emitCancel();
        };

        const _triggerLoop = () => {
            state.loopArmed = !state.loopArmed;
            if (state.loopArmed) _seedLoopIfIdle();
        };

        _unsubs.push(Hotkeys.bind('generation.run',  _triggerRun));
        _unsubs.push(Hotkeys.bind('generation.stop', _triggerStop));
        _unsubs.push(Hotkeys.bind('generation.loop', _triggerLoop));

        _unsubs.push(Events.on('state:changed', ({ key, value }) => {
            if (key === 'generationQueueCount') {
                runBtn?.el?.setLabel?.(_runLabel(value));
                return;
            }
            if (key === 'loopArmed') {
                _refreshRunLabel();
                return;
            }
            if (key === 'remoteEnginePhase') {
                _applyRemotePhase(); // MPI-73: enable/disable Cue on transition
            }
        }));

        // MPI-73: disable the Cue button while the remote engine is connecting or
        // disconnecting. Generation mid-transition would fall to the wrong engine
        // and surface a misleading error — prevention beats a scary popup, so block
        // the button outright. Driven by `state.remoteEnginePhase` (not the live
        // event) so a PromptBox mounted DURING a transition reads the current phase
        // immediately at mount, then stays in sync via state:changed below.
        const _applyRemotePhase = () => {
            const phase = state.remoteEnginePhase;
            _remoteTransitioning = phase === 'connecting' || phase === 'disconnecting';
            runBtn?.el?.setDisabled?.(_remoteTransitioning);
        };
        _applyRemotePhase();

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
