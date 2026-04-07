/**
 * groupHistory.js — Item Group History workspace.
 *
 * Shows the full generation history of a single ItemGroup.
 *
 * Layout:
 *   Left toolbar  — compare tool (+ crop/mask in future sessions)
 *   Centre        — InteractiveCanvas viewer (pan/zoom, mask/compare modes)
 *   Right panel   — scrollable history stack with always-visible checkboxes
 *   Bottom        — MpiPromptBox (floating, same style as gallery)
 *
 * Entry point: mount(container, params)
 * @param {HTMLElement} container
 * @param {{ groupId: string }} params
 */

import { state }             from '../../state.js';
import { Events }            from '../../events.js';
import { navigate, PAGE_GALLERY } from '../../router.js';
import { ce }                from '../../utils/dom.js';
import { MpiButton }         from '../../components/Primitives/MpiButton/MpiButton.js';
import { MpiPromptBox }      from '../../components/Compounds/MpiPromptBox/MpiPromptBox.js';
import { MpiDropdown }       from '../../components/Primitives/MpiDropdown/MpiDropdown.js';
import { MpiSpinner }        from '../../components/Primitives/MpiSpinner/MpiSpinner.js';
import { InteractiveCanvas } from '../../components/interactiveCanvas.js';
import { getModelsByType }   from '../../data/modelRegistry.js';
import { getAvailableCommands } from '../../data/commandRegistry.js';
import { runCommand }        from '../../services/commandExecutor.js';
import { StatusBar }         from '../../shell/statusBar.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    updateGroupInProject,
    createImageItem,
} from '../../data/projectModel.js';

// ── CSS ────────────────────────────────────────────────────────────────────────

