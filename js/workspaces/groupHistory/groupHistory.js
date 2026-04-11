/**
 * groupHistory.js — Item Group History workspace.
 *
 * Shows the full generation history of a single ItemGroup.
 *
 * Layout:
 *   Left toolbar  — compare tool (+ crop/mask in future sessions)
 *   Centre        — MpiCanvas viewer (pan/zoom, mask/compare modes)
 *   Right panel   — scrollable history stack with always-visible checkboxes
 *   Bottom        — MpiPromptBox (floating, same style as gallery)
 *
 * Entry point: mount(container, params)
 * @param {HTMLElement} container
 * @param {{ groupId: string }} params
 */

import { state } from '../../state.js';
import { Events } from '../../events.js';
import { navigate, PAGE_GALLERY } from '../../router.js';
import { ce } from '../../utils/dom.js';
import { MpiPromptBox } from '../../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { MpiDropdown } from '../../components/Primitives/MpiDropdown/MpiDropdown.js';
import { MpiSpinner } from '../../components/Primitives/MpiSpinner/MpiSpinner.js';
import { MpiRatioSelector } from '../../components/Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { MpiCanvas } from '../../components/Primitives/MpiCanvas/MpiCanvas.js';
import { MpiHistoryTools } from '../../components/Compounds/MpiHistoryTools/MpiHistoryTools.js';
import { MpiToolActionBar } from '../../components/Compounds/MpiToolActionBar/MpiToolActionBar.js';
import { MpiAutoMaskThumbs } from '../../components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.js';
import { MpiSelectionBar } from '../../components/Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiRadioGroup } from '../../components/Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiModelSettings } from '../../components/Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiModelsModal } from '../../components/Blocks/MpiModelsModal/MpiModelsModal.js';
import { getModelsByType, getModelById } from '../../data/modelRegistry.js';
import { getAvailableCommands, getToolCommands } from '../../data/commandRegistry.js';
import { SOCIAL_RATIOS } from '../../utils/ratios.js';
import { runCommand, runAutoMask } from '../../services/commandExecutor.js';
import { clientLogger } from '../../services/clientLogger.js';
import { StatusBar } from '../../shell/statusBar.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    updateGroupInProject,
    createImageItem,
    removeHistoryEntry,
} from '../../data/projectModel.js';

// ── CSS ────────────────────────────────────────────────────────────────────────

let _cssLoaded = false;
function _ensureCss() {
    if (_cssLoaded) return;
    _cssLoaded = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'js/workspaces/groupHistory/groupHistory.css';
    document.head.appendChild(link);
}

// ── URL resolver (same logic as MpiCompareOverlay) ─────────────────────────────

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

/**
 * @param {HTMLElement} container
 * @param {{ groupId: string }} params
 */
