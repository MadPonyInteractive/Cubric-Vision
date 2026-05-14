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
import { createImageItem } from '../../../data/projectModel.js';
import { qs } from '../../../utils/dom.js';
import { maskTempStore } from '../../../services/maskTempStore.js';
import { clientLogger } from '../../../services/clientLogger.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

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
            if (!manualUrl && !subtractUrl) await maskTempStore.delete(k.projectId, k.groupId, k.itemId);
        }

        async function _loadImg(dataUrl) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = dataUrl;
            });
        }

        // Build composite (manual MINUS subtract) B/W PNG from TEMP layers.
        // Returns null when no manual layer is present. Used to seed preview-mode
        // mask after history-entry switch (canvas torn down).
        async function _buildCompositeFromTemp(item) {
            const k = _maskKey(item);
            if (!k) return null;
            const { manual, subtract } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            if (!manual) return null;
            try {
                const manualImg = await _loadImg(manual);
                const w = manualImg.naturalWidth;
                const h = manualImg.naturalHeight;
                if (!w || !h) return null;
                const tmp = document.createElement('canvas');
                tmp.width = w;
                tmp.height = h;
                const ctx = tmp.getContext('2d');
                ctx.drawImage(manualImg, 0, 0);
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

        function _setGeneratingSpinner(on) {
            spinnerWrap.classList.toggle('mpi-canvas-viewer__spinner--visible', on);
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
        // Per-item auto-mask state.
        //   Map<itemId, { thumbs: string[], urls: string[], picks: number[] }>
        //   thumbs — detect-node preview images (visual)
        //   urls   — mask images (composited onto canvas)
        // RAM-only (auto-mask is session-scoped per plan); rehydrates on
        // swapToCanvas + on history-entry switch.
        const _autoPickStore = new Map();
        let _lastDetectThumbUrls = [];

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

        function _runAutoMaskWorkflow(populateThumbs = false) {
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
                    _saveAutoPickEntry(sourceItem, [...maskUrls], runPicks, _lastDetectThumbUrls);
                    _hasMask = true;
                } catch (err) {
                    console.warn('[MpiCanvasViewer] Failed to apply auto-masks:', err);
                }
            };

            exec.onError = (err) => {
                if (_autoMaskExec !== exec) return;
                _autoMaskExec = null;
                console.error('[MpiCanvasViewer] Auto-mask error:', err);
            };
        }

        function _autoPickKey(item) { return item?.id || null; }

        function _saveAutoPickEntry(item, urls, picks, thumbs) {
            const key = _autoPickKey(item);
            if (!key) return;
            if (!urls?.length || !picks?.size) {
                _autoPickStore.delete(key);
                return;
            }
            _autoPickStore.set(key, {
                thumbs: thumbs ? [...thumbs] : [...urls],
                urls: [...urls],
                picks: [...picks],
            });
        }

        function _clearAutoPickEntry(item) {
            const key = _autoPickKey(item);
            if (key) _autoPickStore.delete(key);
        }

        // Persist current viewer auto-pick state to the store before tearing
        // down or switching items. Reads thumbs picks (DOM-truth across remount).
        function _persistCurrentAutoPicks() {
            if (!_currentItem) return;
            const thumbPicks = autoMaskThumbs.el.getPicks?.() ?? new Set();
            const cached = _autoPickStore.get(_autoPickKey(_currentItem));
            const urls = cached?.urls ?? [];
            const thumbs = cached?.thumbs ?? _lastDetectThumbUrls;
            if (thumbPicks.size > 0 && urls.length > 0) {
                _saveAutoPickEntry(_currentItem, urls, thumbPicks, thumbs);
            } else {
                _clearAutoPickEntry(_currentItem);
            }
        }

        // Rehydrate thumbs DOM + viewer state for the given item from store.
        // Does NOT trigger the bitmap fetch — call _restoreAutoPickMasks after
        // canvas is ready.
        function _hydrateThumbsForItem(item) {
            const entry = _autoPickStore.get(_autoPickKey(item));
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
            if (_autoMaskPicks.size === 0 || urls.length === 0) return;
            if (urls.length !== _autoMaskPicks.size) {
                _resetAutoPickStateWithToast();
                return;
            }
            try {
                const bitmaps = await Promise.all(
                    urls.map(async (u) => {
                        const dataUrl = await _maskUrlToTransparentDataUrl(u);
                        const res = await fetch(dataUrl);
                        const blob = await res.blob();
                        return await createImageBitmap(blob);
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
            _clearAutoPickEntry(_currentItem);
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
            }
            // apply=true: keep auto picks composited.

            const hasContent = !!(canvas.maskCanvas && hasMaskContent(canvas.maskCanvas));
            _hasMask = hasContent;
            if (hasContent) emit('mask-ready', { hasMask: true });
            else            emit('mask-clear', {});

            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem);
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
            if (mode !== 'compare' && _comparingActive)            _comparingActive = false;

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
                        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
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
                    pixelDimensions: data.pixelDimensions || { w: rect.w, h: rect.h },
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
            // Persist current item's layers before switching — only if canvas alive
            if (!_previewInst && _currentItem) {
                try { await _persistLayers(_currentItem); }
                catch (err) { console.warn('[MpiCanvasViewer] persist layers failed:', err); }
                _persistCurrentAutoPicks();
            }

            // Capture active tool mode so it can be restored after image swap.
            const _modeToRestore = _currentMode;

            _loadingEntry = true;
            _currentIdx = idx;
            _currentItem = item;
            _exitMode();

            // Preview mode: route through MpiMaskedImagePreview. Build composite
            // from TEMP layers if any, else clear preview mask.
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
                // Keep thumbs DOM in sync with new item's stored auto-pick state
                // so swapping back to the canvas restores the right selection.
                _hydrateThumbsForItem(item);
                _loadingEntry = false;
                emit('entry-loaded', { idx, hasMask: _hasMask });
                return;
            }

            await _showEntry(item);
            await _restoreLayers(item);

            // Rehydrate per-item auto-pick state: thumbs DOM + viewer Set,
            // then paint cached mask bitmaps onto the live canvas.
            _hydrateThumbsForItem(item);
            await _restoreAutoPickMasks();

            if (_modeToRestore && _modeToRestore !== 'none') {
                _enterMode(_modeToRestore);
            }
            _loadingEntry = false;

            emit('entry-loaded', { idx, hasMask: _hasMask });
        };

        el.loadCompare = async (itemA, itemB) => {
            await _showCompare(itemA, itemB);
        };

        el.clearCompare = () => {
            canvas.isComparisonMode = false;
            _comparingActive = false;
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

        const _cornersInst = MpiViewerCorners.mount(qs('#corners-mount', el));

        function _renderCorners() {
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
            canvas.clearMask();
            _hasMask = false;
            _clearAutoPickEntry(_currentItem);
            _autoMaskPicks.clear();
            autoMaskThumbs.el.clearPicks?.();
            const k = _maskKey(_currentItem);
            if (k) maskTempStore.delete(k.projectId, k.groupId, k.itemId).catch(() => {});
            emit('mask-clear', {});
        };

        /** Invert the mask colours in-place (no exit, no emit). */
        el.invertMask = () => canvas.flipMaskColor();

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
            _autoMaskModel = modelId;
            autoMaskThumbs.el.clear();
            autoMaskThumbs.el.clearPicks?.();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem);
        };

        /**
         * Toggle between bounding-box and segmentation auto-mask output.
         * @param {boolean} useBox
         */
        el.setAutoMaskUseBox = (useBox) => {
            _autoMaskUseBox = !!useBox;
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem);
        };

        /** Kick off an auto-mask detect run and populate the thumbs strip. */
        el.runAutoMaskDetect = () => {
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _lastDetectThumbUrls = [];
            _clearAutoPickEntry(_currentItem);
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

            const maskDataUrl = _hasMask ? _cv.el.getMaskDataURL('black', 'white') : null;
            const imageUrl    = _currentItem ? _resolveUrl(_currentItem.filePath) : null;

            // Persist manual + subtract layers to TEMP before tearing the canvas down.
            // Required so swapToCanvas can restore exactly what the user painted.
            if (_currentItem) {
                try { await _persistLayers(_currentItem); }
                catch (err) { console.warn('[MpiCanvasViewer] persist on swapToPreview failed:', err); }
                _persistCurrentAutoPicks();
            }

            _previewMaskCache = maskDataUrl;

            // Destroy canvas — zeros canvas dims, removes from DOM, releases GPU textures
            _cv.inst.el.destroy?.();
            const wrap = qs('#canvas-wrap', el);
            wrap.innerHTML = '';
            wrap.style.display = 'none';
            _previewWrap.style.display = '';

            _previewInst = MpiMaskedImagePreview.mount(_previewWrap);

            if (imageUrl) await _previewInst.el.loadImage(imageUrl);
            if (maskDataUrl) _previewInst.el.setMaskDataURL(maskDataUrl);

        };

        /**
         * Swap back to MpiCanvas from preview mode.
         * Remounts a fresh MpiCanvas, reloads current image + mask.
         */
        el.swapToCanvas = async () => {
            if (!_previewInst) return;

            _previewInst.el.destroy?.();
            _previewInst = null;
            _previewWrap.innerHTML = '';
            _previewWrap.style.display = 'none';

            const wrap = qs('#canvas-wrap', el);
            wrap.innerHTML = '';
            wrap.style.display = '';

            // Remount fresh canvas, update mutable ref
            _cv.inst = MpiCanvas.mount(wrap, {
                onBrushTypeChange: (type) => {
                    emit('brush-changed', { type: type === 'eraser' ? 'eraser' : 'brush' });
                },
            });
            _cv.inst.on('modechange', ({ mode }) => {
                if (mode !== 'crop' && _currentMode === 'crop')         _currentMode = 'none';
                if (mode !== 'mask' && _currentMode === 'mask')         _currentMode = 'none';
                if (mode !== 'automask' && _currentMode === 'automask') _currentMode = 'none';
                if (mode !== 'compare' && _comparingActive)             _comparingActive = false;
                if (_loadingComparison) return;
                emit('mode-changed', { mode: _currentMode });
            });

            // Reload image + restore manual+subtract layers from TEMP
            if (_currentItem?.filePath) {
                await _cv.el.loadImage(_resolveUrl(_currentItem.filePath));
                await _restoreLayers(_currentItem);
            }

            // Rehydrate auto-pick bitmaps from cached ComfyUI URLs.
            await _restoreAutoPickMasks();

            _previewMaskCache = null;
        };

        // ── Lifecycle: destroy ───────────────────────────────────────────────
        // Block calls viewer.el.destroy?.() on workspace teardown. Without this
        // the inner MpiCanvas + its 3 image-px canvases leak GPU texture backing
        // (~100MB per 4K image), causing VRAM stacking on every workspace re-open.
        el.destroy = () => {
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
                }
                emit('entry-loaded', { idx: initialIdx, hasMask: _hasMask });
            });
        }
    },
});
