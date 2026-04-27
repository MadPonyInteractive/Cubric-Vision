/**
 * MpiCanvasViewer — Organism: canvas display with tool mode state machine.
 *
 * Manages crop, mask, and auto-mask modes. Owns the mask store (Map<idx, dataUrl>).
 *
 * @param {string} [initialImageUrl=''] - URL of the first image to load
 * @param {number} [initialIdx=0]        - History index of the initial image
 *
 * Instance API (on el):
 *   el.loadEntry(item, idx)            — save current mask, load item's image, restore idx's mask
 *   el.loadCompare(itemA, itemB)       — load two images in compare mode
 *   el.enterMode(mode)                — enter 'crop'|'mask'|'automask' (or 'none' to exit all)
 *   el.exitMode()                     — exit any active tool mode
 *   el.getCurrentMaskDataURL()         — returns current mask as data URL, or null
 *   el.hasMask()                      — returns boolean
 *   el.setGenerating(bool)             — show/hide generating spinner
 *   el.getCurrentEntry()              — returns the current HistoryItem (set by loadEntry)
 *   el.getImageEl()                   — returns canvas component root el (apply CSS filter here)
 *   el.setPreviewSrc(src)             — load a preview image (base64/URL) without touching history
 *
 * Emits:
 *   'mode-changed'  { mode }          — tool mode changed (from any source)
 *   'crop-applied'  { item }          — crop completed; item is the new HistoryItem
 *   'mask-ready'    { hasMask }       — mask painted or cleared
 *   'entry-loaded'  { idx, hasMask }  — image loaded for index
 */

