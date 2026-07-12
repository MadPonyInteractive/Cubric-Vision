/**
 * MpiCanvasViewer — Organism: canvas display with tool mode state machine.
 *
 * Manages crop, mask, and auto-mask modes. Owns the mask store (Map<idx, dataUrl>).
 *
 * @param {string} [initialImageUrl=''] - URL of the first image to load
 * @param {number} [initialIdx=0]        - History index of the initial image
 * @param {object} [initialItem=null]    - Full HistoryItem for the initial image (provides id for TEMP mask persistence)
 * @param {string} [groupId=null]        - Owning group's id (component of TEMP mask key path)
 *
 * Instance API (on el):
 *   el.loadEntry(item, idx)            — save current mask, load item's image, restore idx's mask
 *   el.loadCompare(itemA, itemB)       — load two images in compare mode
 *   el.enterMode(mode)                — enter 'crop'|'mask'|'automask' (or 'none' to exit all)
 *   el.exitMode()                     — exit any active tool mode
 *   el.getCurrentMaskDataURL()         — returns current mask as data URL, or null
 *   el.hasMask()                      — returns boolean
 *   el.setGenerating(bool)             — show/hide generating spinner
 *
 * Emits:
 *   'mode-changed'    { mode }        — tool mode changed (from any source)
 *   'crop-applied'    { item }        — crop completed; item is the new HistoryItem
 *   'mask-ready'      { hasMask }     — mask painted or cleared
 *   'entry-loaded'    { idx, hasMask } — image loaded for index
 *   'compare-clicked'               — user clicked the Compare overlay button
 */

