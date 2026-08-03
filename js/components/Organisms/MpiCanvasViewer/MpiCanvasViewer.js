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
 *   el.setMaskPointsMode(bool)         — click-point (SAM3) detector branch
 *   el.clearMaskPoints() / el.getMaskPointCount()
 *   el.bakeAutoPicks('manual'|'subtract') — Add / Subtract the detected mask
 *
 * Emits:
 *   'mode-changed'    { mode }        — tool mode changed (from any source)
 *   'crop-applied'    { item }        — crop completed; item is the new HistoryItem
 *   'mask-ready'      { hasMask }     — mask painted or cleared
 *   'entry-loaded'    { idx, hasMask } — image loaded for index
 *   'compare-clicked'               — user clicked the Compare overlay button
 *   'mask-points-changed' { count }   — a point prompt was added, removed or cleared
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
        /**
         * Exact crop size when the RESOLUTION family drove the box (MPI-383).
         * A ratio alone cannot restore it: re-entering crop mode re-fits the
         * largest centred box for that ratio, which silently shrinks a
         * 1920×1080 target back inside the image. null = ratio/free family.
         */
        let _activeCropSize = null;
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
                // Same layer order as MaskManager._recomposite(): subtract punches
                // the MANUAL layer only, then the auto picks union on top. An auto
                // pick is a positive assertion made after the erase, so the erase
                // does not veto it — this is what `Add` bakes.
                if (manual) ctx.drawImage(seedImg, 0, 0);
                if (subtract) {
                    const subImg = await _loadImg(subtract);
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.drawImage(subImg, 0, 0, w, h);
                    ctx.globalCompositeOperation = 'source-over';
                }
                for (const url of autoEntry.urls) {
                    const autoImg = await _loadImg(url);
                    ctx.drawImage(autoImg, 0, 0, w, h);
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
                // Same contract as MaskManager.getURL(): the TEMP layers were written
                // at the MASK_MAX_EDGE-capped working size, but InpaintCropImproved
                // asserts mask dims == image dims, and this composite reaches the graph
                // through _previewMaskCache → getCurrentMaskDataURL(). Scale back to the
                // entry's own pixels; fall through unscaled if the item never recorded
                // them (nothing to scale TO is not a reason to fail the mask).
                const tw = item.pixelDimensions?.w;
                const th = item.pixelDimensions?.h;
                if (!tw || !th || (tw === w && th === h)) return out.toDataURL('image/png');
                const scaled = document.createElement('canvas');
                scaled.width = tw;
                scaled.height = th;
                scaled.getContext('2d').drawImage(out, 0, 0, tw, th);
                return scaled.toDataURL('image/png');
            } catch (err) {
                console.warn('[MpiCanvasViewer] composite build failed:', err);
                return null;
            }
        }

        // Union a manual layer (may be null) with the additive auto-pick masks
        // into one alpha PNG that round-trips through setManualFromDataURL. Auto
        // urls are white-on-transparent, so a plain source-over draw IS the
        // union. No subtract here — that layer is carried separately so a pasted
        // mask stays fully erasable.
        async function _mergeManualWithAuto(manualUrl, autoUrls) {
            if (!autoUrls?.length) return manualUrl || null;
            try {
                const imgs = [];
                if (manualUrl) imgs.push(await _loadImg(manualUrl));
                for (const u of autoUrls) imgs.push(await _loadImg(u));
                const w = imgs[0]?.naturalWidth;
                const h = imgs[0]?.naturalHeight;
                if (!w || !h) return manualUrl || null;
                const tmp = document.createElement('canvas');
                tmp.width = w;
                tmp.height = h;
                const ctx = tmp.getContext('2d');
                for (const img of imgs) ctx.drawImage(img, 0, 0, w, h);
                return tmp.toDataURL('image/png');
            } catch (err) {
                console.warn('[MpiCanvasViewer] merge manual+auto failed:', err);
                return manualUrl || null;
            }
        }

        async function _restoreLayers(item) {
            const k = _maskKey(item);
            if (!k) { _hasMask = false; return; }
            const { manual, subtract } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            if (manual)   await _cv.el.setManualFromDataURL(manual);
            if (subtract) await _cv.el.setSubtractFromDataURL(subtract);
            // A restore REPLACES the layers, so any history in front of it now
            // describes pixels that no longer exist. Most callers arrive via
            // loadImage (mask.init already cleared it), but the re-seed path
            // clearMask()s first and never reloads the image — that clear would
            // otherwise sit on the stack as a bogus undo. (MPI-376)
            _cv.el?.clearMaskUndo?.();
            _hasMask = !!(_cv.el?.maskCanvas && hasMaskContent(_cv.el.maskCanvas));
        }

        // ── Canvas + spinner ─────────────────────────────────────────────────

        const spinnerWrap = qs('#spinner-wrap', el);
        MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });

        /** MpiMaskedImagePreview instance while prompt mode is active, null otherwise */
        let _previewInst = null;

        /**
         * ONE prop set for BOTH MpiCanvas mounts — the initial mount here and the
         * swapToCanvas remount. They must never drift: a callback wired on only one
         * of them works until the first prompt-mode round trip and then silently
         * stops firing, which is exactly the class of half-wire bug this file has
         * paid for before.
         */
        const _canvasProps = {
            onBrushTypeChange: (type) => {
                emit('brush-changed', { type: type === 'eraser' ? 'eraser' : 'brush' });
            },
            onPointsChange: (count) => emit('mask-points-changed', { count }),
            onMaskStrokeEnd: () => _publishMaskState(),
        };

        // Mutable canvas ref — replaced on swapToCanvas remount.
        // All internal code accesses canvas via _cv.el so remount is transparent.
        const _cv = { inst: MpiCanvas.mount(qs('#canvas-wrap', el), _canvasProps) };
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
        // MPI-361 point prompts — `_pointsMode` swaps the graph's detector branch.
        // Held on the viewer (like _isMaskInverted) so it survives the
        // swapToPreview/swapToCanvas remount. MPI-380 removed the companion
        // threshold: SAM3's point path ignores it entirely.
        let _pointsMode = false;
        // MPI-384 open-vocabulary text prompt — same deal, and it swaps a THIRD
        // detector branch. `_textPrompt` is the graph-ready string: categories
        // comma-separated and each already stamped `name:N` by the tool, because a
        // bare category makes SAM3 return exactly one object.
        let _textMode = false;
        let _textPrompt = '';
        // Display-only invert state. Held on the viewer (not just the canvas)
        // so it survives the canvas teardown/remount that swapToPreview/swapToCanvas
        // performs. Re-applied to the fresh MpiCanvas after every remount.
        let _isMaskInverted = false;
        // Display-only black-and-white mask view (MPI-381) — same deal, and it
        // must also survive a swap between mask tools.
        let _isMaskBwView = false;
        // Whether the armed mask tool paints (MPI-381). Declared by the tool on
        // mount, but held here too: a canvas rebuild would otherwise restore the
        // manager default (true) and silently re-arm the brush on Detect/Points.
        let _maskPaintEnabled = true;
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

        // Viewer retains ownership of the thumbs instance; MpiMaskDetectRow
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

            // MPI-361: the mask-points branch feeds every dot into ONE SAM predict
            // call, so it returns exactly ONE region per run — there is nothing to
            // choose between. Pick it up front so a single run brings back both the
            // thumb and the mask, instead of the detector's two-round-trip
            // detect-then-pick dance.
            //
            // MPI-380: this guard is also the graph's ONLY empty-points gate. The old
            // branch self-gated on `MpiLoadImageFromPath(block_if_empty)`; SAM3 is fed
            // by plain string nodes, which cannot block, so an empty run must be
            // stopped here.
            let points = null;
            if (_pointsMode) {
                if (!canvas.getMaskPointCount?.()) {
                    StatusBar.notify('Click the image to place a point first', 'warning');
                    return;
                }
                points = canvas.getPointsJSON?.() || null;
                _autoMaskPicks = new Set([0]);
            }

            // MPI-384: the text branch has no self-gate either — CLIPTextEncode
            // happily encodes '' and SAM3 then detects nothing at all. Same guard,
            // same reason. Unlike points, text returns N objects, so it keeps the
            // detector's normal detect-then-pick flow.
            if (_textMode && !_textPrompt) {
                StatusBar.notify('Type what to mask first', 'warning');
                return;
            }

            const runPicks = new Set(_autoMaskPicks);
            const exec = runAutoMask({
                imageUrl,
                detectorModel:   _autoMaskModel,
                useBox:          _autoMaskUseBox,
                picks:           runPicks,
                pointsMode:      _pointsMode,
                pointsPositive:  points?.positive,
                pointsNegative:  points?.negative,
                textMode:        _textMode,
                textPrompt:      _textPrompt,
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
                    // setImages clears the selection; points mode already committed
                    // to pick 0 above, so put it back. setPicks does not emit
                    // 'change', so this cannot re-trigger the run.
                    if (_pointsMode) autoMaskThumbs.el.setPicks?.(new Set([0]));
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
                    // Picking a chip puts real pixels in maskCanvas, so it is a mask
                    // made outside a brush stroke — publish it or the op strip stays
                    // locked until Add/Subtract (MPI-372 contract, MPI-384).
                    el.evaluateMask();
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
            // across a mask-tool remount; the viewer's Set is reset.
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

        /**
         * THE PREVIEW CONTRACT (MPI-382). A detection is a PREVIEW until `Add` bakes
         * it, and a preview must not outlive its tool: previews that survive stack on
         * each other, so the user ends up judging a composite he never committed to
         * while the graph receives something else again.
         *
         * `apply: false` therefore drops the WHOLE preview, not just the canvas half.
         * Clearing only the auto layers left the thumb strip advertising selected
         * picks for pixels that no longer existed, and re-entering Detect rehydrated
         * that stale selection.
         */
        function _exitAutoMaskMode(apply) {
            _autoMaskExec?.cancel();
            _autoMaskExec = null;

            if (!apply) {
                // Drop auto layer only; preserve manual + subtract — those are
                // committed pixels, not a preview.
                canvas.clearAutoPicks();
                canvas.setSelectedAutoPicks(new Set());
                _clearAutoPickEntry(_currentItem, true);
                // ...and the UI advertising it. `el.clear()` does NOT emit 'change',
                // so this cannot re-enter through the thumbs handler above.
                _autoMaskPicks.clear();
                _lastDetectThumbUrls = [];
                autoMaskThumbs.el.clear();
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
                if (_activeCropSize) canvas.setCropSize(_activeCropSize.w, _activeCropSize.h);
                else                 canvas.setCropRatio(_activeCropRatio);
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

            const settings = getToolSettings(state.currentProject || {}, 'crop', {
                divisible_by: 16,
                family: 'ratio',
                res_w: 1920,
                res_h: 1080,
                // eslint-disable-next-line mpi/no-hardcoded-hex-color -- fallback fill outside the source
                fill_color: '#000000',
            });
            const isExact = settings.family === 'resolution';

            // Round the selected output pixels to a multiple of the crop tool's
            // "Divisible by" setting (MPI-261). No source bound any more
            // (MPI-383): a rect that overshoots the image is filled, not
            // clipped, so rounding up is always safe. RESOLUTION mode skips it —
            // the typed size is the output.
            const n = isExact ? 1 : settings.divisible_by;
            const w = roundToDivisible(rect.w, n, Infinity);
            const h = roundToDivisible(rect.h, n, Infinity);

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
                        fill: settings.fill_color,
                        // RESOLUTION is the only family that resamples.
                        outW: isExact ? settings.res_w : null,
                        outH: isExact ? settings.res_h : null,
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

            // Re-selecting the entry ALREADY on screen with live paint on it: the
            // image is already correct, and the strokes have not reached TEMP yet
            // (the sameEntry guard below deliberately skips the persist). Falling
            // through would _showEntry + _restoreLayers from a TEMP that predates
            // those strokes and silently wipe them. Mount still needs the load path
            // — there the fresh canvas is empty, so it does not match here.
            if (sameEntry && !_previewInst && _cv.el?.maskCanvas
                && hasMaskContent(_cv.el.maskCanvas)) {
                return;
            }

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

        // Copy/paste mask between history entries (MPI-311).
        //
        // Carries the manual + subtract LAYERS, not a flattened B/W composite:
        // flattening the SUBTRACT layer would bake the eraser in permanently, so
        // the pasted mask could no longer be erased further on the target.
        //
        // The selected auto-detected region IS included — folded into the manual
        // layer. Auto picks are additive (same polarity as manual), so unioning
        // them here reproduces the on-screen composite on paste while keeping
        // subtract separate, so the mask stays erasable. (They were dropped
        // before, which lost exactly what download and the preview both show,
        // and made an auto-only mask un-copyable.) The auto urls persist to TEMP
        // as white-on-transparent PNGs, not RAM.
        //
        // The live canvas is the source of truth for manual/subtract when the
        // entry is on screen (unpersisted strokes have not reached TEMP yet);
        // auto always comes from TEMP, flushed first so a just-deselected pick
        // does not ride along.
        el.getMaskLayersForEntry = async (item) => {
            const k = _maskKey(item);
            if (!k) return null;
            if (_isCurrentEntry(item)) await _persistCurrentAutoPicks();
            const { manual: tManual, subtract: tSub, auto } =
                await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            let manual = tManual || null;
            let subtract = tSub || null;
            if (_isCurrentEntry(item) && _cv.el?.getManualURL) {
                manual = _cv.el.getManualURL() || manual;
                subtract = _cv.el.getSubtractURL?.() || subtract;
            }
            const autoUrls = _normalizeAutoTempEntry(auto).urls;
            const mergedManual = await _mergeManualWithAuto(manual, autoUrls);
            return mergedManual ? { manual: mergedManual, subtract } : null;
        };

        el.pasteMaskLayersToEntry = async (item, layers) => {
            const k = _maskKey(item);
            if (!k || !layers?.manual) return false;
            // Delete first: a paste onto an entry that already had eraser
            // strokes must not leave the OLD subtract layer behind punching
            // holes in the newly pasted mask. Also drops stale auto-picks,
            // which belong to the target's own image, not the pasted mask.
            await maskTempStore.delete(k.projectId, k.groupId, k.itemId);
            await maskTempStore.writeManual(k.projectId, k.groupId, k.itemId, layers.manual);
            if (layers.subtract) {
                await maskTempStore.writeSubtract(k.projectId, k.groupId, k.itemId, layers.subtract);
            }
            // Refresh whatever is ON SCREEN for this entry, or the paste stays
            // invisible until an entry switch remounts and re-reads TEMP.
            //
            // Two surfaces, and outside mask mode it is NOT the canvas: in
            // mode 'none' the viewer shows MpiMaskedImagePreview driven by
            // _previewMaskCache (a flattened composite), while the live canvas
            // is torn down. Writing only to the canvas — as this did first —
            // repaints nothing, which is exactly the reported bug.
            if (!_isCurrentEntry(item)) return true;

            if (_previewInst) {
                _previewMaskCache = await _buildCompositeFromTemp(item);
                if (_previewMaskCache) _previewInst.el.setMaskDataURL(_previewMaskCache);
                else _previewInst.el.clearMask();
                _hasMask = !!_previewMaskCache;
            } else if (_cv.el?.setManualFromDataURL) {
                // clearMask() wipes manual + subtract + auto picks so the
                // restore replaces rather than unions onto existing paint.
                // Safe here: the layers we are about to restore were just
                // written to this entry's TEMP, so nothing is lost.
                _cv.el.clearMask?.();
                await _restoreLayers(item);
            }
            emit('mask-ready', { hasMask: _hasMask });
            return true;
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
            _activeCropSize  = null;   // leaving RESOLUTION drops the exact size
            canvas.setCropRatio(ratio);
        };

        /**
         * RESOLUTION family (MPI-383): seed the crop box at exactly w×h image
         * pixels. _activeCropRatio keeps the lock so re-entering crop mode after
         * an image swap restores the same shape.
         */
        el.setCropSize = (w, h) => {
            if (!(w > 0) || !(h > 0)) return;
            _activeCropRatio = w / h;
            _activeCropSize  = { w, h };
            canvas.setCropSize(w, h);
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
        el.setMaskBwView     = (v) => {
            _isMaskBwView = !!v;
            canvas.setMaskBwView(_isMaskBwView);
        };
        el.isMaskBwView      = () => _isMaskBwView;
        el.setMaskPaintEnabled = (v) => {
            _maskPaintEnabled = !!v;
            canvas.setMaskPaintEnabled(_maskPaintEnabled);
        };
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
         * Publish mask state as it CHANGES, from the canvas' own stroke-end signal.
         *
         * Mask state used to be published only when a mask tool was torn down (the
         * MpiToolOptionsMask* organisms call evaluateMask() in destroy), which was
         * enough while the PromptBox was hidden for the whole time a mask tool was
         * open. Now that the box stays live inside the mask family (MPI-372), the
         * op strip has to unlock on the stroke that CREATES the mask, not on the
         * tool switch that no longer happens.
         *
         * Emits only on a flip, so painting stays one signal per transition rather
         * than one per stroke. Preview mode has no live canvas to read.
         */
        function _publishMaskState() {
            if (_previewInst) return;
            const hasContent = !!(_cv.el?.maskCanvas && hasMaskContent(_cv.el.maskCanvas));
            if (hasContent !== _hasMask) el.evaluateMask();
        }

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

        /**
         * MPI-361 — swap the auto-mask detector for the click-point (SAM
         * mask-points) branch. Clears any in-flight picks for the same reason
         * setAutoMaskModel does: the old result belongs to the old detector.
         * @param {boolean} enabled
         */
        el.setMaskPointsMode = (enabled) => {
            const next = !!enabled;
            if (_pointsMode === next) return;
            _pointsMode = next;
            canvas.setPointsMode?.(next);
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem, true);
        };
        el.isMaskPointsMode  = () => _pointsMode;

        /**
         * MPI-384 — swap the auto-mask detector for the open-vocabulary SAM3 text
         * branch. Clears in-flight picks for the same reason setMaskPointsMode
         * does: the old result belongs to the old method.
         * @param {boolean} enabled
         */
        el.setMaskTextMode = (enabled) => {
            const next = !!enabled;
            if (_textMode === next) return;
            _textMode = next;
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _clearAutoPickEntry(_currentItem, true);
        };

        /**
         * The graph-ready prompt. The TOOL stamps `name:N` on every category —
         * `_parse_prompts` (comfy/text_encoders/sam3_clip.py) reads that suffix as
         * the detection cap, and a bare category silently returns exactly ONE.
         * @param {string} prompt
         */
        el.setMaskTextPrompt = (prompt) => { _textPrompt = (prompt || '').trim(); };

        el.clearMaskPoints    = () => { canvas.clearMaskPoints?.(); emit('mask-points-changed', { count: 0 }); };
        el.getMaskPointCount  = () => canvas.getMaskPointCount?.() ?? 0;

        /**
         * Add / Subtract the detected mask into the permanent paint layers, then
         * drop the auto layer — lets successive point runs accumulate into one
         * multi-part mask (each run only ever returns a single region).
         * @param {'manual'|'subtract'} target
         */
        el.bakeAutoPicks = (target) => {
            const ok = canvas.bakeAutoPicksInto?.(target);
            if (!ok) {
                StatusBar.notify('Nothing detected to apply', 'warning');
                return false;
            }
            _autoMaskPicks.clear();
            autoMaskThumbs.el.clear();
            _clearAutoPickEntry(_currentItem, true);
            canvas.clearMaskPoints?.();
            emit('mask-points-changed', { count: 0 });
            _hasMask = !!(canvas.maskCanvas && hasMaskContent(canvas.maskCanvas));
            el.evaluateMask?.();
            return true;
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

        // ── Adjust — grow / shrink / edge band (MPI-382) ──────────────────────

        /** Enter Adjust: snapshot the mask so every frame derives from tool-entry state. */
        el.beginMaskAdjust   = () => canvas.beginMaskAdjust?.();
        /** @param {{grow?:number, outward?:number, inward?:number, edge?:boolean}} opts */
        el.previewMaskAdjust = (opts) => canvas.previewMaskAdjust?.(opts) ?? false;
        /** Bake the preview into the layers (one undo entry) and re-publish mask state. */
        el.applyMaskAdjust   = () => {
            const ok = canvas.applyMaskAdjust?.();
            if (ok) el.evaluateMask?.();
            return !!ok;
        };
        el.endMaskAdjust     = () => !!canvas.endMaskAdjust?.();
        /**
         * Close enclosed holes (MPI-431). One undo entry, and it bakes any live preview
         * with it — the graphs no longer fill holes, so this is the only place it happens
         * and the only place the user can see it happen.
         */
        el.fillMaskHoles     = () => {
            const ok = canvas.fillMaskHoles?.();
            if (ok) el.evaluateMask?.();
            return !!ok;
        };

        /**
         * THE PREVIEW CONTRACT (MPI-382) — the ONE seam every canvas tool drops its
         * uncommitted preview through. `MpiGroupHistoryBlock.mountOptions()` calls it
         * on every rail switch; the guard here decides whether there is anything to
         * drop, so that call site never grows a per-tool branch. MPI-368 (shapes) and
         * MPI-373 (composite) extend THIS, they do not teach mountOptions about
         * themselves — Adjust is the first one to have done so.
         *
         * Manual and subtract are untouched by either branch — they are committed
         * pixels, and a discard is not an edit (it records no undo entry and, for
         * Adjust, changes no exported pixel, so it re-publishes nothing).
         *
         * @returns {boolean} true if a preview was discarded.
         */
        el.discardPreview = () => {
            let dropped = false;

            if (canvas.hasMaskAdjustPreview?.()) {
                canvas.endMaskAdjust?.();
                dropped = true;
            }

            const hasDetectPreview = _autoMaskPicks.size > 0
                || !!canvas.mask?.hasAutoLayer
                || _lastDetectThumbUrls.length > 0;
            if (hasDetectPreview) {
                _exitAutoMaskMode(false);
                dropped = true;
            }
            return dropped;
        };

        /**
         * Return the internal MpiAutoMaskThumbs DOM node so a parent compound
         * (MpiMaskDetectRow) can re-parent it into its own template.
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

                _cv.inst = MpiCanvas.mount(wrap, _canvasProps);
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
                _cv.el.setMaskBwView?.(_isMaskBwView);
                _cv.el.setMaskPaintEnabled?.(_maskPaintEnabled);
                _cv.el.setPointsMode?.(_pointsMode);

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
