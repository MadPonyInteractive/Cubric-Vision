/**
 * MpiCanvasViewer — Organism: canvas display with tool mode state machine.
 *
 * Manages crop, mask, paint, and auto-mask modes. Owns the mask store (Map<idx, dataUrl>).
 *
 * @param {string} [initialImageUrl=''] - URL of the first image to load
 * @param {number} [initialIdx=0]        - History index of the initial image
 * @param {object} [initialItem=null]    - Full HistoryItem for the initial image (provides id for TEMP mask persistence)
 * @param {string} [groupId=null]        - Owning group's id (component of TEMP mask key path)
 *
 * Instance API (on el):
 *   el.loadEntry(item, idx)            — save current mask, load item's image, restore idx's mask
 *   el.loadCompare(itemA, itemB)       — load two images in compare mode
 *   el.enterMode(mode)                — enter 'crop'|'mask'|'paint'|'composite'|'automask' (or 'none' to exit all)
 *   el.exitMode()                     — exit any active tool mode
 *   el.getCurrentMaskDataURL()         — returns current mask as data URL, or null
 *   el.hasMask()                      — returns boolean
 *   el.setGenerating(bool)             — show/hide generating spinner
 *   el.setMaskPointsMode(bool)         — click-point (SAM3) detector branch
 *   el.clearMaskPoints() / el.getMaskPointCount()
 *   el.bakeAutoPicks('manual'|'subtract') — Add / Subtract the detected mask
 *   el.applyPaint()                   — flatten the paint layer into a new entry
 *   el.applyPlace()                   — flatten the PLACED image into a new entry (MPI-454)
 *
 * Emits:
 *   'mode-changed'    { mode }        — tool mode changed (from any source)
 *   'crop-applied'    { item }        — crop completed; item is the new HistoryItem
 *   'paint-applied'   { item }        — paint flattened; item is the new HistoryItem
 *   'place-applied'   { item }        — a placement flattened; item is the new HistoryItem
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
            // Paint (MPI-375) is written OR deleted, never just written: the mask
            // layers get their stale copy dropped by clearMask()'s TEMP delete,
            // and paint has no such twin — a write-only persist would resurrect a
            // cleared layer on the next visit to this entry.
            const paintUrl = _cv.el?.getPaintURL?.() || null;
            if (paintUrl) await maskTempStore.writePaint(k.projectId, k.groupId, k.itemId, paintUrl);
            else          await maskTempStore.deletePaint(k.projectId, k.groupId, k.itemId);
        }

        async function _loadImg(dataUrl) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = dataUrl;
            });
        }

        // Build the baked mask (manual MINUS subtract) as a B/W PNG from TEMP layers.
        // Returns null when there is no manual layer. Used to seed preview-mode mask
        // after a history-entry switch (canvas torn down).
        //
        // THE TWIN of MaskManager._recomposite() — and it carried the same MPI-426
        // bug. Persisted auto picks used to union in here too, so an un-Added
        // detection reached the graph by the other door: this composite becomes
        // `_previewMaskCache`, which `getCurrentMaskDataURL()` returns while the live
        // canvas is torn down. Picks are still persisted and still restored (they
        // rehydrate the green preview and the thumb strip across entry switches) —
        // they just no longer count as mask content. Both halves change together.
        async function _buildCompositeFromTemp(item) {
            const k = _maskKey(item);
            if (!k) return null;
            const { manual, subtract } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            if (!manual) return null;
            try {
                const seedImg = await _loadImg(manual);
                const w = seedImg.naturalWidth;
                const h = seedImg.naturalHeight;
                if (!w || !h) return null;
                const tmp = document.createElement('canvas');
                tmp.width = w;
                tmp.height = h;
                const ctx = tmp.getContext('2d');
                // Same math as MaskManager._recomposite(): subtract punches the
                // manual layer. Nothing else composites in — see the note above.
                ctx.drawImage(seedImg, 0, 0);
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
            const { manual, subtract, paint } = await maskTempStore.read(k.projectId, k.groupId, k.itemId);
            if (manual)   await _cv.el.setManualFromDataURL(manual);
            if (subtract) await _cv.el.setSubtractFromDataURL(subtract);
            if (paint)    await _cv.el.setPaintFromDataURL?.(paint);
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
        // MPI-421 — everything ONE detect brought back, index-aligned with the thumb
        // strip. The graph no longer trims its masks to the selected chips, so a chip
        // toggle is a local composite instead of a fresh ComfyUI run. RAM-only and
        // viewer-scoped, exactly like _lastDetectThumbUrls: it survives the
        // swapToPreview/swapToCanvas remount and is dropped on an item switch.
        let _autoMaskUrls = [];
        // ponytail: bitmaps are built on first pick, not up front — the transparent
        // conversion is a full per-pixel pass, and a detect can return ten masks the
        // user never selects. Upgrade path if pick latency ever bites: prebuild in
        // the background after onMasks.
        const _autoMaskBitmaps = new Map();
        let _autoMaskRunning = false;

        function _isCueBusy() {
            return (state.generationQueueCount || 0) > 0;
        }

        function _notifyAutoMaskBlocked() {
            StatusBar.notify(AUTO_MASK_QUEUE_DISABLED_REASON, 'warning');
        }

        /**
         * MPI-421 — a detect run is a real ComfyUI workflow, and until now it ran
         * completely invisibly: the status bar read IDLE and the Detect button never
         * changed, so a slow pass could not be told from a hang.
         *
         * A detect drives the bar DIRECTLY rather than through the `tool:*` events a
         * generation uses, and that is deliberate. Those events latch the bar to a gen
         * id (MPI-203/208) and `statusBar._reconcileFromStore` force-idles any owner
         * the generation store cannot confirm — a detect never enters that store (see
         * `tasks/MPI-421/brief.md` § DECISION 1), so an id-tagged emit would be
         * self-healed away mid-run. Driving it with a null owner leaves the self-heal
         * inert. Indeterminate is the honest bar: SAM3 detect emits no tqdm, so there
         * is no percentage to show.
         */
        function _setAutoMaskRunning(running) {
            if (_autoMaskRunning === running) return;
            _autoMaskRunning = running;
            if (running) {
                StatusBar.progress.prepare('Detecting');
                StatusBar.progress.setIndeterminate(true);
                StatusBar.progress.startClock();
            }
            // The Detect button becomes Stop while this is true (MpiMaskDetectRow).
            Events.emit('automask:running', { running });
        }

        /** Terminal for a detect run. Idempotent — onDone fires once, but a cancel
         *  or an item switch can end the run before it does. */
        function _endAutoMaskRun(outcome = 'done') {
            if (!_autoMaskRunning) return;
            _setAutoMaskRunning(false);
            if (outcome === 'done') StatusBar.progress.complete();
            else StatusBar.progress.cancel();
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
                return;
            }
            // MPI-421 (absorbed MPI-402): every toggle used to re-dispatch the whole
            // graph, because ImpactSEGSPicker only produced masks for the chips that
            // were selected at dispatch time. One detect now returns them all, so this
            // is a local composite. The dispatch survives for ONE case: a cold
            // rehydrate from maskTempStore, which restores thumbs + picks but not the
            // RAM url cache — and that run repopulates the cache for free.
            if (!_autoMaskUrls.length) {
                _runAutoMaskWorkflow(false);
                return;
            }
            _applyPicksFromCache(picks);
        });

        /**
         * Composite the selected chips from the cached detect result. Builds the
         * bitmap for a pick the first time it is selected and keeps it, so toggling
         * the same chip off and on costs nothing.
         *
         * NOTHING here dispatches. The one surviving dispatch lives in the 'change'
         * handler, gated on an empty cache — because every inconsistency below is one
         * a re-run would reproduce (a stale pick index survives the very run that was
         * supposed to fix it), so "recover by re-running" would loop forever. Reset
         * and say so, exactly like `_restoreAutoPickMasks` does.
         */
        async function _applyPicksFromCache(picks) {
            // The two branches of a run are index-aligned by construction (both walk
            // the same SEGS list), so a length disagreement means the mapping is not
            // trustworthy — pick i would paint object j.
            if (_lastDetectThumbUrls.length && _autoMaskUrls.length !== _lastDetectThumbUrls.length) {
                clientLogger.warn('automask',
                    `mask list ${_autoMaskUrls.length} != thumbs ${_lastDetectThumbUrls.length}; dropping picks`);
                _resetAutoPickStateWithToast();
                return;
            }
            const missing = [...picks].filter(i => !_autoMaskBitmaps.has(i));
            if (missing.some(i => !_autoMaskUrls[i])) {
                clientLogger.warn('automask', `pick out of range for ${_autoMaskUrls.length} masks; dropping picks`);
                _resetAutoPickStateWithToast();
                return;
            }
            try {
                await Promise.all(missing.map(async (i) => {
                    const dataUrl = await _maskUrlToTransparentDataUrl(_autoMaskUrls[i]);
                    const res  = await fetch(dataUrl);
                    const blob = await res.blob();
                    _autoMaskBitmaps.set(i, await createImageBitmap(blob));
                }));
            } catch (err) {
                clientLogger.warn('automask', `Failed to apply auto-masks: ${err?.message || err}`);
                return;
            }
            canvas.setAutoPickMasks(new Map(_autoMaskBitmaps));
            canvas.setSelectedAutoPicks(new Set(picks));
            await _saveAutoPickEntry(_currentItem, [..._autoMaskUrls], picks, _lastDetectThumbUrls);
            // MPI-426: a state sync, NOT a publish. The picks live in the display-only
            // auto layer; the op strip stays locked until Add bakes them.
            el.evaluateMask();
        }

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

            const exec = runAutoMask({
                imageUrl,
                detectorModel:   _autoMaskModel,
                useBox:          _autoMaskUseBox,
                pointsMode:      _pointsMode,
                pointsPositive:  points?.positive,
                pointsNegative:  points?.negative,
                textMode:        _textMode,
                textPrompt:      _textPrompt,
            });
            _autoMaskExec = exec;
            _setAutoMaskRunning(true);

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

            // MPI-421: this now arrives on EVERY run and carries every detected
            // object's mask, whatever is selected — so it is the cache fill, and the
            // compositing moved to _applyPicksFromCache (which the chip strip also
            // calls, without a workflow).
            exec.onMasks = async (maskUrls) => {
                if (!isCurrentRun()) return;
                _autoMaskUrls = [...maskUrls];
                _autoMaskBitmaps.clear();
                if (_autoMaskPicks.size === 0) return;   // a bare detect is a preview
                await _applyPicksFromCache(_autoMaskPicks);
            };

            exec.onError = (err) => {
                if (_autoMaskExec !== exec) return;
                _autoMaskExec = null;
                clientLogger.error('automask', 'Auto-mask error', err);
            };

            // The handle's only terminal (MPI-421) — fires once, however the run
            // ended, including a Stop.
            exec.onDone = () => {
                if (_autoMaskExec !== exec && _autoMaskExec !== null) return;
                _endAutoMaskRun('done');
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
            // A different item's masks are not this item's — the cache is per detect
            // run, and a run belongs to the entry it was dispatched for (MPI-421).
            _autoMaskUrls = [];
            _autoMaskBitmaps.clear();
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
            _autoMaskUrls = [];
            _autoMaskBitmaps.clear();
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
            _endAutoMaskRun('cancelled');

            if (!apply) {
                // The cached detect result is part of the preview, so it goes too —
                // re-entering the tool must not resurrect masks for a thumb strip
                // that no longer exists (MPI-421).
                _autoMaskUrls = [];
                _autoMaskBitmaps.clear();
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

        /**
         * Tool modes that map 1:1 onto an MpiCanvas `activeMode` of the same name.
         * `crop` is handled separately above because it also restores its rect.
         *
         * A SET, not a chain of `else if` (MPI-375): `paint` was added to MpiCanvas,
         * to the rail and to `_viewerModeFor()`, and the old chain silently sent it
         * down the fallback to `activeMode = 'none'`. Nothing failed — the tool
         * mounted, the panel rendered, and the canvas just panned on drag, which
         * reads as a dead tool rather than as a missing branch. Adding a canvas mode
         * means adding it HERE and to `_syncModeFromCanvas` below, and nowhere else.
         */
        const CANVAS_MODES = new Set(['mask', 'paint', 'composite']);

        /**
         * Canvas told us its mode changed; drop any tool mode that no longer matches.
         * Written once because the two `modechange` subscriptions (initial mount and
         * the post-preview remount) had identical copies, and a mode added to one
         * would have been forgotten in the other.
         * @param {string} mode - the canvas' new activeMode
         */
        function _syncModeFromCanvas(mode) {
            for (const m of [...CANVAS_MODES, 'crop', 'automask']) {
                if (mode !== m && _currentMode === m) _currentMode = 'none';
            }
        }

        /** Single _currentMode replaces _isCropMode, _isMaskMode, _isAutoMaskMode */
        function _enterMode(mode) {
            if (_currentMode === mode) return;
            _currentMode = mode;

            if (mode === 'crop') {
                canvas.activeMode = 'crop';
                if (_activeCropSize) canvas.setCropSize(_activeCropSize.w, _activeCropSize.h);
                else                 canvas.setCropRatio(_activeCropRatio);
            } else if (CANVAS_MODES.has(mode)) {
                canvas.activeMode = mode;
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

            _syncModeFromCanvas(mode);
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
            // Both layer families count (MPI-375): a paint-only entry has an empty
            // maskCanvas, so a mask-only test would fall through and restore an
            // empty TEMP over the strokes.
            const hasLiveWork = !!(_cv.el?.maskCanvas && hasMaskContent(_cv.el.maskCanvas))
                || !!_cv.el?.hasPaint?.();
            if (sameEntry && !_previewInst && hasLiveWork) {
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

                // MPI-373: Mask Comp's cut IS the entry's mask, and `loadImage()` just
                // wiped the hole because it was drawn for the OLD image's geometry.
                // Re-read it here — AFTER `_restoreLayers()` has put this entry's mask
                // on the canvas, which is why the panel cannot do it: selecting another
                // entry never remounts the panel, so its mount-time read is the one
                // thing that never fires again, and Apply died with the tool still open.
                // A no-op on Paint Comp, whose cut is the brush.
                await canvas.refreshCompositeHoleFromMask?.();
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

        /**
         * Pick one of the ten procedural dab presets (MPI-435). Same id space for both
         * destinations — one shared dab, so a preset means the same thing on either.
         * @param {string} id - a `brushDab.BRUSH_PRESETS` id
         */
        el.setMaskBrushPreset = (id) => canvas.setBrushPreset?.(id);

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

        // ── Paint layer (MPI-375) ────────────────────────────────────────────
        // Same surface shape as the mask block above, so `MpiMaskStrip` can drive
        // either destination by name. The paint layer is NOT a mask: it is real
        // colour that Apply flattens into a new history entry, and it stays visible
        // while the user switches to a mask tool — that is the whole paint → mask →
        // detail flow the card exists for.
        el.setPaintBrushMode = (mode) => {
            if (mode === 'brush' || mode === 'eraser') canvas.setPaintBrushType?.(mode);
        };
        el.setPaintEnabled   = (v) => canvas.setPaintEnabled?.(v);
        el.setPaintOpacity   = (v) => canvas.setPaintOpacity?.(v);
        el.setPaintColor     = (c) => canvas.setPaintColor?.(c);
        el.setPaintBrushSize = (s) => canvas.setPaintBrushSize?.(s);
        el.setPaintBrushPreset = (id) => canvas.setPaintBrushPreset?.(id);
        el.getPaintURL       = () => canvas.getPaintURL?.() ?? null;
        el.hasPaint          = () => !!canvas.hasPaint?.();
        /** Wipe the paint layer as ONE undo entry. @returns {boolean} true if it had pixels */
        el.clearPaint        = () => !!canvas.clearPaint?.();
        el.setPaintFromDataURL = (url) => canvas.setPaintFromDataURL?.(url);

        // ── Layer conversion (MPI-439) ───────────────────────────────────────
        // Both are a copy and a merge; the managers own the pixels and the undo
        // entry, so the Block reaches for these and never for a canvas.
        /** mask → paint, current paint colour, flat. @returns {boolean} true when pixels changed */
        el.maskToPaint = () => !!canvas.maskToPaint?.();
        /** paint → mask (manual layer). @returns {boolean} true when pixels changed */
        el.paintToMask = () => !!canvas.paintToMask?.();

        // ── Shape gizmo (MPI-368) ────────────────────────────────────────────
        // ONE gizmo, two destinations: `dest` is 'mask' or 'paint' and decides which
        // layer a commit rasterises into. It is armed INSIDE the canvas' existing
        // mask/paint mode, like points mode — not as a fourth canvas mode — so
        // nothing about brush ownership or the undo gate changes underneath it.
        /** @param {null|'mask'|'paint'} dest */
        el.setShapeMode  = (dest) => canvas.setShapeMode?.(dest);
        el.setShapeKind  = (kind) => canvas.setShapeKind?.(kind);
        el.getShapeKind  = () => canvas.getShapeKind?.() ?? 'rect';
        el.hasShape      = () => !!canvas.hasShape?.();
        el.resetShape    = () => canvas.resetShape?.();
        /** Drop the gizmo. Not an edit — no pixels change, so no undo entry. */
        el.clearShape    = () => !!canvas.clearShape?.();
        /** @param {'add'|'subtract'|'fill'|'erase'} op @returns {boolean} true when pixels changed */
        el.commitShape   = (op) => !!canvas.commitShape?.(op);

        /**
         * Flatten the paint layer onto the current entry as ONE new history entry.
         *
         * Sharp does the pixels server-side (`/project/apply-paint`), so a 4K source
         * never round-trips as base64 — only the paint LAYER travels, because it
         * exists nowhere but this canvas. The source entry is untouched and keeps its
         * own paint, so Apply is undone by deleting the new entry.
         *
         * The opacity slider RIDES ALONG, so the new entry looks like what was on
         * screen. It stays display opacity everywhere else — the layer's own pixels
         * are untouched, and the scale is applied once to the flattened layer
         * server-side, so overlapping dabs in one stroke cannot bake darker than
         * the rest of it.
         */
        el.applyPaint = () => _flattenOverlay({
            dataUrl:   canvas.getPaintURL?.(),
            opacity:   canvas.getPaintOpacity?.() ?? 1,
            operation: 'paint',
            empty:     'Nothing painted yet',
            busy:      'Applying paint...',
            done:      'Paint applied!',
            event:     'paint-applied',
        });

        /**
         * Flatten an RGBA overlay onto the current entry as ONE new history entry.
         *
         * TWO callers, ONE round trip (MPI-454). Paint's Apply and Place's Apply are the
         * same operation on the same route — an RGBA plane carrying its own alpha, blended
         * onto the entry by Sharp — and the only things that differ are where the pixels
         * came from and what the result is called. Splitting them into two copies would
         * mean two places to fix the next time the route's contract moves.
         *
         * `operation` reaches the SERVER, not just the item: it names the sidecar's
         * operation and the filename prefix, so a placement is not filed as a paint.
         *
         * @param {{dataUrl: string|null, opacity?: number, operation: string, empty: string,
         *          busy: string, done: string, event: string}} o
         */
        async function _flattenOverlay(o) {
            if (!o.dataUrl) { StatusBar.notify(o.empty, 'warning'); return; }
            if (!_currentItem?.filePath || !state.currentProject?.folderPath) return;

            StatusBar.progress.start(o.busy);
            try {
                const res = await fetch('/project/apply-paint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderPath:     state.currentProject.folderPath,
                        itemId:         crypto.randomUUID(),
                        sourceFilePath: _resolveUrl(_currentItem.filePath),
                        paintDataUrl:   o.dataUrl,
                        opacity:        o.opacity ?? 1,
                        operation:      o.operation,
                    }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || !data?.success) throw new Error(data?.error || `apply-paint ${res.status}`);

                const newItem = createImageItem({
                    id:              data.itemId,
                    filePath:        `/project-file?path=${encodeURIComponent(data.filePath)}`,
                    operation:       o.operation,
                    displayName:     data.displayName || data.filename.replace(/\.[^.]+$/, ''),
                    pixelDimensions: data.pixelDimensions || { w: 0, h: 0 },
                    ...(data.thumbPath ? { thumbPath: data.thumbPath } : {}),
                });

                emit(o.event, { item: newItem });
                StatusBar.progress.complete(o.done);
            } catch (err) {
                clientLogger.warn('MpiCanvasViewer', `apply ${o.operation} failed: ${err?.message || err}`);
                StatusBar.progress.cancel();
            }
        }

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
            _autoMaskUrls = [];
            _autoMaskBitmaps.clear();
            _clearAutoPickEntry(_currentItem, true);
            _runAutoMaskWorkflow(true);
        };

        /** Is a detect run in flight? The detect row reads this AT MOUNT — the
         *  `automask:running` event only covers rows that were already listening,
         *  and a tool switch mid-run mounts a fresh one (MPI-421). */
        el.isAutoMaskRunning = () => _autoMaskRunning;

        /** Stop a detect run in flight (MPI-421). The exec's interrupt existed from
         *  day one — there was simply no UI wired to it. */
        el.cancelAutoMaskDetect = () => {
            if (!_autoMaskRunning) return;
            _autoMaskExec?.cancel();
            _autoMaskExec = null;
            _endAutoMaskRun('cancelled');
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

        // ── Paint Adjust — grow / shrink / edge band over RGBA (MPI-436) ─────
        // The same primitive as the mask's Adjust above, pointed at the paint layer:
        // one `distanceField.js`, two destinations. No `evaluateMask()` on Apply —
        // the paint layer is not a mask and re-publishing would be a lie about what
        // the op strip is gated on.

        /** Enter paint Adjust: snapshot the layer so every frame derives from tool-entry state. */
        el.beginPaintAdjust   = () => canvas.beginPaintAdjust?.();
        /** @param {{grow?:number, outward?:number, inward?:number, edge?:boolean}} opts radii in IMAGE px */
        el.previewPaintAdjust = (opts) => canvas.previewPaintAdjust?.(opts) ?? false;
        /** Bake the preview into the layer as ONE undo entry. */
        el.applyPaintAdjust   = () => !!canvas.applyPaintAdjust?.();
        el.endPaintAdjust     = () => !!canvas.endPaintAdjust?.();
        /**
         * Fill enclosed holes with the current colour (MPI-566) — the payoff of the
         * outline tool. Same flood as `fillMaskHoles` above; only the composite differs.
         * No `evaluateMask()`, for the reason the whole paint block gives.
         */
        el.fillPaintHoles     = () => !!canvas.fillPaintHoles?.();

        // ── Composite (MPI-373) ──────────────────────────────────────────────
        // Mirrors the paint surface by name so `MpiMaskStrip` drives this destination
        // by table lookup too. The layer is SCRATCH — there is no per-entry restore
        // here on purpose, and no `getURL` counterpart that persists.

        /** Point the tool at image 2 (the slot). @returns {Promise<boolean>} */
        el.setCompositeUnderlay      = (url) => canvas.setCompositeUnderlay?.(url) ?? Promise.resolve(false);
        /**
         * Mask Comp: take the cut from the selected entry's OWN mask (user, 2026-08-04).
         * There is no pasted-mask slot — the mask toolkit already points at that layer.
         * @returns {Promise<boolean>} false when the entry carries no mask
         */
        el.setCompositeHoleFromMask  = () => canvas.setCompositeHoleFromMask?.() ?? Promise.resolve(false);
        el.setCompositeBrushMode     = (type) => canvas.setCompositeBrushType?.(type);
        el.setCompositeBrushSize     = (n) => canvas.setCompositeBrushSize?.(n);
        el.setCompositeEnabled       = (v) => canvas.setCompositeEnabled?.(v);
        el.hasCompositeUnderlay      = () => !!canvas.hasCompositeUnderlay?.();
        el.hasCompositeHole          = () => !!canvas.hasCompositeHole?.();
        /** The cut as a mask PNG at source resolution, or null when nothing is cut. */
        el.getCompositeURL           = () => canvas.getCompositeURL?.() ?? null;
        el.clearComposite            = () => !!canvas.clearComposite?.();
        /** Claim "the cut changed" — ONE slot, cleared by the panel's destroy(). */
        el.setOnCompositeChange      = (fn) => canvas.setOnCompositeChange?.(fn);

        // ── Place (MPI-454) ──────────────────────────────────────────────────
        // The third composite front end, and the one that inverts the stack: the slot
        // image goes ON TOP at a size and angle the gizmo decides, and its own alpha is
        // the cut. It needs no discardPreview branch of its own — `resetComposite()` and
        // `clearShape()` are already on that seam, and Place is made of exactly those two.

        /**
         * Point Place at the image to stamp.
         * @param {string|null} url
         * @param {{reseed?: boolean}} [opts] `reseed: false` keeps the placement the user
         *   has already dragged — what the Remove Background toggle needs.
         * @returns {Promise<boolean>} false when the image could not be loaded
         */
        el.setPlaceImage = (url, opts) => canvas.setPlaceImage?.(url, opts) ?? Promise.resolve(false);
        el.hasPlaceImage = () => !!canvas.hasPlaceImage?.();

        /**
         * Flatten the placement onto the current entry as ONE new history entry. The SAME
         * route paint's Apply uses — the placed image is rasterised into a full-frame RGBA
         * plane at the entry's own resolution, so the transform never crosses the wire and
         * the server needs no knowledge of it at all.
         */
        el.applyPlace = () => _flattenOverlay({
            dataUrl:   canvas.getPlaceURL?.(),
            // Always 1: a placement is a hard stamp. The opacity slider belongs to the
            // paint layer, and the composite group has never offered one — a display alpha
            // would make the preview disagree with the file Sharp writes.
            opacity:   1,
            operation: 'composite',
            empty:     'Nothing placed yet',
            busy:      'Placing image...',
            done:      'Image placed!',
            event:     'place-applied',
        });

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

            // MPI-436: paint's Adjust is the same kind of uncommitted preview and
            // extends this seam rather than the call site. The paint LAYER itself
            // still never does — a stroke is committed pixels (MPI-375).
            if (canvas.hasPaintAdjustPreview?.()) {
                canvas.endPaintAdjust?.();
                dropped = true;
            }

            const hasDetectPreview = _autoMaskPicks.size > 0
                || !!canvas.mask?.hasAutoLayer
                || _lastDetectThumbUrls.length > 0;
            if (hasDetectPreview) {
                _exitAutoMaskMode(false);
                dropped = true;
            }

            // MPI-368: a gizmo in flight IS a preview — an uncommitted shape must not
            // outlive its tool, or the next tool inherits a shape the user never
            // committed to. `clearShape()` reports whether there was one and does not
            // care whether the tool is still armed, so this is immune to the order
            // mountOptions() happens to discard and destroy in.
            if (canvas.clearShape?.()) dropped = true;

            // MPI-373: an uncommitted composite is a preview too, and a bigger one —
            // the cut AND the slot image. Both go, so leaving the tool restores the
            // single-entry canvas and leaves nothing on disk. `resetComposite()`
            // reports whether there was anything, so this is order-independent like
            // the shape branch above.
            if (canvas.resetComposite?.()) dropped = true;

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
                    _syncModeFromCanvas(mode);
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
            // A detect in flight owns the status bar; tearing the viewer down without
            // ending it strands an active bar with nothing driving it (MPI-421).
            _autoMaskExec?.cancel();
            _endAutoMaskRun('cancelled');
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