import { ComponentFactory } from '../../factory.js';
import { MpiCanvas } from '../../Primitives/MpiCanvas/MpiCanvas.js';
import { MpiMaskedImagePreview } from '../../Primitives/MpiMaskedImagePreview/MpiMaskedImagePreview.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { MpiAutoMaskThumbs } from '../../Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.js';
import { MpiViewerCorners } from '../../Compounds/MpiViewerCorners/MpiViewerCorners.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { hasMaskContent } from '../../../utils/maskUtils.js';
import { runAutoMask } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { state } from '../../../state.js';
import { createImageItem, getToolSettings } from '../../../data/projectModel.js';
import { roundToDivisible } from '../../../utils/cropRounding.js';
import { qs, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';
import { maskTempStore } from '../../../services/maskTempStore.js';
import { clientLogger } from '../../../services/clientLogger.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

const AUTO_MASK_QUEUE_DISABLED_REASON = 'Auto detection is unavailable while Cue has running or queued jobs';

export const MpiCanvasViewer = ComponentFactory.create({
    name: 'MpiCanvasViewer',
    css: ['js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.css'],

    template: () => `
        <div class="mpi-canvas-viewer">
            <div class="mpi-canvas-viewer__wrap" id="canvas-wrap"></div>
            <div class="mpi-canvas-viewer__spinner" id="spinner-wrap"></div>
            <div class="mpi-canvas-viewer__corners" id="corners-mount"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const initialImageUrl = props.initialImageUrl || '';
        const initialIdx = props.initialIdx ?? 0;
        const initialItem = props.initialItem || null;
        const _groupId = props.groupId || null;

        // ── State ─────────────────────────────────────────────────────────────

        /** Single mode enum replaces three booleans: crop/mask/automask/none */
        let _currentMode = 'none';
        let _activeCropRatio = SOCIAL_RATIOS[0].ratio;
        let _hasMask = false;
        /** Composite mask cache for active prompt-tool preview swap (canvas destroyed) */
        let _previewMaskCache = null;

        function _maskKey(item) {
            const projectId = state.currentProject?.id;
            const itemId = item?.id;
            if (!projectId || !_groupId || !itemId) return null;
            return { projectId, groupId: _groupId, itemId };
        }

        async function _persistLayers(item) {
            const k = _maskKey(item);
            if (!k) return;
            const manualUrl = _cv.el?.getManualURL?.() || null;
            const subtractUrl = _cv.el?.getSubtractURL?.() || null;
            if (manualUrl) await maskTempStore.writeManual(k.projectId, k.groupId, k.itemId, manualUrl);
            if (subtractUrl) await maskTempStore.writeSubtract(k.projectId, k.groupId, k.itemId, subtractUrl);
        }

        async function _loadImg(dataUrl) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = dataUrl;
            });
        }

        // Build composite ((manual + auto) MINUS subtract) B/W PNG from TEMP layers.
        // Returns null when no positive layer is present. Used to seed preview-mode
        // mask after history-entry switch (canvas torn down).
        async function _buildCompositeFromTemp(item) {
            const k = _maskKey(item);
            if (!k) return null;
            const { manual, subtract, auto } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            const autoEntry = _normalizeAutoTempEntry(auto);
            if (!manual && autoEntry.urls.length === 0) return null;
            try {
                const seedUrl = manual || autoEntry.urls[0];
                const seedImg = await _loadImg(seedUrl);
                const w = seedImg.naturalWidth;
                const h = seedImg.naturalHeight;
                if (!w || !h) return null;
                const tmp = document.createElement('canvas');
                tmp.width = w;
                tmp.height = h;
                const ctx = tmp.getContext('2d');
                if (manual) ctx.drawImage(seedImg, 0, 0);
                for (const url of autoEntry.urls) {
                    const autoImg = await _loadImg(url);
                    ctx.drawImage(autoImg, 0, 0, w, h);
                }
                if (subtract) {
                    const subImg = await _loadImg(subtract);
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.drawImage(subImg, 0, 0, w, h);
                    ctx.globalCompositeOperation = 'source-over';
                }
                // Flatten remaining alpha → opaque white-on-black for prompt-tool consumers
                const src = ctx.getImageData(0, 0, w, h);
                const out = document.createElement('canvas');
                out.width = w; out.height = h;
                const octx = out.getContext('2d');
                const outData = octx.createImageData(w, h);
                for (let i = 0; i < src.data.length; i += 4) {
                    const v = src.data[i + 3] > 0 ? 255 : 0;
                    outData.data[i] = v;
                    outData.data[i + 1] = v;
                    outData.data[i + 2] = v;
                    outData.data[i + 3] = 255;
                }
                octx.putImageData(outData, 0, 0);
                return out.toDataURL('image/png');
            } catch (err) {
                console.warn('[MpiCanvasViewer] composite build failed:', err);
                return null;
            }
        }

        async function _restoreLayers(item) {
            const k = _maskKey(item);
            if (!k) { _hasMask = false; return; }
            const { manual, subtract } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            if (manual)   await _cv.el.setManualFromDataURL(manual);
            if (subtract) await _cv.el.setSubtractFromDataURL(subtract);
            _hasMask = !!(_cv.el?.maskCanvas && hasMaskContent(_cv.el.maskCanvas));
        }

        // ── Canvas + spinner ─────────────────────────────────────────────────

        const spinnerWrap = qs('#spinner-wrap', el);
        MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });

        /** MpiMaskedImagePreview instance while prompt mode is active, null otherwise */
        let _previewInst = null;

        // Mutable canvas ref — replaced on swapToCanvas remount.
        // All internal code accesses canvas via _cv.el so remount is transparent.
        const _cv = {
            inst: MpiCanvas.mount(qs('#canvas-wrap', el), {
                onBrushTypeChange: (type) => {
                    emit('brush-changed', { type: type === 'eraser' ? 'eraser' : 'brush' });
                },
            }),
        };
        Object.defineProperty(_cv, 'el', { get() { return this.inst.el; }, configurable: true });

        // Convenience alias — always resolves via _cv.el; methods auto-bound to current _cv.el
        const canvas = new Proxy({}, {
            get(_, k) {
                const v = _cv.el[k];
                return (typeof v === 'function') ? v.bind(_cv.el) : v;
            },
            set(_, k, v) { _cv.el[k] = v; return true; },
        });

        let _isGenerating = false;
        let _isLoading = false;
        function _syncSpinner() {
            spinnerWrap.classList.toggle('mpi-canvas-viewer__spinner--visible', _isGenerating || _isLoading);
        }
        function _setGeneratingSpinner(on) {
            _isGenerating = !!on;
            _syncSpinner();
        }
        function _setLoadingSpinner(on) {
            _isLoading = !!on;
            _syncSpinner();
        }

        let _comparingActive = false;

        // ── Image loading ─────────────────────────────────────────────────────

        async function _showEntry(item) {
            if (!item?.filePath) return;
            try {
                await canvas.loadImage(_resolveUrl(item.filePath));
            } catch (err) {
                console.warn('[MpiCanvasViewer] Failed to load image into canvas:', err);
            }
        }

        let _loadingComparison = false;
        let _loadingEntry = false;

        async function _showCompare(itemA, itemB) {
            if (!itemA?.filePath || !itemB?.filePath) return;
            try {
                _loadingComparison = true;
                _comparingActive = true;
                _compareNameA = _labelOf(itemA);
                _compareNameB = _labelOf(itemB);
                _renderCorners();
                await canvas.loadImage(_resolveUrl(itemA.filePath));
                await canvas.loadComparisonImage(_resolveUrl(itemB.filePath));
                // After comparison is fully loaded, emit the final mode-changed event
                emit('mode-changed', { mode: _currentMode });
            } catch (err) {
                console.warn('[MpiCanvasViewer] Failed to load compare images:', err);
            } finally {
                _loadingComparison = false;
            }
        }

        function _labelOf(item) {
            const raw = item?.name || item?.displayName || '';
            if (raw) return raw.length > 28 ? raw.slice(0, 27) + '…' : raw;
            const fp = (item?.filePath || '').replace(/\\/g, '/').split('/').pop() || '';
            const dot = fp.lastIndexOf('.');
            return dot > 0 ? fp.slice(0, dot) : fp;
        }

        // ── Auto-mask state + thumbs (bars/dropdowns moved to MpiToolOptions*) ─

        /** @type {import('../../../services/commandExecutor.js').AutoMaskExec|null} */
        let _autoMaskExec = null;
        /** @type {Set<number>} */
        let _autoMaskPicks = new Set();
        const DETECTION_MODELS = [
            { label: 'Face',   value: 'bbox/face_yolov8n.pt' },
            { label: 'Hand',   value: 'bbox/hand_yolov8n.pt' },
            { label: 'Person', value: 'bbox/person_yolov8n-seg.pt' },
        ];
        let _autoMaskModel = DETECTION_MODELS[0].value;
        let _autoMaskUseBox = true;
        // Display-only invert state. Held on the viewer (not just the canvas)
        // so it survives the canvas teardown/remount that swapToPreview/swapToCanvas
        // performs. Re-applied to the fresh MpiCanvas after every remount.
        let _isMaskInverted = false;
        // Per-item auto-mask state.
        //   Map<itemId, { thumbs: string[], urls: string[], picks: number[] }>
        //   thumbs — detect-node preview images (visual)
        //   urls   — mask images (composited onto canvas)
        // RAM-only (auto-mask is session-scoped per plan); rehydrates on
        // swapToCanvas + on history-entry switch.
        const _autoPickStore = new Map();
        let _lastDetectThumbUrls = [];

        function _isCueBusy() {
            return (state.generationQueueCount || 0) > 0;
        }

        function _notifyAutoMaskBlocked() {
            StatusBar.notify(AUTO_MASK_QUEUE_DISABLED_REASON, 'warning');
        }

        // Viewer retains ownership of the thumbs instance; MpiToolOptionsMask
        // re-parents the DOM node via getAutoMaskThumbsEl(). DO NOT destroy it
        // from the options compound — detach only.
        const autoMaskThumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
        autoMaskThumbs.on('change', ({ picks }) => {
            _autoMaskPicks = picks;
            if (picks.size === 0) {
                // Drop auto layer only — preserve manual + subtract layers.
                canvas.clearAutoPicks();
                canvas.setSelectedAutoPicks(new Set());
                _hasMask = !!(canvas.maskCanvas && hasMaskContent(canvas.maskCanvas));
            } else {
                _runAutoMaskWorkflow(false);
            }
        });

        async function _maskUrlToTransparentDataUrl(maskUrl) {
            if (typeof maskUrl === 'string' && maskUrl.startsWith('data:')) return maskUrl;
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

            for (let i = 0; i < data.length; i += 4) {
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                if (brightness < 128) {
                    data[i + 3] = 0;
                } else {
                    data[i] = data[i + 1] = data[i + 2] = 255;
                    data[i + 3] = 255;
                }
            }

            tmpCtx.putImageData(imageData, 0, 0);
            return tmp.toDataURL('image/png');
        }

        async function _urlToDataUrl(url) {
            if (typeof url === 'string' && url.startsWith('data:')) return url;
            const res = await fetch(url);
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        }

        function _normalizeAutoTempEntry(auto) {
            if (!auto || typeof auto !== 'object') return { thumbs: [], urls: [], picks: [] };
            const picks = Array.isArray(auto.picks)
                ? auto.picks.filter(n => Number.isInteger(n) && n >= 0)
                : [];
            return {
                thumbs: Array.isArray(auto.thumbs) ? auto.thumbs.filter(Boolean) : [],
                urls: Array.isArray(auto.urls) ? auto.urls.filter(Boolean) : [],
                picks,
            };
        }

        function _runAutoMaskWorkflow(populateThumbs = false) {
            if (_isCueBusy()) {
                _notifyAutoMaskBlocked();
                return;
            }

            _autoMaskExec?.cancel();

            const imageUrl = _currentItem?.filePath
                ? _resolveUrl(_currentItem.filePath)
                : initialImageUrl;
            if (!imageUrl) {
                StatusBar.notify('No image selected', 'warning');
                return;
            }

            const sourceItem = _currentItem;
            const sourceKey = _autoPickKey(sourceItem);
            const runPicks = new Set(_autoMaskPicks);
            const exec = runAutoMask({
                imageUrl,
                detectorModel: _autoMaskModel,
                useBox:        _autoMaskUseBox,
                picks:         runPicks,
            });
            _autoMaskExec = exec;

            const isCurrentRun = () =>
                _autoMaskExec === exec
                && (!sourceKey || _autoPickKey(_currentItem) === sourceKey);

            exec.onDetected = (urls) => {
                if (!isCurrentRun()) return;
                if (!urls || urls.length === 0) {
                    StatusBar.notify('Nothing detected', 'warning');
                    exec.cancel();
                    _autoMaskExec = null;
                    if (populateThumbs) autoMaskThumbs.el.setImages([]);
                    return;
                }
                _lastDetectThumbUrls = [...urls];
                if (populateThumbs) {
                    autoMaskThumbs.el.setImages(urls);
                }
            };

            exec.onMasks = async (maskUrls) => {
                if (!isCurrentRun()) return;
                if (runPicks.size === 0) return;
                if (maskUrls.length !== runPicks.size) {
                    clientLogger.warn('automask',
                        `mask list length ${maskUrls.length} != picks ${runPicks.size}; clearing auto picks`);
                    canvas.clearAutoPicks();
                    canvas.setSelectedAutoPicks(new Set());
                    _hasMask = !!(canvas.maskCanvas && hasMaskContent(canvas.maskCanvas));
                    return;
                }
                try {
                    const bitmaps = await Promise.all(
                        maskUrls.map(async (u) => {
                            const dataUrl = await _maskUrlToTransparentDataUrl(u);
                            const res = await fetch(dataUrl);
                            const blob = await res.blob();
                            return await createImageBitmap(blob);
                        })
                    );
                    const sortedPicks = [...runPicks].sort((a, b) => a - b);
                    const map = new Map();
                    sortedPicks.forEach((pickIdx, i) => map.set(pickIdx, bitmaps[i]));
                    canvas.setAutoPickMasks(map);
                    canvas.setSelectedAutoPicks(runPicks);
                    await _saveAutoPickEntry(sourceItem, [...maskUrls], runPicks, _lastDetectThumbUrls);
                    _hasMask = true;
                } catch (err) {
                    clientLogger.warn('automask', `Failed to apply auto-masks: ${err?.message || err}`);
                }
            };

            exec.onError = (err) => {
                if (_autoMaskExec !== exec) return;
                _autoMaskExec = null;
                clientLogger.error('automask', 'Auto-mask error', err);
            };
        }

        function _autoPickKey(item) { return item?.id || null; }

        async function _saveAutoPickEntry(item, urls, picks, thumbs) {
            const key = _autoPickKey(item);
            if (!key) return;
            if (!urls?.length || !picks?.size) {
                _autoPickStore.delete(key);
                const k = _maskKey(item);
                if (k) await maskTempStore.deleteAuto(k.projectId, k.groupId, k.itemId);
                return;
            }
            const selected = [...picks].sort((a, b) => a - b);
            const selectedUrls = urls.length === selected.length
                ? [...urls]
                : selected.map(idx => urls[idx]).filter(Boolean);
            if (selectedUrls.length !== selected.length) {
                _autoPickStore.delete(key);
                const k = _maskKey(item);
                if (k) await maskTempStore.deleteAuto(k.projectId, k.groupId, k.itemId);
                return;
            }
            const persistedUrls = await Promise.all(selectedUrls.map(_maskUrlToTransparentDataUrl));
            const persistedThumbs = await Promise.all((thumbs ? [...thumbs] : [...urls]).map(_urlToDataUrl));
            _autoPickStore.set(key, {
                thumbs: persistedThumbs,
                urls: persistedUrls,
                picks: selected,
            });
            const k = _maskKey(item);
            if (k) {
                await maskTempStore.writeAuto(k.projectId, k.groupId, k.itemId, {
                    thumbs: persistedThumbs,
                    urls: persistedUrls,
                    picks: selected,
                });
            }
        }

        function _clearAutoPickEntry(item, persist = false) {
            const key = _autoPickKey(item);
            if (key) _autoPickStore.delete(key);
            if (persist) {
                const k = _maskKey(item);
                if (k) maskTempStore.deleteAuto(k.projectId, k.groupId, k.itemId).catch(() => {});
            }
        }

        // Persist current viewer auto-pick state to the store before tearing
        // down or switching items. Reads thumbs picks (DOM-truth across remount).
        async function _persistCurrentAutoPicks() {
            if (!_currentItem) return;
            const thumbPicks = autoMaskThumbs.el.getPicks?.() ?? new Set();
            const cached = _autoPickStore.get(_autoPickKey(_currentItem));
            const urls = cached?.urls ?? [];
            const thumbs = cached?.thumbs ?? _lastDetectThumbUrls;
            if (thumbPicks.size > 0 && urls.length > 0) {
                await _saveAutoPickEntry(_currentItem, urls, thumbPicks, thumbs);
            } else if (cached || thumbPicks.size > 0) {
                _clearAutoPickEntry(_currentItem, true);
            }
        }

        async function _loadAutoPickEntryFromTemp(item) {
            const key = _autoPickKey(item);
            const k = _maskKey(item);
            if (!key || !k) return null;
            const { auto } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            const entry = _normalizeAutoTempEntry(auto);
            if (entry.urls.length === 0 || entry.picks.length === 0) {
                _autoPickStore.delete(key);
                return null;
            }
            _autoPickStore.set(key, entry);
            _autoMaskPicks = new Set(entry.picks);
            return entry;
        }

        // Rehydrate thumbs DOM + viewer state for the given item from store.
        // Does NOT trigger the bitmap fetch — call _restoreAutoPickMasks after
        // canvas is ready.
        async function _hydrateThumbsForItem(item) {
            const entry = _autoPickStore.get(_autoPickKey(item)) || await _loadAutoPickEntryFromTemp(item);
            if (!entry) {
                autoMaskThumbs.el.clear();
                _autoMaskPicks.clear();
                _lastDetectThumbUrls = [];
                return;
            }
            autoMaskThumbs.el.setImages(entry.thumbs);
            const picksSet = new Set(entry.picks);
            autoMaskThumbs.el.setPicks(picksSet);
            _autoMaskPicks = picksSet;
            _lastDetectThumbUrls = [...entry.thumbs];
        }

        // Rehydrate auto-pick bitmaps onto the canvas from the cached URLs.
        // Call after canvas remount (swapToCanvas) and after entry switch
        // (loadEntry) once the new image is loaded.
        async function _restoreAutoPickMasks() {
            // Sync viewer Set from thumbs — DOM keeps the visual selection
            // across MpiToolOptionsMask remount; the viewer's Set is reset.
            const thumbPicks = autoMaskThumbs.el.getPicks?.() ?? new Set();
            if (thumbPicks.size > 0) _autoMaskPicks = thumbPicks;
            const entry = _autoPickStore.get(_autoPickKey(_currentItem));
            const urls = entry?.urls ?? [];
            if (_autoMaskPicks.size === 0 && entry?.picks?.length) {
                _autoMaskPicks = new Set(entry.picks);
                autoMaskThumbs.el.setPicks?.(_autoMaskPicks);
            }
            if (_autoMaskPicks.size === 0 || urls.length === 0) return;
            if (urls.length !== _autoMaskPicks.size) {
                _resetAutoPickStateWithToast();
                return;
            }
            try {
                const bitmaps = await Promise.all(
                    urls.map(async (u) => {
                        const dataUrl = await _maskUrlToTransparentDataUrl(u);
                        return await _loadImg(dataUrl);
                    })
                );
                const sortedPicks = [..._autoMaskPicks].sort((a, b) => a - b);
                const map = new Map();
                sortedPicks.forEach((idx, i) => map.set(idx, bitmaps[i]));
                canvas.setAutoPickMasks(map);
                canvas.setSelectedAutoPicks(_autoMaskPicks);
                _hasMask = true;
            } catch (err) {
                console.warn('[MpiCanvasViewer] auto-pick restore failed:', err);
                _resetAutoPickStateWithToast();
            }
        }

        function _resetAutoPickStateWithToast() {
            _clearAutoPickEntry(_currentItem, true);
            _autoMaskPicks.clear();
            _lastDetectThumbUrls = [];
            autoMaskThumbs.el.clear();
            canvas.clearAutoPicks();
            canvas.setSelectedAutoPicks(new Set());
            StatusBar.notify('Auto-mask picks expired — re-run detect', 'warning');
        }

        function _exitAutoMaskMode(apply) {
            _autoMaskExec?.cancel();
            _autoMaskExec = null;

            if (!apply) {
                // Drop auto layer only; preserve manual + subtract.
                canvas.clearAutoPicks();
                canvas.setSelectedAutoPicks(new Set());
                _clearAutoPickEntry(_currentItem, true);
            }
            // apply=true: keep auto picks composited.

            const hasContent = !!(canvas.maskCanvas && hasMaskContent(canvas.maskCanvas));
            _hasMask = hasContent;
            if (hasContent) emit('mask-ready', { hasMask: true });
            else            emit('mask-clear', {});
        }

        // ── Tool mode state machine ───────────────────────────────────────────

        /** Single _currentMode replaces _isCropMode, _isMaskMode, _isAutoMaskMode */
        function _enterMode(mode) {
            if (_currentMode === mode) return;
            _currentMode = mode;

            if (mode === 'crop') {
                canvas.activeMode = 'crop';
                canvas.setCropRatio(_activeCropRatio);
            } else if (mode === 'mask') {
                canvas.activeMode = 'mask';
            } else if (mode !== 'automask') {
                canvas.activeMode = 'none';
            }

            emit('mode-changed', { mode: _currentMode });
        }

        function _exitMode() {
            if (_currentMode === 'none') return;
            _currentMode = 'none';
            canvas.activeMode = 'none';
            emit('mode-changed', { mode: 'none' });
        }

        // ── Canvas modechange → sync with our state machine ──────────────────

        _cv.inst.on('modechange', ({ mode }) => {
            // While loading an entry, ignore canvas mode resets — loadEntry
            // restores the active tool mode after image load. Without this,
            // queued modechange('none') events from loadImage clobber the
            // restored mode (crop/mask/future tools).
            if (_loadingEntry) return;

            if (mode !== 'crop' && _currentMode === 'crop')        _currentMode = 'none';
            if (mode !== 'mask' && _currentMode === 'mask')        _currentMode = 'none';
            if (mode !== 'automask' && _currentMode === 'automask') _currentMode = 'none';
            if (mode !== 'compare' && _comparingActive && !_loadingComparison) {
                _comparingActive = false;
                _compareNameA = '';
                _compareNameB = '';
                _renderCorners();
            }

            // Don't emit mode-changed while loading comparison — the intermediate
            // mode changes (back to 'none' from loadImage) shouldn't affect bottom bar
            if (_loadingComparison) {
                return;
            }

            emit('mode-changed', { mode: _currentMode });
        });

        // ── External tool activation (from MpiHistoryTools in Block) ──────────

        // These are called by MpiGroupHistoryBlock via el.enterMode/el.exitMode
        // Block wires historyTools activate/deactivate → these

        // ── Crop execution ───────────────────────────────────────────────────

        async function _runCrop() {
            const rect = canvas.getCropRect();
            if (!rect || !_currentItem?.filePath || !state.currentProject?.folderPath) return;

            // Round the selected output pixels to a multiple of the crop tool's
            // "Divisible by" setting (MPI-261). Bound each dim by the source span
            // from the crop origin so x+w never exceeds the source — the server's
            // Sharp .extract throws on an out-of-bounds rect.
            const n = getToolSettings(state.currentProject || {}, 'crop', { divisible_by: 16 }).divisible_by;
            const srcW = canvas.img?.naturalWidth  || (rect.x + rect.w);
            const srcH = canvas.img?.naturalHeight || (rect.y + rect.h);
            const w = roundToDivisible(rect.w, n, srcW - rect.x);
            const h = roundToDivisible(rect.h, n, srcH - rect.y);

            StatusBar.progress.start('Cropping...');

            const itemId = crypto.randomUUID();

            try {
                const res = await fetch('/project/crop-media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderPath: state.currentProject.folderPath,
                        itemId,
                        sourceFilePath: _resolveUrl(_currentItem.filePath),
                        x: rect.x, y: rect.y, w, h,
                    }),
                });
                if (!res.ok) throw new Error(`crop-media ${res.status}`);
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Crop failed');

                // Use server-returned itemId (matches the .meta/<uuid>.json written by the route)
                const newItem = createImageItem({
                    id: data.itemId,
                    filePath: `/project-file?path=${encodeURIComponent(data.filePath)}`,
                    operation: 'crop',
                    displayName: data.displayName || data.filename.replace(/\.[^.]+$/, ''),
                    pixelDimensions: data.pixelDimensions || { w, h },
                });

                emit('crop-applied', { item: newItem });
                StatusBar.progress.complete('Crop saved!');
            } catch (err) {
                console.error('[MpiCanvasViewer] Crop failed:', err);
                StatusBar.progress.cancel();
            }
        }

        // ── Instance API ──────────────────────────────────────────────────────

        let _currentIdx = initialIdx;
        /** @type {import('../../../data/projectModel.js').HistoryItem|null} */
        let _currentItem = initialItem;

        el.loadEntry = async (item, idx) => {
            const sameEntry = !!(
                item?.id
                && _currentItem?.id
                && item.id === _currentItem.id
                && idx === _currentIdx
            );

            // Persist current item's layers before switching. On workspace
            // remount the block may call loadEntry for the same initial item
            // before restore has run; treating that as a switch would serialize
            // the empty fresh canvas and delete the session-temp mask.
            if (!_previewInst && _currentItem && !sameEntry) {
                try { await _persistLayers(_currentItem); }
                catch (err) { console.warn('[MpiCanvasViewer] persist layers failed:', err); }
                await _persistCurrentAutoPicks();
            }

            // Capture active tool mode so it can be restored after image swap.
            const _modeToRestore = _currentMode;

            _loadingEntry = true;
            _currentIdx = idx;
            _currentItem = item;
            _exitMode();
            _setLoadingSpinner(true);

            try {
                if (_previewInst) {
                    if (item?.filePath) {
                        try {
                            await _previewInst.el.loadImage(_resolveUrl(item.filePath));
                        } catch (err) {
                            console.warn('[MpiCanvasViewer] Failed to load image into preview:', err);
                        }
                    }
                    const composite = await _buildCompositeFromTemp(item);
                    if (composite) {
                        _previewInst.el.setMaskDataURL(composite);
                        _previewMaskCache = composite;
                        _hasMask = true;
                    } else {
                        _previewInst.el.clearMask();
                        _previewMaskCache = null;
                        _hasMask = false;
                    }
                    await _hydrateThumbsForItem(item);
                    return;
                }

                await _showEntry(item);
                await _restoreLayers(item);

                await _hydrateThumbsForItem(item);
                await _restoreAutoPickMasks();

                if (_modeToRestore && _modeToRestore !== 'none') {
                    _enterMode(_modeToRestore);
                }
            } finally {
                _loadingEntry = false;
                _setLoadingSpinner(false);
                emit('entry-loaded', { idx, hasMask: _hasMask });
            }
        };

        el.loadCompare = async (itemA, itemB) => {
            await _showCompare(itemA, itemB);
        };

        el.clearCompare = () => {
            canvas.isComparisonMode = false;
            _comparingActive = false;
            _compareNameA = '';
            _compareNameB = '';
            _renderCorners();
        };

        el.enterMode = (mode) => {
            const canonical = mode === 'autoMaskImg' ? 'automask' : mode;
            if (canonical === 'none') { _exitMode(); return; }
            _enterMode(canonical);
        };

        el.exitMode = () => _exitMode();

        // Returns the underlying HTMLImageElement so external tools (e.g.
        // resize) can sample the source for thumbnail extraction.
        el.getSourceElement = () => _cv.el?.img || null;

        el.getCurrentMaskDataURL = () => {
            // Preview mode: live canvas is destroyed. Return cached composite.
            if (_previewInst) return _previewMaskCache ?? null;
            try {
                if (_cv.el?.maskCanvas && hasMaskContent(_cv.el.maskCanvas)) {
                    return _cv.el.getMaskDataURL('black', 'white');
                }
            } catch (_) { /* canvas torn down — fall through */ }
            return null;
        };

        function _isCurrentEntry(item) {
            return !!(item?.id && _currentItem?.id && item.id === _currentItem.id);
        }

        el.getMaskDataURLForEntry = async (item) => {
            if (!item) return null;
            if (_isCurrentEntry(item)) {
                const liveMask = el.getCurrentMaskDataURL();
                if (liveMask) return liveMask;
            }
            return await _buildCompositeFromTemp(item);
        };

        el.hasMaskForEntry = async (item) => {
            return !!(await el.getMaskDataURLForEntry(item));
        };

        // Live check: paint strokes don't flip _hasMask flag (only commit/evaluate
        // does). Radial menu picks during active paint saw stale false. Compute
        // from canvas pixels when available; fall back to flag for preview mode.
        el.hasMask = () => {
            if (_previewInst) return !!_previewMaskCache;
            try {
                if (_cv.el?.maskCanvas) return hasMaskContent(_cv.el.maskCanvas);
            } catch (_) { /* canvas torn down — fall back */ }
            return _hasMask;
        };

        el.setGenerating = (on) => _setGeneratingSpinner(on);

        el.setMaskHidden = (hidden) => { canvas.maskHidden = hidden; };

        // ── Compare overlay API ───────────────────────────────────────────────
        // Top-right chip strip via MpiViewerCorners — two chips:
        //   [0] active tool label (static, hidden when empty)
        //   [1] Compare button

        let _toolLabel = '';
        let _compareEnabled = false;
        let _compareNameA = '';
        let _compareNameB = '';

        const _cornersInst = MpiViewerCorners.mount(qs('#corners-mount', el));

        function _renderCorners() {
            // Compare mode: replace top-right chips with itemB name, show itemA name top-left.
            if (_comparingActive && _compareNameA && _compareNameB) {
                _cornersInst.el.setTopLeft([{ text: _compareNameA }]);
                _cornersInst.el.setTopRight([{ text: _compareNameB }]);
                return;
            }
            _cornersInst.el.setTopLeft([]);
            const items = [];
            if (_toolLabel) items.push({ text: _toolLabel });
            items.push({
                text: 'Compare',
                accent: _compareEnabled,
                disabled: !_compareEnabled,
                onClick: () => emit('compare-clicked')
            });
            _cornersInst.el.setTopRight(items);
        }

        /** Enable/disable the Compare button. Called by MpiGroupHistoryBlock on selection-changed. */
        el.setCompareEnabled = (enabled) => {
            _compareEnabled = !!enabled;
            _renderCorners();
        };

        /** Update the active tool label shown before "Compare". */
        el.setActiveToolLabel = (label) => {
            _toolLabel = label || '';
            _renderCorners();
        };

        _renderCorners();

        // ── Tool-driver surface (consumed by MpiToolOptions* compounds) ─────
        // These methods expose the canvas-viewer's internal tool actions so that
        // the Photoshop-pivot MpiToolOptions* compounds can drive the viewer
        // directly without an intermediate tool-action-bar.

        /** Promote _runCrop so MpiToolOptionsCrop can trigger it via onApply. */
        el.runCrop = () => _runCrop();

        /** Forward crop ratio selection from MpiToolOptionsCrop to the canvas. */
        el.setCropRatio = (ratio) => {
            _activeCropRatio = ratio;
            canvas.setCropRatio(ratio);
        };

        /**
         * Switch active brush for manual-mask painting.
         * @param {'brush'|'eraser'} mode
         */
        el.setMaskBrushMode = (mode) => {
            if (mode === 'brush' || mode === 'eraser') canvas.setBrushType(mode);
        };

        /** Clear the entire painted mask and emit 'mask-clear'. */
        el.clearMask = () => {
            if (_previewInst) {
                // Canvas torn down for prompt-tool preview — clear the cached
                // composite + overlay instead of touching the dead MpiCanvas.
                _previewMaskCache = null;
                _previewInst.el.clearMask?.();
            } else {
                canvas.clearMask();
            }
            _hasMask = false;
            _clearAutoPickEntry(_currentItem, true);
            _autoMaskPicks.clear();
            autoMaskThumbs.el.clearPicks?.();
            const k = _maskKey(_currentItem);
            if (k) maskTempStore.delete(k.projectId, k.groupId, k.itemId).catch(() => {});
            emit('mask-clear', {});
        };

        /** Toggle mask invert display state. Returns new state. */
        el.invertMask        = () => {
            _isMaskInverted = !_isMaskInverted;
            canvas.setMaskInverted(_isMaskInverted);
            return _isMaskInverted;
        };
        el.setMaskInverted   = (v) => {
            _isMaskInverted = !!v;
            canvas.setMaskInverted(_isMaskInverted);
        };
        el.isMaskInverted    = () => _isMaskInverted;
        el.setMaskOpacity    = (v) => canvas.setMaskOpacity(v);
        el.getMaskOpacity    = () => canvas.maskOpacity;

        /**
         * Commit the manual mask: exits mask mode, emits 'mask-ready' if paint
         * strokes exist, otherwise 'mask-clear'. Mirrors the old apply handler.
         */
        el.commitMask = () => {
            const hasContent = hasMaskContent(canvas.maskCanvas);
            _hasMask = hasContent;
            _exitMode();
            if (hasContent) emit('mask-ready', { hasMask: true });
            else            emit('mask-clear', {});
        };

        /**
         * Evaluate current mask content and emit mask-ready / mask-clear WITHOUT
         * exiting the current tool mode. Used by MpiToolOptions* compounds on
         * destroy to sync the Block's _canvasHasMask flag before switching tools,
         * so the PromptBox sees the latest mask state when it reappears.
         */
        el.evaluateMask = () => {
            const hasContent = hasMaskContent(canvas.maskCanvas);
            _hasMask = hasContent;
            if (hasContent) emit('mask-ready', { hasMask: true });
            else            emit('mask-clear', {});
        };

        /**
         * Swap the YOLO detection model for auto-mask. Clears any in-progress
         * picks + painted mask to keep auto-mask state coherent.
         */
        el.setAutoMaskModel = (modelId) => {
            if (_autoMaskModel === modelId) return;
            _autoMaskModel = modelId;
            autoMaskThumbs.el.clear();
            autoMaskThumbs.el.clearPicks?.();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem, true);
        };

        /**
         * Toggle between bounding-box and segmentation auto-mask output.
         * @param {boolean} useBox
         */
        el.setAutoMaskUseBox = (useBox) => {
            const nextUseBox = !!useBox;
            if (_autoMaskUseBox === nextUseBox) return;
            _autoMaskUseBox = nextUseBox;
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem, true);
        };

        /** Kick off an auto-mask detect run and populate the thumbs strip. */
        el.runAutoMaskDetect = () => {
            if (_isCueBusy()) {
                _notifyAutoMaskBlocked();
                return;
            }

            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _lastDetectThumbUrls = [];
            _clearAutoPickEntry(_currentItem, true);
            _runAutoMaskWorkflow(true);
        };

        /** Commit current auto-mask selection and exit auto-mask mode. */
        el.commitAutoMask = () => _exitAutoMaskMode(true);

        /**
         * Return the internal MpiAutoMaskThumbs DOM node so a parent compound
         * (e.g. MpiToolOptionsMask) can re-parent it into its own template.
         * IMPORTANT: parent MUST NOT destroy the thumbs — detach only. The viewer
         * still owns the instance's lifecycle.
         */
        el.getAutoMaskThumbsEl = () => autoMaskThumbs.el;

        /** Expose DETECTION_MODELS constant so options compounds don't fork it. */
        el.getDetectionModels = () => DETECTION_MODELS.slice();

        /** Composite a mask dataUrl onto the existing canvas mask (OR, no clear). */
        el.compositeMaskDataURL = (dataUrl) => canvas.compositeMaskDataURL(dataUrl);

        // Expose canvas for checking comparison mode from parent block
        el.canvas = canvas;

        // ── Prompt-tool preview swap ─────────────────────────────────────────

        // Preview container — sibling to #canvas-wrap inside .mpi-canvas-viewer (position:relative)
        const _previewWrap = document.createElement('div');
        _previewWrap.style.cssText = 'position:absolute;inset:0;display:none;';
        el.appendChild(_previewWrap);

        /**
         * Swap to MpiMaskedImagePreview for prompt mode.
         * Destroys MpiCanvas — releases all GPU texture backing immediately.
         * Remounted on swapToCanvas.
         */
        el.swapToPreview = async () => {
            if (_previewInst) return;
            _setLoadingSpinner(true);
            try {
                let maskDataUrl = _hasMask ? _cv.el.getMaskDataURL('black', 'white') : null;
                const imageUrl    = _currentItem ? _resolveUrl(_currentItem.filePath) : null;

                if (_currentItem) {
                    try { await _persistLayers(_currentItem); }
                    catch (err) { console.warn('[MpiCanvasViewer] persist on swapToPreview failed:', err); }
                    await _persistCurrentAutoPicks();
                    if (!maskDataUrl) {
                        maskDataUrl = await _buildCompositeFromTemp(_currentItem);
                    }
                }

                _previewMaskCache = maskDataUrl;

                _cv.inst.el.destroy?.();
                const wrap = qs('#canvas-wrap', el);
                wrap.innerHTML = '';
                wrap.style.display = 'none';
                _previewWrap.style.display = '';

                _previewInst = MpiMaskedImagePreview.mount(_previewWrap);

                if (imageUrl) await _previewInst.el.loadImage(imageUrl);
                if (maskDataUrl) _previewInst.el.setMaskDataURL(maskDataUrl);
            } finally {
                _setLoadingSpinner(false);
            }
        };

        /**
         * Swap back to MpiCanvas from preview mode.
         * Remounts a fresh MpiCanvas, reloads current image + mask.
         */
        el.swapToCanvas = async () => {
            if (!_previewInst) return;
            _setLoadingSpinner(true);
            try {
                _previewInst.el.destroy?.();
                _previewInst = null;
                _previewWrap.innerHTML = '';
                _previewWrap.style.display = 'none';

                const wrap = qs('#canvas-wrap', el);
                wrap.innerHTML = '';
                wrap.style.display = '';

                _cv.inst = MpiCanvas.mount(wrap, {
                    onBrushTypeChange: (type) => {
                        emit('brush-changed', { type: type === 'eraser' ? 'eraser' : 'brush' });
                    },
                });
                _cv.inst.on('modechange', ({ mode }) => {
                    if (mode !== 'crop' && _currentMode === 'crop')         _currentMode = 'none';
                    if (mode !== 'mask' && _currentMode === 'mask')         _currentMode = 'none';
                    if (mode !== 'automask' && _currentMode === 'automask') _currentMode = 'none';
                    if (mode !== 'compare' && _comparingActive && !_loadingComparison) {
                        _comparingActive = false;
                        _compareNameA = '';
                        _compareNameB = '';
                        _renderCorners();
                    }
                    if (_loadingComparison) return;
                    emit('mode-changed', { mode: _currentMode });
                });

                if (_currentItem?.filePath) {
                    await _cv.el.loadImage(_resolveUrl(_currentItem.filePath));
                    await _restoreLayers(_currentItem);
                }

                await _restoreAutoPickMasks();

                _cv.el.setMaskInverted?.(_isMaskInverted);

                _previewMaskCache = null;
            } finally {
                _setLoadingSpinner(false);
            }
        };

        // ── Lifecycle: destroy ───────────────────────────────────────────────
        // Right-click anywhere on the viewer surfaces a context menu (built by
        // the owning block). Mirrors MpiVideoViewer's 'video-viewer:context-menu'.
        const _offCtx = on(el, 'contextmenu', (e) => {
            e.preventDefault();
            Events.emit('image-viewer:context-menu', { x: e.clientX, y: e.clientY });
        });

        // Block calls viewer.el.destroy?.() on workspace teardown. Without this
        // the inner MpiCanvas + its 3 image-px canvases leak GPU texture backing
        // (~100MB per 4K image), causing VRAM stacking on every workspace re-open.
        el.destroy = async () => {
            _offCtx?.();
            if (_currentItem) {
                if (!_previewInst) {
                    try {
                        await _persistLayers(_currentItem);
                    } catch (err) {
                        clientLogger.warn('mask-temp', `persist on destroy failed: ${err?.message || err}`);
                    }
                }
                try {
                    await _persistCurrentAutoPicks();
                } catch (err) {
                    clientLogger.warn('automask', `persist auto on destroy failed: ${err?.message || err}`);
                }
            }
            _previewInst?.el?.destroy?.();
            _previewInst = null;
            _cv.inst?.el?.destroy?.();
            autoMaskThumbs?.el?.destroy?.();
            _cornersInst?.el?.destroy?.();
        };

        // ── Init: load initial image ─────────────────────────────────────────

        const _initialUrl = initialItem?.filePath || initialImageUrl;
        if (_initialUrl) {
            _showEntry({ filePath: _initialUrl }).then(async () => {
                if (initialItem) {
                    try { await _restoreLayers(initialItem); }
                    catch (err) { console.warn('[MpiCanvasViewer] initial restore failed:', err); }
                    try {
                        await _hydrateThumbsForItem(initialItem);
                        await _restoreAutoPickMasks();
                    } catch (err) {
                        clientLogger.warn('automask', `initial auto-mask restore failed: ${err?.message || err}`);
                    }
                }
                emit('entry-loaded', { idx: initialIdx, hasMask: _hasMask });
            });
        }
    },
});
