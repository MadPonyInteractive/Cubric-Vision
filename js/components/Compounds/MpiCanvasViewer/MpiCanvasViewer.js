/**
 * MpiCanvasViewer — Compound: canvas display with tool mode state machine.
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
import { MpiRatioSelector } from '../MpiRatioSelector/MpiRatioSelector.js';
import { MpiToolActionBar } from '../MpiToolActionBar/MpiToolActionBar.js';
import { MpiAutoMaskThumbs } from '../MpiAutoMaskThumbs/MpiAutoMaskThumbs.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { runAutoMask } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { state } from '../../../state.js';
import { createImageItem } from '../../../data/projectModel.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

export const MpiCanvasViewer = ComponentFactory.create({
    name: 'MpiCanvasViewer',
    css: ['js/components/Compounds/MpiCanvasViewer/MpiCanvasViewer.css'],

    template: () => `
        <div class="mpi-canvas-viewer">
            <div class="mpi-canvas-viewer__wrap" id="canvas-wrap"></div>
            <div class="mpi-canvas-viewer__spinner" id="spinner-wrap"></div>
            <div class="mpi-canvas-viewer__crop-bar" id="crop-bar"></div>
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

        const spinnerWrap = el.querySelector('#spinner-wrap');
        MpiSpinner.mount(spinnerWrap, { size: 'lg', variant: 'primary' });

        const canvasInst = MpiCanvas.mount(el.querySelector('#canvas-wrap'), {
            onBrushTypeChange: (type) => {
                maskBar?.el.setActive(type === 'eraser' ? 'eraser' : 'brush');
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

        async function _showCompare(itemA, itemB) {
            if (!itemA?.filePath || !itemB?.filePath) return;
            try {
                _comparingActive = true;
                await canvas.loadImage(_resolveUrl(itemA.filePath));
                await canvas.loadComparisonImage(_resolveUrl(itemB.filePath));
            } catch (err) {
                console.warn('[MpiCanvasViewer] Failed to load compare images:', err);
            } finally {
                _comparingActive = false;
            }
        }

        // ── Crop action bar ──────────────────────────────────────────────────

        const ratioSel = MpiRatioSelector.mount(document.createElement('div'), {
            modelType: 'social',
            value: SOCIAL_RATIOS[0].label,
        });
        ratioSel.on('change', ({ ratio }) => {
            _activeCropRatio = ratio;
            canvas.setCropRatio(ratio);
        });

        const cropBarSlot = document.createElement('div');
        cropBarSlot.className = 'mpi-canvas-viewer__bar-slot';
        el.querySelector('#crop-bar').appendChild(cropBarSlot);

        const cropBar = MpiToolActionBar.mount(cropBarSlot, {
            leftSlot: ratioSel,
            actions: [
                { key: 'apply', icon: 'check', label: 'Apply', variant: 'primary', info: 'Save crop as a new history entry' },
                { key: 'cancel', icon: 'close', label: 'Cancel', variant: 'ghost', info: 'Cancel crop' },
            ],
        });

        cropBar.on('action', ({ key }) => {
            if (key === 'apply') _runCrop();
            if (key === 'cancel') _exitMode();
        });

        // ── Mask action bar ──────────────────────────────────────────────────

        const maskBarSlot = document.createElement('div');
        maskBarSlot.className = 'mpi-canvas-viewer__bar-slot';
        el.querySelector('#crop-bar').appendChild(maskBarSlot);

        const maskBar = MpiToolActionBar.mount(maskBarSlot, {
            actions: [
                { key: 'brush', icon: 'pencil', label: 'Brush', variant: 'ghost', toggleable: true, active: true, radioGroup: 'tool', info: 'Paint mask (B)' },
                { key: 'eraser', icon: 'eraser', label: 'Eraser', variant: 'ghost', toggleable: true, radioGroup: 'tool', info: 'Erase mask (E)' },
                { key: 'clear', icon: 'trash', label: 'Clear', variant: 'ghost', info: 'Clear entire mask' },
                { key: 'invert', icon: 'swap', label: 'Invert', variant: 'ghost', info: 'Invert mask colours' },
                { key: 'cancel', icon: 'close', label: 'Cancel', variant: 'ghost', info: 'Cancel mask and discard' },
                { key: 'apply', icon: 'check', label: 'Apply Mask', variant: 'primary', info: 'Confirm mask for generation' },
            ],
        });

        maskBar.on('action', ({ key }) => {
            if (key === 'brush') { canvas.setBrushType('brush'); }
            if (key === 'eraser') { canvas.setBrushType('eraser'); }
            if (key === 'clear') {
                canvas.clearMask();
                _hasMask = false;
                emit('mask-ready', { hasMask: false });
            }
            if (key === 'invert') { canvas.flipMaskColor(); }
            if (key === 'cancel') {
                canvas.clearMask();
                _hasMask = false;
                _exitMode();
                emit('mask-ready', { hasMask: false });
            }
            if (key === 'apply') {
                _hasMask = true;
                _exitMode();
                emit('mask-ready', { hasMask: true });
            }
        });

        // ── Auto-mask ─────────────────────────────────────────────────────────

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

        const autoMaskThumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
        autoMaskThumbs.on('change', ({ picks }) => {
            _autoMaskPicks = picks;
            _runAutoMaskWorkflow(false);
        });

        const autoMaskModelDropdown = MpiDropdown.mount(document.createElement('div'), {
            options: DETECTION_MODELS,
            value: _autoMaskModel,
            info: 'Detection model',
            direction: 'up',
        });
        autoMaskModelDropdown.on('change', ({ value }) => {
            _autoMaskModel = value;
            autoMaskThumbs.el.clear();
            autoMaskThumbs.el.clearPicks?.();
            _autoMaskPicks.clear();
            canvas.clearMask();
            _hasMask = false;
        });

        const autoMaskModeRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: [
                { label: 'Box',     value: 'box' },
                { label: 'Segment', value: 'segment' },
            ],
            value: 'box',
            name: 'auto-mask-mode',
            info: 'Detection mode',
        });
        autoMaskModeRadio.on('select', ({ value }) => {
            _autoMaskUseBox = value === 'box';
            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            canvas.clearMask();
            _hasMask = false;
        });

        const autoMaskLeftSlotEl = document.createElement('div');
        autoMaskLeftSlotEl.className = 'mpi-canvas-viewer__auto-mask-controls';
        autoMaskLeftSlotEl.appendChild(autoMaskModelDropdown.el);
        autoMaskLeftSlotEl.appendChild(autoMaskModeRadio.el);
        const autoMaskLeftSlotInst = { el: autoMaskLeftSlotEl };

        const autoMaskBarSlot = document.createElement('div');
        autoMaskBarSlot.className = 'mpi-canvas-viewer__bar-slot';
        el.querySelector('#crop-bar').appendChild(autoMaskBarSlot);

        const autoMaskBar = MpiToolActionBar.mount(autoMaskBarSlot, {
            topSlot: autoMaskThumbs,
            leftSlot: autoMaskLeftSlotInst,
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
                canvas.clearMask();
                _hasMask = false;
                _runAutoMaskWorkflow(true);
            }
            if (key === 'apply')  _exitAutoMaskMode(true);
            if (key === 'cancel') _exitAutoMaskMode(false);
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
                    await canvas.setMaskDataURL(dataUrl);
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
            }

            autoMaskThumbs.el.clear();
            _autoMaskPicks.clear();
            _exitMode();
        }

        // ── Tool mode state machine ───────────────────────────────────────────

        /** Single _currentMode replaces _isCropMode, _isMaskMode, _isAutoMaskMode */
        function _enterMode(mode) {
            if (_currentMode === mode) return;
            _currentMode = mode;

            if (mode === 'crop') {
                canvas.activeMode = 'crop';
                canvas.setCropRatio(_activeCropRatio);
                cropBar.el.show();
            } else {
                cropBar.el.hide();
            }

            if (mode === 'mask') {
                canvas.activeMode = 'mask';
                maskBar.el.show();
                maskBar.el.setActive('brush');
            } else {
                maskBar.el.hide();
            }

            if (mode === 'automask') {
                autoMaskBar.el.show();
            } else {
                autoMaskBar.el.hide();
            }

            emit('mode-changed', { mode: _currentMode });
        }

        function _exitMode() {
            if (_currentMode === 'none') return;
            _currentMode = 'none';
            canvas.activeMode = 'none';
            cropBar.el.hide();
            maskBar.el.hide();
            autoMaskBar.el.hide();
            emit('mode-changed', { mode: 'none' });
        }

        // ── Canvas modechange → sync with our state machine ──────────────────

        canvasInst.on('modechange', ({ mode }) => {
            if (mode !== 'crop' && _currentMode === 'crop') {
                _currentMode = 'none';
                cropBar.el.hide();
            }
            if (mode !== 'mask' && _currentMode === 'mask') {
                _currentMode = 'none';
                maskBar.el.hide();
            }
            if (mode !== 'automask' && _currentMode === 'automask') {
                _currentMode = 'none';
                autoMaskBar.el.hide();
            }
            if (mode !== 'compare' && _comparingActive) {
                _comparingActive = false;
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

            try {
                const res = await fetch('/project/crop-media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderPath: state.currentProject.folderPath,
                        sourceFilePath: _resolveUrl(_currentItem.filePath),
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

        el.enterMode = (mode) => {
            if (mode === 'none') { _exitMode(); return; }
            _enterMode(mode);
        };

        el.exitMode = () => _exitMode();

        el.getCurrentMaskDataURL = () => {
            if (!_hasMask) return null;
            return canvas.getMaskDataURL('black', 'white');
        };

        el.hasMask = () => _hasMask;

        el.setGenerating = (on) => _setGeneratingSpinner(on);

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