import { ComponentFactory } from '../../factory.js';
import { MpiCanvas } from '../../Primitives/MpiCanvas/MpiCanvas.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { MpiAutoMaskThumbs } from '../../Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { hasMaskContent } from '../../../utils/maskUtils.js';
import { runAutoMask } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { state } from '../../../state.js';
import { createImageItem } from '../../../data/projectModel.js';
import { qs } from '../../../utils/dom.js';

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
        </div>
    `,

    setup: (el, props, emit) => {
        const initialImageUrl = props.initialImageUrl || '';
        const initialIdx = props.initialIdx ?? 0;

        // ── State ─────────────────────────────────────────────────────────────

        /** Single mode enum replaces three booleans: crop/mask/automask/none */
        let _currentMode = 'none';
        let _activeCropRatio = SOCIAL_RATIOS[0].ratio;
        let _hasMask = false;
        /** Saved mask data URLs keyed by history index */
        const _maskStore = new Map();

        // ── Canvas + spinner ─────────────────────────────────────────────────

        const spinnerWrap = qs('#spinner-wrap', el);
        MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });

        const canvasInst = MpiCanvas.mount(qs('#canvas-wrap', el), {
            onBrushTypeChange: (type) => {
                emit('brush-changed', { type: type === 'eraser' ? 'eraser' : 'brush' });
            },
        });
        const canvas = canvasInst.el;

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

        // Viewer retains ownership of the thumbs instance; MpiToolOptionsMask
        // re-parents the DOM node via getAutoMaskThumbsEl(). DO NOT destroy it
        // from the options compound — detach only.
        const autoMaskThumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
        autoMaskThumbs.on('change', ({ picks }) => {
            _autoMaskPicks = picks;
            if (picks.size === 0) {
                canvas.clearMask();
                _hasMask = false;
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

            _autoMaskExec = runAutoMask({
                imageUrl:      initialImageUrl,
                detectorModel: _autoMaskModel,
                useBox:        _autoMaskUseBox,
                picks:         _autoMaskPicks,
            });

            _autoMaskExec.onDetected = (urls) => {
                if (populateThumbs) {
                    autoMaskThumbs.el.setImages(urls);
                }
            };

            _autoMaskExec.onMask = async (maskUrl) => {
                if (_autoMaskPicks.size === 0) return;
                try {
                    const dataUrl = await _maskUrlToTransparentDataUrl(maskUrl);
                    await canvas.compositeMaskDataURL(dataUrl);
                    _hasMask = true;
                } catch (err) {
                    console.warn('[MpiCanvasViewer] Failed to apply auto-mask:', err);
                }
            };

            _autoMaskExec.onError = (err) => {
                _autoMaskExec = null;
                console.error('[MpiCanvasViewer] Auto-mask error:', err);
            };
        }

        function _exitAutoMaskMode(apply) {
            _autoMaskExec?.cancel();
            _autoMaskExec = null;

            if (!apply) {
                canvas.clearMask();
                _hasMask = false;
                emit('mask-clear', {});
            } else {
                // Only mark as ready if there are actual selections
                const hasSelections = _autoMaskPicks.size > 0;
                if (hasSelections) {
                    _hasMask = true;
                    emit('mask-ready', { hasMask: true });
                } else {
                    _hasMask = false;
                    emit('mask-clear', {});
                }
            }

            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
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

        canvasInst.on('modechange', ({ mode }) => {
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
            _exitMode();

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
                    operation: data.filename.replace(/\.[^.]+$/, ''),
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
        let _currentItem = null;

        el.loadEntry = async (item, idx) => {
            // Save current mask before switching away
            if (_hasMask) {
                _maskStore.set(_currentIdx, canvas.getMaskDataURL());
            } else {
                _maskStore.delete(_currentIdx);
            }

            _currentIdx = idx;
            _currentItem = item;
            _exitMode();

            await _showEntry(item);

            const saved = _maskStore.get(idx);
            if (saved) {
                await canvas.setMaskDataURL(saved);
                _hasMask = true;
            } else {
                canvas.clearMask();
                _hasMask = false;
            }

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

        el.getCurrentMaskDataURL = () => {
            if (!_hasMask) return null;
            return canvas.getMaskDataURL('black', 'white');
        };

        el.hasMask = () => _hasMask;

        el.setGenerating = (on) => _setGeneratingSpinner(on);

        el.setMaskHidden = (hidden) => { canvas.maskHidden = hidden; };

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
        };

        /**
         * Toggle between bounding-box and segmentation auto-mask output.
         * @param {boolean} useBox
         */
        el.setAutoMaskUseBox = (useBox) => {
            _autoMaskUseBox = !!useBox;
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
        };

        /** Kick off an auto-mask detect run and populate the thumbs strip. */
        el.runAutoMaskDetect = () => {
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
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

        /** Returns the current history item (set by loadEntry). */
        el.getCurrentEntry = () => _currentItem;

        /** Returns the canvas component root el — CSS filter applied here affects rendered image. */
        el.getImageEl = () => canvasInst.el;

        /** Mount an external canvas (e.g. Pixi _app.canvas) as the base layer. */
        el.setBaseCanvas = (canvasEl) => canvasInst.el.setBaseCanvas?.(canvasEl);

        /** Remove external base canvas, revert to internal 2D base. */
        el.clearBaseCanvas = () => canvasInst.el.clearBaseCanvas?.();

        /** Direct image element ref (HTMLImageElement) for pipeline source. */
        Object.defineProperty(el, 'img', { get: () => canvasInst.el.img });

        /** Load a preview image (base64 or URL) into the canvas without touching history. */
        el.setPreviewSrc = (src) => { canvas.loadImage(src); };

        el.destroy = () => {
            _autoMaskExec?.cancel();
            autoMaskThumbs.el.destroy?.();
            canvasInst.el.destroy();
        };

        // ── Init: load initial image ─────────────────────────────────────────

        if (initialImageUrl) {
            _showEntry({ filePath: initialImageUrl }).then(() => {
                const saved = _maskStore.get(initialIdx);
                if (saved) {
                    canvas.setMaskDataURL(saved);
                    _hasMask = true;
                }
                emit('entry-loaded', { idx: initialIdx, hasMask: _hasMask });
            });
        }
    },
});