export function mount(container, params = {}) {
    _ensureCss();

    // ── Resolve group ──────────────────────────────────────────────────────────

    let _group = state.currentProject?.itemGroups?.find(g => g.id === params.groupId);

    if (!_group) {
        container.innerHTML = `
            <div class="gh-error">
                <p>Group not found. <button class="gh-error__back">Back to gallery</button></p>
            </div>`;
        container.querySelector('.gh-error__back')
            ?.addEventListener('click', () => navigate(PAGE_GALLERY));
        return;
    }

    // ── State ──────────────────────────────────────────────────────────────────

    let _selectedIdx = _group.selectedIndex ?? 0;
    let _selectMode = false;
    /** Indices currently selected (for compare / delete) */
    const _selection = new Set();
    /** Saved mask data URLs keyed by history index — persists across entry switches */
    const _maskStore = new Map();

    // ── Scaffold ───────────────────────────────────────────────────────────────

    container.innerHTML = '';
    container.classList.add('gh-workspace');

    const header = ce('div', { className: 'gh-workspace__header' });
    const leftBar = ce('div', { className: 'gh-workspace__left' });
    const centre = ce('div', { className: 'gh-workspace__centre' });
    const rightPanel = ce('div', { className: 'gh-workspace__right' });
    const bottom = ce('div', { className: 'gh-workspace__bottom' });
    const cropBar = ce('div', { className: 'gh-crop-bar' });

    container.append(header, leftBar, centre, rightPanel, bottom, cropBar);

    // ── MpiCanvas viewer ──────────────────────────────────────────────────────

    const canvasWrap = ce('div', { className: 'gh-canvas-wrap' });
    const spinnerWrap = ce('div', { className: 'gh-canvas-spinner' });
    MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });
    centre.appendChild(canvasWrap);
    centre.appendChild(spinnerWrap);

    const _canvasInst = MpiCanvas.mount(canvasWrap, {
        onBrushTypeChange: (type) => {
            // Sync brush/eraser toggle buttons when B or E hotkey is used
            maskBar?.el.setActive(type === 'eraser' ? 'eraser' : 'brush');
        },
    });
    const _canvas = _canvasInst.el;

    function _setGeneratingSpinner(on) {
        spinnerWrap.classList.toggle('gh-canvas-spinner--visible', on);
    }

    async function _showEntry(item) {
        if (!item?.filePath) return;
        // loadImage() resets activeMode to 'none' internally
        try {
            await _canvas.loadImage(_resolveUrl(item.filePath));
        } catch (err) {
            console.warn('[groupHistory] Failed to load image into canvas:', err);
        }
    }

    let _comparingActive = false;

    async function _showCompare(idxA, idxB) {
        const itemA = _group.history[idxA];
        const itemB = _group.history[idxB];
        if (!itemA?.filePath || !itemB?.filePath) return;
        try {
            _comparingActive = true;
            await _canvas.loadImage(_resolveUrl(itemA.filePath));
            // loadComparisonImage() sets activeMode to 'compare' internally
            await _canvas.loadComparisonImage(_resolveUrl(itemB.filePath));
        } catch (err) {
            console.warn('[groupHistory] Failed to load compare images:', err);
        } finally {
            _comparingActive = false;
        }
    }

    // ── History panel ──────────────────────────────────────────────────────────

    const historyList = ce('div', { className: 'gh-history' });
    rightPanel.appendChild(historyList);

    /** @type {HTMLElement[]} */
    const _historyCards = [];

    function _buildHistoryCards() {
        historyList.innerHTML = '';
        _historyCards.length = 0;

        _group.history.forEach((item, idx) => {
            const card = ce('div', { className: 'gh-history__card' });

            // Checkbox — checking one enters select mode
            const cbWrap = ce('label', { className: 'gh-history__cb-wrap' });
            const cb = ce('input', { type: 'checkbox', className: 'gh-history__cb' });
            cb.checked = _selection.has(idx);
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                _toggleSelection(idx, cb.checked);
            });
            cbWrap.appendChild(cb);

            const thumb = ce('img', { className: 'gh-history__thumb', alt: '' });
            if (item.filePath) thumb.src = _resolveUrl(item.filePath);

            const label = ce('div', { className: 'gh-history__label' });
            label.textContent = item.operation || item.type || '';

            const date = ce('div', { className: 'gh-history__date' });
            date.textContent = item.createdAt
                ? new Date(item.createdAt).toLocaleDateString()
                : '';

            const meta = ce('div', { className: 'gh-history__meta' });
            meta.append(label, date);
            card.append(cbWrap, thumb, meta);

            card.addEventListener('click', (e) => {
                if (e.target === cb || e.target === cbWrap) return;
                if (_selectMode) {
                    // In select mode: card click toggles selection
                    _toggleSelection(idx, !_selection.has(idx));
                } else {
                    _selectEntry(idx);
                }
            });

            historyList.appendChild(card);
            _historyCards.push(card);
        });

        _applyCardStates();
    }

    function _applyCardStates() {
        _historyCards.forEach((card, idx) => {
            card.classList.toggle('gh-history__card--active', idx === _selectedIdx);
            card.classList.toggle('gh-history__card--selected', _selection.has(idx));
            const cb = card.querySelector('.gh-history__cb');
            if (cb) cb.checked = _selection.has(idx);
        });
    }

    function _selectEntry(idx) {
        // Save the current mask before switching away
        if (_hasMask) {
            _maskStore.set(_selectedIdx, _canvas.getMaskDataURL());
        } else {
            _maskStore.delete(_selectedIdx);
        }

        _selectedIdx = idx;
        _exitCropMode();
        _exitMaskMode();
        _applyCardStates();

        // _showEntry loads the image (which re-inits the mask canvas to image dims),
        // then we restore any previously saved mask for this entry.
        _showEntry(_group.history[idx]).then(() => {
            const saved = _maskStore.get(idx);
            if (saved) {
                _canvas.setMaskDataURL(saved);
                _hasMask = true;
            } else {
                _canvas.clearMask();
                _hasMask = false;
            }
            _promptBox?.el.updateContext({ ..._baseCtx, hasMask: _hasMask });
            _refreshOpOptions();
        });

        // Persist selectedIndex
        _group = promoteHistoryEntry(_group, idx);
        _persistGroup();
    }

    // ── Selection mode ─────────────────────────────────────────────────────────

    function _toggleSelection(idx, checked) {
        if (checked) {
            _selection.add(idx);
        } else {
            _selection.delete(idx);
        }

        if (_selection.size > 0 && !_selectMode) {
            _enterSelectMode();
        } else if (_selection.size === 0 && _selectMode) {
            _exitSelectMode();
            return;
        }

        _applyCardStates();
        selectionBar.el.setCount(_selection.size);
    }

    function _enterSelectMode() {
        // Deactivate any active canvas tool first — set _selectMode after so
        // the modechange fired by _exitCropMode/_exitMaskMode doesn't trigger _exitSelectMode.
        if (_isCropMode) _exitCropMode();
        if (_isMaskMode) _exitMaskMode();
        _selectMode = true;
        bottom.classList.add('gh-workspace__bottom--hidden');
        _selBarSlot.classList.remove('gh-workspace__bottom--hidden');
    }

    function _exitSelectMode() {
        _selectMode = false;
        _selection.clear();
        _selBarSlot.classList.add('gh-workspace__bottom--hidden');
        bottom.classList.remove('gh-workspace__bottom--hidden');
        _applyCardStates();
        // Reset canvas if compare was active
        if (_canvas.activeMode === 'compare') {
            _showEntry(_group.history[_selectedIdx]);
        }
    }

    // ── Left toolbar ───────────────────────────────────────────────────────────

    // Icon map for universal tool commands — add an entry here when a new
    // universal command is added to commandRegistry.js
    const _universalToolIcons = {
        autoMaskImg:  { icon: 'enhance', info: 'Auto Mask' },
        interpolate:  { icon: 'film',    info: 'Interpolate' },
        videoUpscale: { icon: 'rocket',  info: 'Video Upscale' },
    };

    // ── Detection models for auto-mask ─────────────────────────────────────────
    // Human-readable labels mapped to the UltralyticsDetector model filenames.
    // The value is injected into the workflow's "sams" node.
    const DETECTION_MODELS = [
        { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
        { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
        { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
    ];

    const _universalTools = getToolCommands('image').map(({ key, label }) => ({
        mode: key,
        icon: _universalToolIcons[key]?.icon ?? 'settings',
        info: _universalToolIcons[key]?.info ?? label,
    }));

    const historyTools = MpiHistoryTools.mount(leftBar, {
        tools: [
            { mode: 'crop', icon: 'crop', info: 'Crop' },
            { mode: 'mask', icon: 'edit', info: 'Draw Mask' },
            ..._universalTools,
        ],
    });

    // ── Crop state ─────────────────────────────────────────────────────────────
    let _isCropMode = false;
    let _activeCropRatio = SOCIAL_RATIOS[0].ratio;

    function _enterCropMode() {
        _isCropMode = true;
        _canvas.activeMode = 'crop';
        _canvas.setCropRatio(_activeCropRatio);
        bottom.classList.add('gh-workspace__bottom--hidden');
        cropActionBar.el.show();
    }

    function _exitCropMode() {
        _isCropMode = false;
        _canvas.activeMode = 'none';
        bottom.classList.remove('gh-workspace__bottom--hidden');
        cropActionBar.el.hide();
    }

    // ── Mask state ─────────────────────────────────────────────────────────────
    let _isMaskMode = false;
    let _hasMask = false; // true once user has painted anything

    function _enterMaskMode() {
        _isMaskMode = true;
        _canvas.activeMode = 'mask';
        bottom.classList.add('gh-workspace__bottom--hidden');
        maskActionBar.el.show();
        maskActionBar.el.setActive('brush');
        _refreshOpOptions();
    }

    function _exitMaskMode() {
        _isMaskMode = false;
        _canvas.activeMode = 'none';
        bottom.classList.remove('gh-workspace__bottom--hidden');
        maskActionBar.el.hide();
    }

    historyTools.on('activate', ({ mode }) => {
        if (mode === 'crop') _enterCropMode();
        if (mode === 'mask') _enterMaskMode();
        if (mode === 'autoMaskImg') _enterAutoMaskMode();
        // interpolate: run workflow → append new video history entry
        // videoUpscale: run workflow → append new video history entry
    });
    historyTools.on('deactivate', ({ mode }) => {
        if (mode === 'crop') _exitCropMode();
        if (mode === 'mask') _exitMaskMode();
        if (mode === 'autoMaskImg') _exitAutoMaskMode(false);
    });

    // Mutual exclusion: when the canvas mode changes from any source
    // (MpiHistoryTools button OR compare checkbox selection), sync all UI.
    _canvasInst.on('modechange', ({ mode }) => {
        historyTools.el.syncMode(mode);

        if (mode !== 'crop' && _isCropMode) {
            _isCropMode = false;
            bottom.classList.remove('gh-workspace__bottom--hidden');
            cropActionBar.el.hide();
        }

        if (mode !== 'mask' && _isMaskMode) {
            _isMaskMode = false;
            bottom.classList.remove('gh-workspace__bottom--hidden');
            maskActionBar.el.hide();
        }

        if (_isAutoMaskMode) {
            _isAutoMaskMode = false;
            bottom.classList.remove('gh-workspace__bottom--hidden');
            autoMaskBar.el.hide();
        }

        if (mode !== 'compare' && _selectMode && !_comparingActive) {
            _exitSelectMode();
        }
    });

    // ── Crop action bar ────────────────────────────────────────────────────────

    const ratioSel = MpiRatioSelector.mount(ce('div'), {
        modelType: 'social',
        value: SOCIAL_RATIOS[0].label,
    });
    ratioSel.on('change', ({ ratio }) => {
        _activeCropRatio = ratio;
        _canvas.setCropRatio(ratio);
    });

    const _cropBarSlot = ce('div', { className: 'gh-bar-slot' });
    cropBar.appendChild(_cropBarSlot);
    const cropActionBar = MpiToolActionBar.mount(_cropBarSlot, {
        leftSlot: ratioSel,
        actions: [
            { key: 'apply', icon: 'check', label: 'Apply', variant: 'primary', info: 'Save crop as a new history entry' },
            { key: 'cancel', icon: 'close', label: 'Cancel', variant: 'ghost', info: 'Cancel crop' },
        ],
    });
    cropActionBar.on('action', ({ key }) => {
        if (key === 'apply') _runCrop();
        if (key === 'cancel') _exitCropMode();
    });

    // ── Mask action bar ────────────────────────────────────────────────────────

    const _maskBarSlot = ce('div', { className: 'gh-bar-slot' });
    cropBar.appendChild(_maskBarSlot);
    const maskActionBar = MpiToolActionBar.mount(_maskBarSlot, {
        actions: [
            { key: 'brush', icon: 'pencil', label: 'Brush', variant: 'ghost', toggleable: true, active: true, radioGroup: 'tool', info: 'Paint mask (B)' },
            { key: 'eraser', icon: 'eraser', label: 'Eraser', variant: 'ghost', toggleable: true, radioGroup: 'tool', info: 'Erase mask (E)' },
            { key: 'clear', icon: 'trash', label: 'Clear', variant: 'ghost', info: 'Clear entire mask' },
            { key: 'invert', icon: 'swap', label: 'Invert', variant: 'ghost', info: 'Invert mask colours' },
            { key: 'cancel', icon: 'close', label: 'Cancel', variant: 'ghost', info: 'Cancel mask and discard' },
            { key: 'apply', icon: 'check', label: 'Apply Mask', variant: 'primary', info: 'Confirm mask for generation' },
        ],
    });
    maskActionBar.on('action', ({ key, active }) => {
        if (key === 'brush') { _canvas.setBrushType('brush'); }
        if (key === 'eraser') { _canvas.setBrushType('eraser'); }
        if (key === 'clear') { _canvas.clearMask(); _hasMask = false; _promptBox?.el.updateContext({ ..._baseCtx, hasMask: _hasMask }); _refreshOpOptions(); }
        if (key === 'invert') { _canvas.flipMaskColor(); }
        if (key === 'cancel') { _canvas.clearMask(); _hasMask = false; _promptBox?.el.updateContext({ ..._baseCtx, hasMask: _hasMask }); _exitMaskMode(); _refreshOpOptions(); }
        if (key === 'apply') { _hasMask = true; _promptBox?.el.updateContext({ ..._baseCtx, hasMask: _hasMask }); _exitMaskMode(); _refreshOpOptions(); }
    });

    // ── Auto-mask action bar ───────────────────────────────────────────────────

    // Auto-mask state
    let _isAutoMaskMode = false;
    let _autoMaskExec   = null;
    let _autoMaskPicks  = new Set();
    let _autoMaskModel  = DETECTION_MODELS[0].value;
    let _autoMaskUseBox = true;

    /**
     * Convert a ComfyUI mask URL (white = masked, black = background) to a
     * canvas-compatible data URL where white pixels are opaque and black pixels
     * are fully transparent. This is required because MaskManager draws the mask
     * canvas at maskOpacity over the image — black pixels would show as a dark
     * tint if left opaque.
     *
     * @param {string} maskUrl - ComfyUI /view? URL of the mask image
     * @returns {Promise<string>} data URL safe to pass to canvas.setMaskDataURL()
     */
    async function _maskUrlToTransparentDataUrl(maskUrl) {
        const res  = await fetch(maskUrl);
        const blob = await res.blob();
        const bmp  = await createImageBitmap(blob);

        const tmp    = document.createElement('canvas');
        tmp.width    = bmp.width;
        tmp.height   = bmp.height;
        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
        tmpCtx.drawImage(bmp, 0, 0);
        bmp.close();

        const imageData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
        const data      = imageData.data;

        // White pixels (bright) → keep opaque white; black pixels → transparent
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < 128) {
                data[i + 3] = 0; // transparent — not masked
            } else {
                data[i]     = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = 255; // opaque white — masked area
            }
        }

        tmpCtx.putImageData(imageData, 0, 0);
        return tmp.toDataURL('image/png');
    }

    /**
     * Run the auto-mask workflow with current state.
     * Reuses the same exec pattern as runCommand but captures "Detected" + "Output".
     */
    /**
     * @param {boolean} [populateThumbs=false] - true = Detect run; populate thumbnails from
     *   the "Detected" node. false = picks run; thumbnails already shown, only update the mask.
     */
    function _runAutoMaskWorkflow(populateThumbs = false) {
        const currentItem = _group.history[_selectedIdx];
        if (!currentItem?.filePath) return;

        // Cancel any in-flight run before starting a new one
        _autoMaskExec?.cancel();

        _autoMaskExec = runAutoMask({
            imageUrl:       _resolveUrl(currentItem.filePath),
            detectorModel:  _autoMaskModel,
            useBox:         _autoMaskUseBox,
            picks:          _autoMaskPicks,
        });

        _autoMaskExec.onDetected = (urls) => {
            // Only repopulate thumbnails on an explicit Detect run — thumb-click
            // re-runs must never wipe the selection the user just made.
            if (populateThumbs) {
                autoMaskThumbs.el.setImages(urls);
            }
        };

        _autoMaskExec.onMask = async (maskUrl) => {
            if (_autoMaskPicks.size === 0) return; // all-black mask — don't apply
            try {
                const dataUrl = await _maskUrlToTransparentDataUrl(maskUrl);
                await _canvas.setMaskDataURL(dataUrl);
                _hasMask = true;
            } catch (err) {
                console.warn('[groupHistory] Failed to apply auto-mask:', err);
            }
        };

        _autoMaskExec.onError = (err) => {
            _autoMaskExec = null;
            console.error('[groupHistory] Auto-mask error:', err);
        };
    }

    function _enterAutoMaskMode() {
        _isAutoMaskMode = true;
        bottom.classList.add('gh-workspace__bottom--hidden');
        autoMaskBar.el.show();
    }

    /**
     * @param {boolean} apply - true = keep mask, false = discard mask
     */
    function _exitAutoMaskMode(apply) {
        _isAutoMaskMode = false;
        _autoMaskExec?.cancel();
        _autoMaskExec = null;

        if (!apply) {
            _canvas.clearMask();
            _hasMask = false;
        }

        autoMaskThumbs.el.clear();
        _autoMaskPicks.clear();

        bottom.classList.remove('gh-workspace__bottom--hidden');
        autoMaskBar.el.hide();
        historyTools.el.syncMode('none');
        _refreshOpOptions();
    }

    // Thumbnail strip — passed as topSlot to the action bar
    const autoMaskThumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
    autoMaskThumbs.on('change', ({ picks }) => {
        _autoMaskPicks = picks;
        _runAutoMaskWorkflow(false); // picks run — thumbnails stay as-is
    });

    // Detection model dropdown
    const autoMaskModelDropdown = MpiDropdown.mount(document.createElement('div'), {
        options:   DETECTION_MODELS,
        value:     _autoMaskModel,
        info:      'Detection model',
        direction: 'up',
    });
    autoMaskModelDropdown.on('change', ({ value }) => {
        _autoMaskModel = value;
        // Clear thumbnails and mask — new model means new detection run needed
        autoMaskThumbs.el.clear();
        autoMaskThumbs.el.clearPicks?.();
        _autoMaskPicks.clear();
        _canvas.clearMask();
        _hasMask = false;
    });

    // Box / Segment radio
    const autoMaskModeRadio = MpiRadioGroup.mount(document.createElement('div'), {
        options: [
            { label: 'Box',     value: 'box' },
            { label: 'Segment', value: 'segment' },
        ],
        value: 'box',
        name:  'auto-mask-mode',
        info:  'Detection mode',
    });
    autoMaskModeRadio.on('select', ({ value }) => {
        _autoMaskUseBox = value === 'box';
        // Clear thumbnails and mask — detection mode changed, results are stale
        autoMaskThumbs.el.clear();
        _autoMaskPicks.clear();
        _canvas.clearMask();
        _hasMask = false;
    });

    // Compose the left slot: dropdown + radio side by side
    const _autoMaskLeftSlot = document.createElement('div');
    _autoMaskLeftSlot.className = 'gh-auto-mask-controls';
    _autoMaskLeftSlot.appendChild(autoMaskModelDropdown.el);
    _autoMaskLeftSlot.appendChild(autoMaskModeRadio.el);
    // Wrap in a pseudo-instance so MpiToolActionBar accepts it via leftSlot.el
    const _autoMaskLeftSlotInst = { el: _autoMaskLeftSlot };

    const _autoMaskBarSlot = ce('div', { className: 'gh-bar-slot' });
    cropBar.appendChild(_autoMaskBarSlot);
    const autoMaskBar = MpiToolActionBar.mount(_autoMaskBarSlot, {
        topSlot:  autoMaskThumbs,
        leftSlot: _autoMaskLeftSlotInst,
        actions: [
            { key: 'detect', icon: 'search', label: 'Detect', variant: 'primary', info: 'Run detection' },
            { key: 'apply',  icon: 'check',  label: 'Apply',  variant: 'primary', info: 'Apply mask and exit' },
            { key: 'cancel', icon: 'close',  label: 'Cancel', variant: 'ghost',   info: 'Cancel and clear mask' },
        ],
    });
    autoMaskBar.on('action', ({ key }) => {
        if (key === 'detect') {
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _canvas.clearMask();
            _hasMask = false;
            _runAutoMaskWorkflow(true); // detect run — populate thumbnails
        }
        if (key === 'apply')  _exitAutoMaskMode(true);
        if (key === 'cancel') _exitAutoMaskMode(false);
    });

    // ── Selection bar ──────────────────────────────────────────────────────────

    const _selBarSlot = ce('div', { className: 'gh-workspace__bottom gh-workspace__bottom--hidden' });
    cropBar.appendChild(_selBarSlot);
    const selectionBar = MpiSelectionBar.mount(_selBarSlot, { count: 0 });

    selectionBar.on('compare', () => {
        if (_selection.size !== 2) return;
        const [idxA, idxB] = [..._selection];
        _showCompare(idxA, idxB);
    });

    selectionBar.on('delete', () => {
        // Sort descending so removing by index doesn't shift subsequent indices
        const indices = [..._selection].sort((a, b) => b - a);
        for (const idx of indices) {
            _maskStore.delete(idx);
            _group = removeHistoryEntry(_group, idx);
        }
        _selectedIdx = _group.selectedIndex;
        _exitSelectMode();
        _persistGroup();
        _buildHistoryCards();
        _showEntry(_group.history[_selectedIdx]);
    });

    selectionBar.on('cancel', () => {
        _exitSelectMode();
    });

    // ── Crop execution ────────────────────────────────────────────────────────

    async function _runCrop() {
        const rect = _canvas.getCropRect();
        const currentItem = _group.history[_selectedIdx];
        if (!currentItem?.filePath || !state.currentProject?.folderPath) return;

        StatusBar.progress.start('Cropping...');
        _exitCropMode();

        try {
            const res = await fetch('/project/crop-media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folderPath: state.currentProject.folderPath,
                    sourceFilePath: _resolveUrl(currentItem.filePath),
                    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
                }),
            });
            if (!res.ok) throw new Error(`crop-media ${res.status}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Crop failed');

            const newItem = createImageItem({
                filePath: `/project-file?path=${encodeURIComponent(data.filePath)}`,
                operation: data.filename.replace(/\.[^.]+$/, ''),
            });

            _group = appendToHistory(_group, newItem);
            _selectedIdx = _group.selectedIndex;
            _persistGroup();
            _buildHistoryCards();
            _showEntry(_group.history[_selectedIdx]);
            StatusBar.progress.complete('Crop saved!');
        } catch (err) {
            console.error('[groupHistory] Crop failed:', err);
            StatusBar.progress.cancel();
        }
    }

    const isVideo = _group.type === 'video';
    const installedModels = getModelsByType(isVideo ? 'video' : 'image').filter(m => m.installed !== false);

    // Derive activeModelId from state (canonical) with fallback to first installed
    let activeModelId = state.s_selectedModelId
        ? (installedModels.find(m => m.id === state.s_selectedModelId)?.id ?? installedModels[0]?.id ?? null)
        : (installedModels[0]?.id ?? null);

    // activeModel is derived from activeModelId and kept in sync via setModel()
    let activeModel = activeModelId
        ? (installedModels.find(m => m.id === activeModelId) || installedModels[0] || null)
        : (installedModels[0] || null);

    // Ensure state is in sync on mount
    if (activeModelId) state.s_selectedModelId = activeModelId;

    // In groupHistory there is always at least one existing image/video available
    // as input, so imageCount/videoCount start at 1.
    const _baseCtx = isVideo
        ? { imageCount: 0, videoCount: 1 }
        : { imageCount: 1, videoCount: 0 };

    function _opOptions(ctx = _baseCtx) {
        if (!activeModel) return [];
        const maskCtx = { ..._baseCtx, hasMask: _hasMask };
        return getAvailableCommands(activeModel.mediaType, activeModel, { ...maskCtx, ...ctx })
            // Exclude ops that need no input image — groupHistory always works on an existing entry
            .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
            .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
    }

    /** Re-evaluate which operations are available and sync the Block's operation dropdown. */
    function _refreshOpOptions() {
        if (!_promptBox) return;
        const opts = _opOptions();
        // Sync full context with current hasMask state and filterNoInputOps flag
        _promptBox.el.updateContext({ ..._baseCtx, hasMask: _hasMask, filterNoInputOps: true });
        // If the current operation just became disabled, switch to first available
        const currentStillOk = opts.find(o => o.value === activeOperation && !o.disabled);
        if (!currentStillOk) {
            const fallback = opts.find(o => !o.disabled);
            if (fallback) {
                activeOperation = fallback.value;
            }
            _promptBox.el.setOperation(activeOperation);
        }
    }

    // Default to first available operation (not t2i — groupHistory always has an input image)
    const _firstAvailable = _opOptions().find(o => !o.disabled);
    let activeOperation = isVideo ? 't2v' : (_firstAvailable?.value ?? 'upscale');

    let _promptBox = null;
    let _activeExec = null;

    // Model settings overlay — single instance for this workspace
    const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));

    /**
     * Mount the MpiPromptBox Block.
     * Called once on initial mount. Model changes use setModel() instead of remount.
     */
    if (activeModel) {
        _promptBox = MpiPromptBox.mount(bottom, {
            model:           activeModel,
            modelList:       installedModels,
            operation:       activeOperation,
            includeNegative: true,
        });

        // Set initial context so dropdown renders correctly
        _promptBox.el.updateContext({ ..._baseCtx, hasMask: _hasMask, filterNoInputOps: true });

        _promptBox.on('settings', () => {
            _settingsOverlay.el.open({ modelId: activeModel.id });
        });

        _promptBox.on('model-change', ({ model }) => {
            state.s_selectedModelId = model.id;
            activeModelId = model.id;
            activeModel  = model;
            _promptBox.el.setModel(model);
            _refreshOpOptions();
        });

        _promptBox.on('operation-change', ({ operation }) => {
            activeOperation = operation;
            _refreshOpOptions();
        });

        _promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams }) => {
            const maskDataUrl = _hasMask ? _canvas.getMaskDataURL('black', 'white') : null;
            _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl, injectionParams });
        });

        _promptBox.on('cancel', () => {
            _activeExec?.cancel();
            _activeExec = null;
            StatusBar.progress.cancel();
        });
    }

    // Radial menu operation sync
    const _onSetOp = ({ operation }) => {
        if (!_promptBox) return;
        const opts = _opOptions();
        const match = opts.find(o => o.value === operation && !o.disabled);
        if (match) {
            activeOperation = operation;
            _promptBox.el.setOperation(activeOperation);
        }
    };
    Events.on('workspace:set-operation', _onSetOp);

    // Subscribe to external model changes (e.g., from gallery switching models)
    const _onStateModelChange = ({ key, value }) => {
        if (key !== 's_selectedModelId') return;
        if (!value || value === activeModelId) return;
        const newModel = installedModels.find(m => m.id === value);
        if (newModel && newModel !== activeModel) {
            activeModelId = value;
            activeModel  = newModel;
            _promptBox.el.setModel(newModel);
            _refreshOpOptions();
        }
    };
    Events.on('state:changed', _onStateModelChange);

    // ── Generation ─────────────────────────────────────────────────────────────

    function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
        if (!activeModel) return;

        Events.emit('tool:running', { tool: 'groupHistory', type: operation });
        StatusBar.progress.start('Generating...');

        // Show spinner until first latent preview arrives
        _setGeneratingSpinner(true);

        // Always inject the current selected history entry as the input image
        // unless the user has already dropped a replacement image into the PromptBox.
        const currentItem = _group.history[_selectedIdx];
        const hasDroppedImage = mediaItems.some(m => m.mediaType === 'image');
        const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
            ? [{ url: _resolveUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
            : mediaItems;

        _activeExec = runCommand({
            operation,
            modelId: activeModel.id,
            positive,
            negative,
            mediaItems: resolvedMedia,
            maskDataUrl,
            injectionParams,
        });
        const exec = _activeExec;

        exec.onPreview = async (url) => {
            _setGeneratingSpinner(false); // hide spinner once latents start flowing
            _canvas.isComparisonMode = false;
            try { await _canvas.loadImage(url); } catch (_) { }
        };

        exec.onProgress = (value) => StatusBar.progress.update(value);

        exec.onComplete = async (urls) => {
            _activeExec = null;
            _promptBox?.el.setGenerating(false);
            _setGeneratingSpinner(false);

            if (!urls.length) {
                clientLogger.warn('groupHistory', 'Generation completed but no output returned.');
                StatusBar.progress.cancel();
                _showEntry(_group.history[_selectedIdx]);
                return;
            }

            let filePath = urls[0];
            let displayName = operation;

            if (state.currentProject?.folderPath) {
                try {
                    const res = await fetch('/project/save-generation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            folderPath: state.currentProject.folderPath,
                            comfyViewUrl: urls[0],
                            operation,
                            meta: { prompt: positive, negativePrompt: negative, modelId: activeModel.id },
                        }),
                    });
                    if (!res.ok) throw new Error(`save-generation ${res.status}`);
                    const data = await res.json();
                    if (data.success) {
                        filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                        displayName = data.filename.replace(/\.[^.]+$/, '');
                    }
                } catch (err) {
                    clientLogger.warn('groupHistory', 'save-generation failed, using comfy URL:', err);
                }
            }

            const newItem = createImageItem({
                filePath,
                modelId: activeModel.id,
                operation: displayName,
                prompt: positive,
                negativePrompt: negative,
            });

            // Clear mask after a successful generation — all saved masks are stale
            _maskStore.clear();
            _canvas.clearMask();
            _hasMask = false;
            _refreshOpOptions();

            _group = appendToHistory(_group, newItem);
            _selectedIdx = _group.selectedIndex; // appendToHistory selects the new entry
            _persistGroup();
            _buildHistoryCards();
            _showEntry(_group.history[_selectedIdx]);
            Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
            StatusBar.progress.complete('Done!');
        };

        exec.onError = (err) => {
            _activeExec = null;
            _promptBox?.el.setGenerating(false);
            _setGeneratingSpinner(false);
            Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
            StatusBar.progress.cancel();
            _showEntry(_group.history[_selectedIdx]);
            clientLogger.error('groupHistory', 'Generation error:', err);
        };
    }

    // ── Persistence ────────────────────────────────────────────────────────────

    function _persistGroup() {
        if (!state.currentProject) return;
        state.currentProject = updateGroupInProject(state.currentProject, _group);
        Events.emit('media:updated', { projectId: state.currentProject.id });
        fetch('/update-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath: state.currentProject.folderPath,
                updates: { itemGroups: state.currentProject.itemGroups },
            }),
        }).catch(err => console.warn('[groupHistory] update-project failed:', err));
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    _buildHistoryCards();
    _showEntry(_group.history[_selectedIdx]);

    // ── Zero-installed state modal ─────────────────────────────────────────
    const _modelsModal = MpiModelsModal.mount(document.createElement('div'), {
        icon: 'download',
        title: 'Model Manager',
        text: 'Select a model pack to install. Required files will be fetched automatically.',
        footer: 'Models are stored locally and never shared.',
        closable: true,
    });
    _modelsModal.el.hide();

    // True if at least one image model is installed on disk
    const _hasInstalledImageModels = () => getModelsByType('image').some(m => m.installed === true);

    const _onZeroInstalled = ({ key }) => {
        if (key !== 's_installedModelIds') return;
        if (!_hasInstalledImageModels()) _modelsModal.el.show();
    };
    Events.on('state:changed', _onZeroInstalled);
    Events.on('models:all-installed', () => _modelsModal.el.hide());

    // Immediate check — MODELS already patched in place by syncModelInstalled
    if (!_hasInstalledImageModels()) _modelsModal.el.show();

    // ── Cleanup ────────────────────────────────────────────────────────────────

    const _observer = new MutationObserver(() => {
        if (!document.contains(container)) {
            Events.off('workspace:set-operation', _onSetOp);
            Events.off('state:changed', _onStateModelChange);
            Events.off('state:changed', _onZeroInstalled);
            _canvas.destroy();
            _observer.disconnect();
        }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
}
