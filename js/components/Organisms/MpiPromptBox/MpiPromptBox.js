import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands, getAvailableCommands, getCommandComponents, getCommandMediaInputs, filterMediaInputsForModel } from '../../../data/commandRegistry.js';
import { getModelDepStatus, tierLetterFor } from '../../../data/modelRegistry.js';
import { usesQualityTier } from '../../../utils/ratios.js';
import { deriveInstalledOps } from '../../../data/modelConstants/resolveModelDeps.js';
import { PROMPT_BOX_CONTROLS, getInjectionParamsFromControls } from './PromptBoxControls.js';
import { state } from '../../../state.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs, on } from '../../../utils/dom.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { remoteEngineClient } from '../../../services/remoteEngineClient.js';
import { checkPromptEnhanceAvailable, enhancePrompt } from '../../../shell/connectorOps.js';

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
 *   el.injectMedia({ url, mediaType, role?, name? })  — role tags chip to a slot key (e.g. 'startFrame', 'endFrame'); name is the user-facing chip label (customName/derived)
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
            <div class="mpi-prompt-box__col mpi-prompt-box__col--enhance hide" id="enhance-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--settings" id="settings-badge-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--engine hide" id="engine-toggle-slot"></div>
            <div class="mpi-prompt-box__col mpi-prompt-box__col--run" id="bottom-right-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        let isExpansionLocked = state.promptExpanded === false;
        let isNegativeMode    = false;
        // Drafts (text + chips) are localized PER WORKSPACE — the gallery box and
        // history box never share. Keyed on props.workspaceKey; defaults to
        // 'gallery'. Explicit props (e.g. a recall) win over the restored draft.
        const _wsKey = props.workspaceKey === 'history' ? 'history' : 'gallery';
        // History reuses ONE slot for every card, so each saved draft is tagged
        // with its card id (props.workspaceId). On mount we restore only when the
        // tag matches the card being opened — otherwise the previous card's draft
        // would leak onto a different card. Gallery has no card (id null) so it
        // always matches and stays persistent. ponytail: single tagged slot, not a
        // per-card map — no growth/cleanup; only the last-touched card round-trips.
        const _wsId = props.workspaceId ?? null;
        const _matchesSlot = (saved) => (saved?.id ?? null) === _wsId;

        const _draftSlot = state.promptDraft?.[_wsKey] || {};
        const _draft = _matchesSlot(_draftSlot) ? _draftSlot : {};
        let positiveValue     = props.value || _draft.positive || '';
        let negativeValue     = props.negativeValue || _draft.negative || '';

        function _saveDraft() {
            state.promptDraft = {
                ...state.promptDraft,
                [_wsKey]: { id: _wsId, positive: positiveValue, negative: negativeValue },
            };
        }

        // True while re-injecting restored chips at mount — suppresses the
        // snapshot write so the restore doesn't clobber the source it reads from.
        let _restoringMedia = false;

        // Persist staged chips per-workspace so they survive nav. Only durable
        // (non-blob) urls are kept — blob: urls are revoked on unmount and would
        // 404 if restored.
        function _saveMedia() {
            if (_restoringMedia) return;
            const items = el.getMediaItems()
                .filter(m => typeof m.url === 'string' && !m.url.startsWith('blob:'))
                .map(({ url, mediaType, role, name }) => ({ url, mediaType, role, name }));
            state.promptMedia = { ...state.promptMedia, [_wsKey]: { id: _wsId, items } };
        }
        let activeOperation   = props.operation || 't2i';
        let isGenerating      = props.generating || false;
        let _remoteTransitioning = false; // MPI-73: remote engine connecting/disconnecting — block Cue
        let _context          = props.context || {};

        // The physically-installed op set for a model, derived from the last
        // /comfy/models/check result. Passed into getAvailableCommands so the
        // PromptBox hides a selectable op the user chose not to install (MPI-122).
        // Returns null when status is unknown → getAvailableCommands falls back to
        // static supportedOps (no behaviour change for image / pre-check models).
        function _ctxWithInstalledOps(model) {
            if (!model?.operations) return _context;
            const depStatus = getModelDepStatus(model.id);
            if (!depStatus) return _context;
            // R31 (MPI-208): use effectiveEngine() so the "Run locally" override
            // is honoured — when the toggle is ON, installedOps are derived from
            // the LOCAL engine's weights, not the remote Pod's.
            const engine = remoteEngineClient.effectiveEngine();
            const { installedOps } = deriveInstalledOps(
                model,
                depId => {
                    const s = depStatus.get(depId);
                    return s === true || s?.installed === true;
                },
                // Engine-scoped (MPI-165): an engine-split model's installed-op set
                // depends on the current engine's weights. (LTX is flat → early-return
                // above; this guards a future op-keyed engine-split model.)
                engine,
                // MPI-200: arch token for a future op-keyed model with a variants: block.
                { arch: remoteEngineClient.archSync(engine) },
            );
            return { ..._context, installedOps };
        }

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
            // Audio slot on the shared video ops is gated by model capability —
            // WAN never accepts/shows it, LTX does.
            return filterMediaInputsForModel(getCommandMediaInputs(operation), model);
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

        function _removeItem(id, { silent = false } = {}) {
            const idx = _mediaItems.findIndex(m => m.id === id);
            if (idx === -1) return;
            const item = _mediaItems.splice(idx, 1)[0];
            if (item.source === 'file') URL.revokeObjectURL(item.url);
            // silent: caller (a replace inside _tryAddMedia) will emit once after
            // the new item lands. Emitting mid-replace flickers media to zero,
            // which flips the op to text-only, which then re-derives to i2i on the
            // next emit — dropping a replacement image onto upscale/inpaint lost
            // the op. The final _emitMediaChange is the only one that should run.
            if (!silent) _emitMediaChange();
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
                    el.setOperation(fallback, { programmatic: true });
                } else {
                    _refreshOpDropdown();
                }
            } else if (!hasMedia && curCmd && !curIsTextOnly) {
                const textOp = _pickTextOnlyOp();
                if (textOp) {
                    el.setOperation(textOp, { programmatic: true });
                } else {
                    _refreshOpDropdown();
                }
            } else {
                _refreshOpDropdown();
            }

            // Notify the audioMode control (LTX) that audio presence changed so
            // it can enable/disable its radio. The useAudio toggle takes the same
            // signal but disables INVERSELY (off when a clip is present).
            const _audioPresent = el.audioCount > 0;
            _activeControls.get('audioMode')?.setAudioPresent?.(_audioPresent);
            _activeControls.get('useAudio')?.setAudioPresent?.(_audioPresent);

            const renderedItems = _withAssignedRoles();
            _renderStrip(renderedItems);
            _saveMedia();
            emit('media-change', { imageCount: el.imageCount, videoCount: el.videoCount, audioCount: el.audioCount, items: renderedItems });
        }

        function _tryAddMedia({ url, file, mediaType, source, role, name }) {
            const maxCount = _maxMediaForCurrentOperation(mediaType);
            if (maxCount <= 0) { _showIncompatibleToast(); return; }

            const sameType = _mediaItems.filter(m => m.mediaType === mediaType);
            // Role-aware replacement: if the new item carries an explicit role,
            // displace any existing item already tagged with that role first
            // (so "Set as end frame" overwrites a prior end-frame chip
            // regardless of capacity).
            if (role) {
                const sameRole = _mediaItems.find(m => m.role === role && m.mediaType === mediaType);
                if (sameRole) _removeItem(sameRole.id, { silent: true });
            }

            const afterRoleDrop = _mediaItems.filter(m => m.mediaType === mediaType);
            if (maxCount === 1) {
                afterRoleDrop.forEach(item => _removeItem(item.id, { silent: true }));
            } else if (afterRoleDrop.length >= maxCount) {
                _removeItem(afterRoleDrop[0].id, { silent: true });
            }

            const item = { id: crypto.randomUUID(), url, file: file || null, mediaType, source };
            if (role) item.role = role;
            if (name) item.name = name; // user-facing name (customName/derived) for chip label
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
                        const { filePath, type, name } = JSON.parse(appData);
                        if (!_acceptsMediaType(type)) { _showIncompatibleToast(); return; }
                        _tryAddMedia({ url: filePath, file: null, mediaType: type, source: 'app', name });
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

        // MPI-247: `programmatic` distinguishes an op the box RE-DERIVED for the
        // user (model switch, media-context re-pick) from an op the USER chose.
        // Consumers persist per-model op memory only for user picks — a
        // programmatic re-pick must not overwrite what the user last selected.
        el.setOperation = (key, { programmatic = false } = {}) => {
            activeOperation = key;
            _refreshOpDropdown();
            _refreshOpSlot();
            _renderBadge();
            emit('operation-change', { operation: key, programmatic });
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

        // Re-mount the active op's controls so each re-reads its persisted value.
        // Used by Reuse Prompt: applyPromptReuseSettings writes the recalled
        // settings to project state AFTER setModel/setOperation already mounted
        // the controls (which read the pre-reuse value), so without this refresh
        // the live PromptBox keeps showing the old ratio/quality/duration until
        // the next navigation re-mount.
        el.refreshControls = () => _refreshOpSlot();

        function _pickOpForModel(candidate) {
            if (!candidate?.supportedOps?.length) return activeOperation;
            const supported = candidate.supportedOps;
            const cmds = getAvailableCommands(candidate.mediaType, candidate, _ctxWithInstalledOps(candidate));
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

        // L/B/H tier marker (MPI-168): only disambiguates when the SAME family has
        // 2+ installed tiers in the list — a lone SDXL/Wan/LTX gets no letter (no
        // clutter). The letter goes on `label` (flows to the closed trigger via
        // textContent); `meta` only shows in the open list, the wrong slot.
        function _modelDropdownOptions() {
            const TIER_LETTER = { low: 'L', balanced: 'B', high: 'H' };
            const familyCounts = new Map();
            modelList.forEach(m => {
                if (m.modelFamily) familyCounts.set(m.modelFamily, (familyCounts.get(m.modelFamily) || 0) + 1);
            });
            return modelList.map(m => {
                const ambiguous = m.modelFamily && familyCounts.get(m.modelFamily) > 1;
                const letter = ambiguous ? TIER_LETTER[m.sizeTier] : '';
                return {
                    value: m.id,
                    label: letter ? `${m.name} ${letter}` : m.name,
                    meta: m.dropdownMeta || '',
                };
            });
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
                el.setOperation(picked, { programmatic: true });
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
            }
            // MPI-247: model unchanged = a refresh, NOT a model switch. Do NOT
            // re-derive the op — _pickOpForModel rejects the current op on a
            // media-chip mismatch and falls back to supportedOps declaration
            // order, silently reverting the user's deliberate choice on every
            // Gallery<->History navigation. Keep activeOperation as long as the
            // model still declares it (the L528 guard handles genuinely-invalid
            // ops from a mixed image/video list). Re-picking only happens on an
            // actual model change (setModel / model dropped from list above).

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
                el.setOperation(nextOp, { programmatic: true });
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

        // Best-effort display name for an audio chip: the user-facing name
        // carried on the item (group customName/derived — MPI-130), else the
        // dropped File's name, else the basename of its project URL.
        function _audioName(item) {
            if (item.name) return item.name;
            if (item.file?.name) return item.file.name;
            try {
                const raw = item.url || '';
                const pathPart = raw.includes('path=')
                    ? decodeURIComponent(raw.split('path=')[1])
                    : decodeURIComponent(raw.split('?')[0]);
                const base = pathPart.split(/[\\/]/).pop() || '';
                return base || 'audio';
            } catch { return 'audio'; }
        }

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
                        : `<div class="mpi-prompt-box-media-strip__audio-thumb">
                               ${renderIcon('audio', 'sm')}
                               <span class="mpi-prompt-box-media-strip__audio-name" title="${_audioName(item)}">${_audioName(item)}</span>
                           </div>`;
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

        el.injectMedia = ({ url, mediaType, role, name }) => {
            if (!_acceptsMediaType(mediaType)) { _showIncompatibleToast(); return false; }
            _tryAddMedia({ url, file: null, mediaType, source: 'app', role, name });
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
            textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
            updateHeight();
            _saveDraft();
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
            // Manual Cleanup wipes the whole preview-assets store, so every staged
            // chip sourced from it is now a dead link. Drop live chips + the
            // persisted snapshot so a later mount doesn't restore broken media.
            Events.on('assets:cleaned', () => el.clearMedia()),
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
            _saveDraft();
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
            // MPI-200: append the size-tier letter (H/B/L) so the button matches the
            // dropdown + gallery cards (e.g. "LTX 2.3 B"). Empty for models with no tier family.
            const _tier = tierLetterFor(model);
            const modelName  = model ? `${model.name}${_tier ? ` ${_tier}` : ''}` : '—';
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

            // Gear opens model settings (upscale-model + LoRA pickers). A model can
            // opt out with showSettings:false when it configures neither — e.g. the
            // PiD upscaler, which takes no upscale model and no LoRAs.
            if (props.showSettings !== false && model.showSettings !== false) {
                const gearBtn = MpiButton.mount(document.createElement('div'), {
                    icon: 'settings', variant: 'ghost', size: 'sm', info: 'Model Settings',
                });
                gearBtn.on('click', () => emit('settings', { model }));
                modelSlot.appendChild(gearBtn.el);
            }
        }

        function _pickTextOnlyOp() {
            if (!model) return null;
            const cmds = getAvailableCommands(model.mediaType, model, _ctxWithInstalledOps(model));
            const textOnly = cmds.filter(c => (c.requiresImages ?? 0) === 0 && (c.requiresVideo ?? 0) === 0);
            return textOnly[0]?.key ?? null;
        }

        function _pickFallbackOp() {
            if (!model) return null;
            const cmds = getAvailableCommands(model.mediaType, model, _ctxWithInstalledOps(model));
            const candidates = cmds.filter(c => (c.requiresImages ?? 0) > 0 || (c.requiresVideo ?? 0) > 0);
            const ready = candidates.find(c => c.available);
            return (ready ?? candidates[0])?.key ?? null;
        }

        function _refreshOpDropdown() {
            if (!model) return;
            if (!opDropdownSlot) return;

            const hasMedia = el.imageCount > 0 || el.videoCount > 0;
            const availableCmds = getAvailableCommands(model.mediaType, model, _ctxWithInstalledOps(model));
            const filteredCmds = _context.filterNoInputOps
                ? availableCmds.filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                : availableCmds;
            const availableOps = filteredCmds.map(cmd => {
                const isTextOnly = (cmd.requiresImages ?? 0) === 0 && (cmd.requiresVideo ?? 0) === 0;
                const disabled = !cmd.available || (hasMedia && isTextOnly);
                return { value: cmd.key, label: cmd.label, disabled, info: cmd.info };
            });

            opDropdownSlot.innerHTML = '';
            if (availableOps.length === 0) return;

            _opDropdown = MpiDropdown.mount(document.createElement('div'), {
                options: availableOps,
                value: activeOperation,
                info: 'Current model operation - Also accessible by holding Tab',
                direction: 'up',
            });
            _opDropdown.on('change', ({ value }) => el.setOperation(value));

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

                // Preview toggle is capability-gated: only multi-stage models
                // (WAN + LTX) show it. A model with multiStage:false hides it.
                if (componentId === 'previewStage' && model?.capabilities?.multiStage !== true) continue;

                // audioMode radio + useAudio toggle are capability-gated: only
                // models with audio (LTX) show them. WAN never mounts them.
                if ((componentId === 'audioMode' || componentId === 'useAudio') && model?.capabilities?.audio !== true) continue;

                // Motion intensity is capability-gated: only models whose workflow
                // has an Input_Motion_Intensity node (WAN) show it. LTX has no such
                // node, so the control would be dead UI — hide it.
                if (componentId === 'motionIntensity' && model?.capabilities?.motion !== true) continue;

                // Style rack (Input_Style + Input_Stylization) is capability-gated:
                // only models shipping style LoRAs (Krea2) mount it. Unlike
                // negativePrompt this defaults FALSE — a model must opt in.
                if ((componentId === 'styleSelect' || componentId === 'stylization')
                    && model?.capabilities?.styleLoras !== true) continue;

                // Prompt enhancer (Input_Enhance_Prompt) needs a text encoder whose
                // CLIP implements .generate() — Qwen3-VL/Gemma yes, T5/umT5 CRASHES.
                // Never infer this from the op; the model declares it.
                if (componentId === 'enhancePrompt' && model?.capabilities?.promptEnhance !== true) continue;

                // Quality-tier radio mounts only for models whose ratio set is keyed
                // by tier ('quality' + 'quality-orientation'). NOT a capability flag:
                // the ratio table already states it, and a second source would drift.
                // Without this, an orientation model (SDXL) would render Wan's tiers.
                if (componentId === 'qualityTier' && !usesQualityTier(model?.type)) continue;

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

            // Seed audioMode + useAudio enablement from current media (audio may
            // already be present when the op/controls (re)mount).
            const _seedAudioPresent = (el.audioCount || 0) > 0;
            _activeControls.get('audioMode')?.setAudioPresent?.(_seedAudioPresent);
            _activeControls.get('useAudio')?.setAudioPresent?.(_seedAudioPresent);

            // The negative toggle is model-gated too, and `model` is reassigned
            // live by setModel/setModelList without a remount. Both converge here.
            _refreshNegToggle();
        }

        // ── Negative mode toggle ───────────────────────────────────────────────
        // Two conditions, re-evaluated whenever the model changes:
        //   props.includeNegative — does this SURFACE offer negatives at all?
        //   capabilities.negativePrompt — does the ACTIVE MODEL support them?
        // The capability defaults to TRUE when absent (a model supports negatives
        // unless it opts out), inverting the convention of multiStage/audio/motion.
        // Krea2-Turbo is distilled at cfg 1.0 and opts out: its negative prompt has
        // no effect and NAG is a silent no-op that doubles NFE.
        const negSlot = qs('#bottom-neg-slot', el);
        let _negBtn = null;

        function _refreshNegToggle() {
            const show = props.includeNegative === true
                && model?.capabilities?.negativePrompt !== false;

            if (show === !!_negBtn) return;

            if (!show) {
                // Toggle is going away. If the user was typing INTO the negative
                // field, they would be stranded editing an invisible value — snap
                // the textarea back to positive and tell consumers.
                _negBtn.destroy();   // factory destroy() also removes el from the slot
                _negBtn = null;
                if (isNegativeMode) {
                    isNegativeMode = false;
                    textareaEl.value = positiveValue;
                    textareaEl.placeholder = 'Type your prompt...';
                    updateHeight();
                    emit('mode-change', { mode: 'positive' });
                }
                return;
            }

            _negBtn = MpiButton.mount(negSlot, {
                icon: 'check', iconActive: 'negative',
                info: 'Switch between Positive and Negative Prompt',
                size: 'sm', variant: 'primary', toggleable: true, active: isNegativeMode
            });
            _negBtn.on('click', (data) => {
                isNegativeMode = data.active;
                textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
                textareaEl.placeholder = isNegativeMode ? 'Type negative prompt...' : 'Type your prompt...';
                updateHeight();
                emit('mode-change', { mode: isNegativeMode ? 'negative' : 'positive' });
            });
        }

        _refreshNegToggle();

        // ── Enhance (Cubric Prompt, MPI-5) ─────────────────────────────────────
        // Capability-gated: the control is only mounted when cubric.prompt is
        // registered and advertises prompt.enhance. Absent Prompt → no control
        // at all (the slot stays hidden), so PromptBox is a clean standalone
        // editor. Toggleable icon button, on by default (signals "available").
        // Clicking enhances the active prompt field via the broker and writes
        // the result back through the existing injectPrompts().
        const enhanceSlot = qs('#enhance-slot', el);
        let _enhanceBtn = null;
        let _enhancing = false;

        function _enhanceToast(message, variant) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
            document.body.appendChild(wrapper);
            const toast = MpiToast.mount(wrapper, { message, variant, duration: 3000 });
            toast.on('close', () => wrapper.remove());
        }

        async function _runEnhance() {
            if (_enhancing) return;
            const source = isNegativeMode ? negativeValue : positiveValue;
            if (!source.trim()) { _enhanceToast('Type a prompt to enhance first.', 'warning'); return; }
            _enhancing = true;
            _enhanceBtn?.el?.setDisabled?.(true);
            try {
                // Vision owns the recipe key: Cubric Prompt selects its enhancer
                // recipe by this id. Default to the model's `type` (e.g. 'sdxl',
                // 'wan' — already aligns with Prompt's recipe ids); a model may
                // override with an explicit `enhanceRecipe` when they diverge.
                const result = await enhancePrompt({
                    prompt: positiveValue,
                    negativePrompt: negativeValue,
                    targetModelId: model?.enhanceRecipe ?? model?.type,
                    operation: activeOperation,
                });
                if (result.ok) {
                    el.injectPrompts({
                        positive: result.prompt ?? positiveValue,
                        negative: result.negativePrompt ?? negativeValue,
                    });
                    emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
                    // result.note is set when Prompt had no recipe for this model
                    // and fell back to a default enhancer — surface it honestly.
                    _enhanceToast(result.note || 'Prompt enhanced.', result.note ? 'info' : 'success');
                } else {
                    _enhanceToast(result.error || 'Enhance failed.', 'warning');
                }
            } finally {
                _enhancing = false;
                _enhanceBtn?.el?.setDisabled?.(false);
            }
        }

        // Probe capability async; reveal the button only if Prompt is live.
        checkPromptEnhanceAvailable().then((available) => {
            if (!available || !enhanceSlot) return;
            enhanceSlot.classList.remove('hide');
            _enhanceBtn = MpiButton.mount(enhanceSlot, {
                icon: 'enhance',
                info: 'Enhance prompt with Cubric Prompt',
                size: 'sm', variant: 'primary', toggleable: true, active: true,
            });
            _enhanceBtn.on('click', () => { void _runEnhance(); });
        }).catch(() => { /* no broker / no Prompt → stay standalone */ });

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
                // MPI-208 B1-C: per-gen local override derived from the single source of
                // truth (state.engineOverride), not a component-private mirror.
                forceLocal: state.engineOverride === 'local',
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
                info: 'Tap to cue. Hold to toggle loop. (Ctrl+Enter) | Access Queue (Q)',
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
                info: 'Stop current job (Ctrl+Alt+Enter)',
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
            // An open App overlay owns Ctrl+Enter → it runs the app, not the PromptBox
            // behind it. bind() fires all handlers, so bail here when an app is live.
            if (document.querySelector('.mpi-base-app')) return;
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
                return;
            }
            // R31 (MPI-208): rebuild op dropdown + badge when the engine override
            // changes so the selector shows the correct installed-op set for the
            // effective engine ('local' override → local weights; null → remote).
            if (key === 'engineOverride') {
                _refreshOpDropdown();
                _renderBadge();
            }
        }));

        // MPI-122: when install status is re-checked (e.g. the user adds the I2V op
        // to an already-installed Wan model), refresh the op dropdown so newly-
        // installed operations appear (and removed ones vanish) without a remount.
        _unsubs.push(Events.on('models:checked', () => { _refreshOpDropdown(); }));

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

        // MPI-74: "Run locally" toggle. Shown ONLY while the app is remote-connected;
        // when ON, the next Cue/Q dispatch is force-routed onto the LOCAL ComfyUI
        // (forceLocal in getRunPayload). Sticky within a remote session, reset to OFF
        // on disconnect. UI-only for now — the flag is inert until MPI-82's spine
        // reads opts.forceLocal. Mount-time visibility reads the cached remote flag;
        // live show/hide follows the `remote:connection` event (same source the
        // landing/status bar already use).
        const engineToggleSlot = qs('#engine-toggle-slot', el);
        const engineToggleBtn = MpiButton.mount(engineToggleSlot, {
            icon: 'cloud',
            iconActive: 'laptop',
            toggleable: true,
            active: state.engineOverride === 'local',
            size: 'sm',
            info: 'Run this generation on your local engine instead of the cloud Pod.',
            extraClasses: 'mpi-prompt-box__engine-toggle',
        });
        engineToggleBtn.on('toggle', ({ active }) => {
            // R31 (MPI-208): the toggle writes the single source of truth. getRunPayload,
            // selector derivation and installed-op gating all read state.engineOverride
            // (via effectiveEngine()) — no component-private mirror.
            state.engineOverride = active ? 'local' : null;
        });
        const _showEngineToggle = (connected) => {
            engineToggleSlot?.classList.toggle('hide', !connected);
            if (!connected) {
                state.engineOverride = null; // R31: clear override on disconnect
                engineToggleBtn.el.setActive(false);
            }
        };
        _showEngineToggle(remoteEngineClient.isRemote());
        _unsubs.push(Events.on('remote:connection', ({ connected }) => _showEngineToggle(!!connected)));

        // ── Initialise ─────────────────────────────────────────────────────────
        _refreshOpDropdown();
        _refreshOpSlot();
        _renderBadge();

        // Restore staged chips persisted by a prior mount of this mediaType, so
        // start/end-frame (and input-video) media survive nav. _acceptsMediaType
        // scans all of the model's supported ops, so a frame chip is accepted
        // even if the initial op is text-only — adding it then auto-switches to a
        // media op via _emitMediaChange. Reuse Prompt clears+replaces these after
        // mount, so it always wins over a restore.
        {
            const _mediaSlot = state.promptMedia?.[_wsKey];
            const _saved = _matchesSlot(_mediaSlot) ? (_mediaSlot.items || []) : [];
            if (_saved.length) {
                _restoringMedia = true;
                try {
                    for (const m of _saved) el.injectMedia({ url: m.url, mediaType: m.mediaType, role: m.role, name: m.name });
                } finally {
                    _restoringMedia = false;
                }
                _saveMedia(); // re-sync snapshot to what actually landed (capacity/role eviction)
            }
        }

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
            _negBtn?.destroy?.();
            domObserver.disconnect();
            if (popupNode.parentNode) popupNode.parentNode.removeChild(popupNode);
            _stripEl.remove();
            el.remove();
        };
    }
});