let _cssLoaded = false;
function _ensureCss() {
    if (_cssLoaded) return;
    _cssLoaded = true;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
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

    let _selectedIdx  = _group.selectedIndex ?? 0;
    /** Indices checked for compare (max 2) */
    const _compareSet = new Set();

    // ── Scaffold ───────────────────────────────────────────────────────────────

    container.innerHTML = '';
    container.classList.add('gh-workspace');

    const header      = ce('div', { className: 'gh-workspace__header' });
    const leftBar     = ce('div', { className: 'gh-workspace__left' });
    const centre      = ce('div', { className: 'gh-workspace__centre' });
    const rightPanel  = ce('div', { className: 'gh-workspace__right' });
    const bottom      = ce('div', { className: 'gh-workspace__bottom' });

    container.append(header, leftBar, centre, rightPanel, bottom);

    // ── InteractiveCanvas viewer ───────────────────────────────────────────────

    const canvasWrap    = ce('div', { className: 'gh-canvas-wrap' });
    const spinnerWrap   = ce('div', { className: 'gh-canvas-spinner' });
    MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });
    centre.appendChild(canvasWrap);
    centre.appendChild(spinnerWrap);

    const _canvas = new InteractiveCanvas(canvasWrap);

    function _setGeneratingSpinner(on) {
        spinnerWrap.classList.toggle('gh-canvas-spinner--visible', on);
    }

    async function _showEntry(item) {
        if (!item?.filePath) return;
        // Exit compare mode before showing a single entry
        _canvas.isComparisonMode = false;
        try {
            await _canvas.loadImage(_resolveUrl(item.filePath));
        } catch (err) {
            console.warn('[groupHistory] Failed to load image into canvas:', err);
        }
    }

    async function _showCompare(idxA, idxB) {
        const itemA = _group.history[idxA];
        const itemB = _group.history[idxB];
        if (!itemA?.filePath || !itemB?.filePath) return;
        try {
            await _canvas.loadImage(_resolveUrl(itemA.filePath));
            await _canvas.loadComparisonImage(_resolveUrl(itemB.filePath));
            _canvas.isComparisonMode = true;
        } catch (err) {
            console.warn('[groupHistory] Failed to load compare images:', err);
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

            // Always-visible checkbox for compare selection
            const cbWrap = ce('label', { className: 'gh-history__cb-wrap' });
            const cb = ce('input', { type: 'checkbox', className: 'gh-history__cb' });
            cb.checked = _compareSet.has(idx);
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                _toggleCompare(idx, cb.checked);
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

            // Click on card body (not checkbox) → select and display
            card.addEventListener('click', (e) => {
                if (e.target === cb || e.target === cbWrap) return;
                _selectEntry(idx);
            });

            historyList.appendChild(card);
            _historyCards.push(card);
        });

        _applyCardStates();
    }

    function _applyCardStates() {
        _historyCards.forEach((card, idx) => {
            card.classList.toggle('gh-history__card--active',  idx === _selectedIdx);
            card.classList.toggle('gh-history__card--compare', _compareSet.has(idx));
            const cb = card.querySelector('.gh-history__cb');
            if (cb) cb.checked = _compareSet.has(idx);
        });
    }

    function _selectEntry(idx) {
        _selectedIdx = idx;
        // Selecting a card exits compare mode
        _compareSet.clear();
        _applyCardStates();
        _showEntry(_group.history[idx]);

        // Persist selectedIndex
        _group = promoteHistoryEntry(_group, idx);
        _persistGroup();
    }

    // ── Compare selection ──────────────────────────────────────────────────────

    function _toggleCompare(idx, checked) {
        if (checked) {
            if (_compareSet.size >= 2) {
                const [oldest] = _compareSet;
                _compareSet.delete(oldest);
            }
            _compareSet.add(idx);
        } else {
            _compareSet.delete(idx);
        }
        _applyCardStates();

        if (_compareSet.size === 2) {
            const [idxA, idxB] = [..._compareSet];
            _showCompare(idxA, idxB);
        } else if (_compareSet.size === 0) {
            _showEntry(_group.history[_selectedIdx]);
        }
        // size === 1: keep current canvas view unchanged
    }

    // ── Left toolbar ───────────────────────────────────────────────────────────

    // ── PromptBox ──────────────────────────────────────────────────────────────

    const isVideo     = _group.type === 'video';
    const models      = getModelsByType(isVideo ? 'video' : 'image');
    let activeModel   = models[0] || null;

    // In groupHistory there is always at least one existing image/video available
    // as input, so imageCount/videoCount start at 1.
    const _baseCtx = isVideo
        ? { imageCount: 0, videoCount: 1 }
        : { imageCount: 1, videoCount: 0 };

    function _opOptions(ctx = _baseCtx) {
        if (!activeModel) return [];
        return getAvailableCommands(activeModel.mediaType, activeModel, ctx)
            // Exclude ops that need no input image — groupHistory always works on an existing entry
            .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
            .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
    }

    // Default to first available operation (not t2i — groupHistory always has an input image)
    const _firstAvailable = _opOptions().find(o => !o.disabled);
    let activeOperation = isVideo ? 't2v' : (_firstAvailable?.value ?? 'upscale');

    let _opDropdown = null;
    let _promptBox  = null;
    let _activeExec = null;

    if (activeModel) {
        _opDropdown = MpiDropdown.mount(ce('div'), {
            options:   _opOptions(),
            value:     activeOperation,
            info:      'Generation operation',
            direction: 'up',
        });
        _opDropdown.on('change', ({ value }) => {
            activeOperation = value;
            _promptBox?.el.setOperation(activeOperation);
            Events.emit('workspace:set-operation', { operation: activeOperation });
        });

        _promptBox = MpiPromptBox.mount(bottom, {
            model:           activeModel,
            operation:       activeOperation,
            includeNegative: true,
            rightA:          _opDropdown,
        });

        _promptBox.on('run', ({ operation, positive, negative, mediaItems }) => {
            _runGenerate({ operation, positive, negative, mediaItems });
        });

        _promptBox.on('cancel', () => {
            _activeExec?.cancel();
            _activeExec = null;
            StatusBar.progress.cancel();
        });
    }

    // Radial menu operation sync
    const _onSetOp = ({ operation }) => {
        if (!_opDropdown) return;
        const opts = _opOptions();
        const match = opts.find(o => o.value === operation);
        if (match && !match.disabled) {
            activeOperation = operation;
            _opDropdown.el.setOptions(opts, activeOperation);
            _promptBox?.el.setOperation(activeOperation);
        }
    };
    Events.on('workspace:set-operation', _onSetOp);

    // ── Generation ─────────────────────────────────────────────────────────────

    function _runGenerate({ operation, positive, negative, mediaItems = [] }) {
        if (!activeModel) return;

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
            modelId:   activeModel.id,
            positive,
            negative,
            mediaItems: resolvedMedia,
        });
        const exec = _activeExec;

        exec.onPreview = async (url) => {
            _setGeneratingSpinner(false); // hide spinner once latents start flowing
            _canvas.isComparisonMode = false;
            try { await _canvas.loadImage(url); } catch (_) {}
        };

        exec.onProgress = (value) => StatusBar.progress.update(value);

        exec.onComplete = async (urls) => {
            _activeExec = null;
            _promptBox?.el.setGenerating(false);
            _setGeneratingSpinner(false);

            if (!urls.length) {
                console.warn('[groupHistory] Generation completed but no output returned.');
                StatusBar.progress.cancel();
                _showEntry(_group.history[_selectedIdx]);
                return;
            }

            let filePath    = urls[0];
            let displayName = operation;

            if (state.currentProject?.folderPath) {
                try {
                    const res = await fetch('/project/save-generation', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            folderPath:   state.currentProject.folderPath,
                            comfyViewUrl: urls[0],
                            operation,
                            meta: { prompt: positive, negativePrompt: negative, modelId: activeModel.id },
                        }),
                    });
                    if (!res.ok) throw new Error(`save-generation ${res.status}`);
                    const data = await res.json();
                    if (data.success) {
                        filePath    = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                        displayName = data.filename.replace(/\.[^.]+$/, '');
                    }
                } catch (err) {
                    console.warn('[groupHistory] save-generation failed, using comfy URL:', err);
                }
            }

            const newItem = createImageItem({
                filePath,
                modelId:        activeModel.id,
                operation:      displayName,
                prompt:         positive,
                negativePrompt: negative,
            });

            _group = appendToHistory(_group, newItem);
            _selectedIdx = _group.selectedIndex; // appendToHistory selects the new entry
            _persistGroup();
            _buildHistoryCards();
            _showEntry(_group.history[_selectedIdx]);
            StatusBar.progress.complete('Done!');
        };

        exec.onError = (err) => {
            _activeExec = null;
            _promptBox?.el.setGenerating(false);
            _setGeneratingSpinner(false);
            StatusBar.progress.cancel();
            _showEntry(_group.history[_selectedIdx]);
            console.error('[groupHistory] Generation error:', err);
        };
    }

    // ── Persistence ────────────────────────────────────────────────────────────

    function _persistGroup() {
        if (!state.currentProject) return;
        state.currentProject = updateGroupInProject(state.currentProject, _group);
        fetch('/update-project', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                folderPath: state.currentProject.folderPath,
                updates:    { itemGroups: state.currentProject.itemGroups },
            }),
        }).catch(err => console.warn('[groupHistory] update-project failed:', err));
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    _buildHistoryCards();
    _showEntry(_group.history[_selectedIdx]);

    // ── Cleanup ────────────────────────────────────────────────────────────────

    const _observer = new MutationObserver(() => {
        if (!document.contains(container)) {
            Events.off('workspace:set-operation', _onSetOp);
            _canvas.destroy();
            _observer.disconnect();
        }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
}
