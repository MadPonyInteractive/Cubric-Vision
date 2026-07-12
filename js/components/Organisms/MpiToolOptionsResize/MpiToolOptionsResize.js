/**
 * MpiToolOptionsResize — Organism: resize / flip / rotate tool options.
 *
 * Size source:
 *   - SDXL/FLUX: ratio radio (orientation + label) × multiplier (x1 | x2).
 *     Width/Height inputs hidden; derived from preset × multiplier.
 *   - FREE: manual Width/Height inputs.
 *
 * Live preview runs the image resize workflow on a small thumbnail of the
 * source (image first frame for video) with proportionally-scaled width and
 * height. Result paints into the inline preview slot, NOT into the viewer
 * canvas — source view stays untouched and interactive.
 *
 * Apply emits the full-resolution params; the parent block runs the full
 * workflow via generationService and appends the result as a new history
 * entry. Apply never overwrites the source.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { runCommand } from '../../../services/commandExecutor.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs } from '../../../utils/dom.js';
import { extractThumbnail, waitForVideoFrame } from '../../../utils/thumbnail.js';
import { getModelRatios } from '../../../utils/ratios.js';

const UPSCALE_METHODS = ['nearest', 'exact', 'bilinear', 'area', 'bicubic', 'lanczos', 'nvidia_rtx_vsr'];
const KEEP_PROPORTIONS = ['stretch', 'resize', 'pad', 'pad_edge', 'pad_edge_pixel', 'crop', 'pillarbox_blur', 'total_pixels'];
const CROP_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'];
// ImageResizeKJv2 only PAINTS pad_color for the solid 'pad' mode. The edge
// modes (pad_edge, pad_edge_pixel, pillarbox_blur) replicate/blur edge pixels
// and ignore pad_color, so the picker must not show for them.
const PAD_COLOR_MODES = new Set(['pad']);

const FAMILY_VALUES = new Set(['sdxl', 'flux', 'free']);
const ORIENTATION_VALUES = new Set(['portrait', 'landscape']);
const MULTIPLIER_VALUES = new Set(['1', '2']);

const THUMB_MAX_EDGE = 512;

const DEFAULTS = Object.freeze({
    family: 'free',
    orientation: 'portrait',
    ratioLabel: '1:1',
    multiplier: '1',
    width: 1024,
    height: 1024,
    upscale_method: 'lanczos',
    keep_proportion: 'crop',
    pad_color: { r: 0, g: 0, b: 0 },
    crop_position: 'center',
    divisible_by: 16,
    flip: 'none',
    rotation: 'none',
});

const FAMILIES = [
    { label: 'SDXL', value: 'sdxl' },
    { label: 'FLUX', value: 'flux' },
    { label: 'FREE', value: 'free' },
];

const ORIENTATIONS = [
    { label: 'Portrait',  value: 'portrait',  icon: 'ratio_9_16', info: 'Portrait orientation' },
    { label: 'Landscape', value: 'landscape', icon: 'ratio_16_9', info: 'Landscape orientation' },
];

const MULTIPLIERS = [
    { label: 'x1', value: '1', info: 'Use ratio resolution as-is' },
    { label: 'x2', value: '2', info: 'Double the ratio resolution' },
];

const labelize = (value) => String(value).replace(/_/g, ' ');

const clampInt = (value, fallback = 1) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
};

const normalizeColor = (value = {}) => ({
    r: Math.max(0, Math.min(255, Math.round(Number(value.r) || 0))),
    g: Math.max(0, Math.min(255, Math.round(Number(value.g) || 0))),
    b: Math.max(0, Math.min(255, Math.round(Number(value.b) || 0))),
});

function _ratioListFor(family, orientation) {
    return getModelRatios(family, orientation);
}

function _resolveRatioDims(family, orientation, label, multiplier) {
    const list = _ratioListFor(family, orientation);
    const r = list.find(x => x.label === label) || list[0];
    const mult = Number(multiplier) || 1;
    return { width: r.w * mult, height: r.h * mult };
}

function coerceSettings(settings) {
    const family = FAMILY_VALUES.has(settings.family) ? settings.family : DEFAULTS.family;
    const orientation = ORIENTATION_VALUES.has(settings.orientation) ? settings.orientation : DEFAULTS.orientation;
    const multiplier = MULTIPLIER_VALUES.has(String(settings.multiplier)) ? String(settings.multiplier) : DEFAULTS.multiplier;
    let ratioLabel = String(settings.ratioLabel ?? DEFAULTS.ratioLabel);
    if (family !== 'free') {
        const list = _ratioListFor(family, orientation);
        if (!list.some(r => r.label === ratioLabel)) ratioLabel = list[0]?.label ?? DEFAULTS.ratioLabel;
    }

    let width = clampInt(settings.width, DEFAULTS.width);
    let height = clampInt(settings.height, DEFAULTS.height);
    if (family !== 'free') {
        const dims = _resolveRatioDims(family, orientation, ratioLabel, multiplier);
        width = dims.width;
        height = dims.height;
    }

    return {
        family, orientation, ratioLabel, multiplier,
        width, height,
        upscale_method: UPSCALE_METHODS.includes(settings.upscale_method) ? settings.upscale_method : DEFAULTS.upscale_method,
        keep_proportion: KEEP_PROPORTIONS.includes(settings.keep_proportion) ? settings.keep_proportion : DEFAULTS.keep_proportion,
        pad_color: normalizeColor(settings.pad_color || DEFAULTS.pad_color),
        crop_position: CROP_POSITIONS.includes(settings.crop_position) ? settings.crop_position : DEFAULTS.crop_position,
        divisible_by: clampInt(settings.divisible_by, DEFAULTS.divisible_by),
        flip: ['none', 'x', 'y'].includes(settings.flip) ? settings.flip : DEFAULTS.flip,
        rotation: ['none', '90', '180', '270'].includes(String(settings.rotation)) ? String(settings.rotation) : DEFAULTS.rotation,
    };
}

/**
 * Scale Apply-time params down to thumbnail space for preview. The visual
 * result on the thumbnail is proportional to the full-res result.
 */
function scaleParamsForThumb(params, sourceLongest, thumbLongest) {
    if (!sourceLongest || !thumbLongest || sourceLongest === thumbLongest) {
        return { ...params, pad_color: { ...params.pad_color } };
    }
    const scale = thumbLongest / sourceLongest;
    return {
        ...params,
        width: Math.max(1, Math.round(params.width * scale)),
        height: Math.max(1, Math.round(params.height * scale)),
        divisible_by: Math.max(1, Math.round(params.divisible_by * scale)),
        pad_color: { ...params.pad_color },
    };
}

export const MpiToolOptionsResize = ComponentFactory.create({
    name: 'MpiToolOptionsResize',
    css: ['js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.css'],

    template: () => `
        <div class="mpi-tool-options-resize">
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Resolution Type</div>
                <div class="mpi-tool-options-resize__row" id="resize-family-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-orientation-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-ratio-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-multiplier-slot"></div>
                <div class="mpi-tool-options-resize__pair" id="resize-free-pair">
                    <div id="resize-width-slot"></div>
                    <div id="resize-height-slot"></div>
                </div>
            </div>
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Method</div>
                <div class="mpi-tool-options-resize__pair">
                    <div id="resize-method-slot"></div>
                    <div id="resize-proportion-slot"></div>
                </div>
                <div class="mpi-tool-options-resize__row" id="resize-crop-slot"></div>
                <div class="mpi-tool-options-resize__pair" id="resize-color-divisible-pair">
                    <div id="resize-color-slot"></div>
                    <div id="resize-divisible-slot"></div>
                </div>
            </div>
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Transform</div>
                <div class="mpi-tool-options-resize__row" id="resize-flip-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-rotation-slot"></div>
            </div>
            <div class="mpi-tool-options-resize__preview" id="resize-preview-slot">
                <div class="mpi-tool-options-resize__preview-label">Preview</div>
                <div class="mpi-tool-options-resize__preview-frame">
                    <img class="mpi-tool-options-resize__preview-img" alt="Resize preview" />
                    <div class="mpi-tool-options-resize__preview-spinner" id="resize-preview-spinner"></div>
                </div>
            </div>
            <div class="mpi-tool-options-resize__actions" id="resize-actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer, kind = 'image' } = props;
        let currentItem = props.currentItem ?? null;

        let settings = coerceSettings(
            getToolSettings(state.currentProject || {}, 'resize', DEFAULTS)
        );

        const _children = [];
        const _unsubs = [];
        const _persistTimers = new Map();
        let _previewTimer = null;
        let _previewExec = null;
        let _previewAbort = null;
        let _previewSerial = 0;
        let _destroyed = false;

        let _thumbDataUrl = null;
        let _thumbW = 0;
        let _thumbH = 0;
        let _sourceW = 0;
        let _sourceH = 0;

        let widthInput = null;
        let heightInput = null;
        let ratioRadio = null;
        let orientRadio = null;
        let multRadio = null;
        let _previewImg = null;
        let _previewSpinner = null;

        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'resize', key, value });
                _persistTimers.delete(key);
            }, 300));
        };

        const setValue = (key, value) => {
            settings = { ...settings, [key]: value };
            persist(key, value);
            syncConditionalRows();
            schedulePreview();
        };

        const params = () => ({
            ...settings,
            pad_color: { ...settings.pad_color },
        });

        const mount = (slotId, Component, componentProps) => {
            const host = qs(slotId, el);
            const inst = Component.mount(document.createElement('div'), componentProps);
            host.appendChild(inst.el);
            _children.push(inst);
            return inst;
        };

        // ── Resolution Type controls ─────────────────────────────────────────
        const familyRadio = mount('#resize-family-slot', MpiRadioGroup, {
            name: 'resize-family', value: settings.family, options: FAMILIES,
            info: 'Resolution preset family',
        });
        _unsubs.push(familyRadio.on('select', ({ value }) => {
            settings = { ...settings, family: value };
            if (value !== 'free') {
                const list = _ratioListFor(value, settings.orientation);
                if (!list.some(r => r.label === settings.ratioLabel)) {
                    settings = { ...settings, ratioLabel: list[0]?.label ?? DEFAULTS.ratioLabel };
                    persist('ratioLabel', settings.ratioLabel);
                }
                _applyPresetDims();
            }
            persist('family', value);
            rebuildResolutionControls();
            syncConditionalRows();
            schedulePreview();
        }));

        function rebuildResolutionControls() {
            // Tear down preset-only controls
            if (orientRadio) { orientRadio.destroy?.(); orientRadio = null; }
            if (ratioRadio)  { ratioRadio.destroy?.();  ratioRadio  = null; }
            if (multRadio)   { multRadio.destroy?.();   multRadio   = null; }
            qs('#resize-orientation-slot', el).innerHTML = '';
            qs('#resize-ratio-slot', el).innerHTML = '';
            qs('#resize-multiplier-slot', el).innerHTML = '';

            const isPreset = settings.family === 'sdxl' || settings.family === 'flux';

            qs('#resize-orientation-slot', el).hidden = !isPreset;
            qs('#resize-ratio-slot', el).hidden = !isPreset;
            qs('#resize-multiplier-slot', el).hidden = !isPreset;
            qs('#resize-free-pair', el).hidden = isPreset;

            if (isPreset) {
                orientRadio = MpiRadioGroup.mount(document.createElement('div'), {
                    name: 'resize-orientation', value: settings.orientation,
                    options: ORIENTATIONS, iconOnly: true,
                });
                qs('#resize-orientation-slot', el).appendChild(orientRadio.el);
                _children.push(orientRadio);
                orientRadio.on('select', ({ value }) => {
                    const prevList = _ratioListFor(settings.family, settings.orientation);
                    const newList  = _ratioListFor(settings.family, value);
                    const idx = prevList.findIndex(r => r.label === settings.ratioLabel);
                    let nextLabel = settings.ratioLabel;
                    if (idx >= 0 && newList[idx]) nextLabel = newList[idx].label;
                    else if (!newList.some(r => r.label === nextLabel)) nextLabel = newList[0]?.label ?? nextLabel;
                    settings = { ...settings, orientation: value, ratioLabel: nextLabel };
                    persist('orientation', value);
                    persist('ratioLabel', nextLabel);
                    rebuildRatioRadio();
                    _applyPresetDims();
                    schedulePreview();
                });

                rebuildRatioRadio();

                multRadio = MpiRadioGroup.mount(document.createElement('div'), {
                    name: 'resize-multiplier', value: settings.multiplier,
                    options: MULTIPLIERS,
                });
                qs('#resize-multiplier-slot', el).appendChild(multRadio.el);
                _children.push(multRadio);
                multRadio.on('select', ({ value }) => {
                    settings = { ...settings, multiplier: value };
                    persist('multiplier', value);
                    _applyPresetDims();
                    schedulePreview();
                });
            }
        }

        function rebuildRatioRadio() {
            if (ratioRadio) { ratioRadio.destroy?.(); ratioRadio = null; }
            qs('#resize-ratio-slot', el).innerHTML = '';
            const opts = _ratioListFor(settings.family, settings.orientation).map(r => ({
                label: r.label, value: r.label,
                icon: r.icon.replace('rect_', 'ratio_'),
                info: `${r.w}×${r.h}`,
            }));
            ratioRadio = MpiRadioGroup.mount(document.createElement('div'), {
                name: 'resize-ratio', value: settings.ratioLabel, options: opts,
                labelPosition: 'top', size: 'lg', columns: 5,
            });
            qs('#resize-ratio-slot', el).appendChild(ratioRadio.el);
            _children.push(ratioRadio);
            ratioRadio.on('select', ({ value }) => {
                settings = { ...settings, ratioLabel: value };
                persist('ratioLabel', value);
                _applyPresetDims();
                schedulePreview();
            });
        }

        function _applyPresetDims() {
            if (settings.family === 'free') return;
            const { width, height } = _resolveRatioDims(
                settings.family, settings.orientation, settings.ratioLabel, settings.multiplier
            );
            settings = { ...settings, width, height };
            persist('width', width);
            persist('height', height);
        }

        // ── Free Width/Height inputs ─────────────────────────────────────────
        widthInput = mount('#resize-width-slot', MpiInput, {
            type: 'number', label: 'Width', value: settings.width,
            min: 1, step: 1, info: 'Output width',
        });
        _unsubs.push(widthInput.on('input',  ({ value }) => setValue('width', clampInt(value, settings.width))));
        _unsubs.push(widthInput.on('change', ({ value }) => setValue('width', clampInt(value, settings.width))));

        heightInput = mount('#resize-height-slot', MpiInput, {
            type: 'number', label: 'Height', value: settings.height,
            min: 1, step: 1, info: 'Output height',
        });
        _unsubs.push(heightInput.on('input',  ({ value }) => setValue('height', clampInt(value, settings.height))));
        _unsubs.push(heightInput.on('change', ({ value }) => setValue('height', clampInt(value, settings.height))));

        // ── Method controls ──────────────────────────────────────────────────
        const methodDd = mount('#resize-method-slot', MpiDropdown, {
            options: UPSCALE_METHODS.map(value => ({ value, label: labelize(value) })),
            value: settings.upscale_method, direction: 'up',
            info: 'Resize method', wrapLabels: true,
        });
        _unsubs.push(methodDd.on('change', ({ value }) => setValue('upscale_method', value)));

        const proportionDd = mount('#resize-proportion-slot', MpiDropdown, {
            options: KEEP_PROPORTIONS.map(value => ({ value, label: labelize(value) })),
            value: settings.keep_proportion, direction: 'up',
            info: 'How to preserve the source image proportions', wrapLabels: true,
        });
        _unsubs.push(proportionDd.on('change', ({ value }) => setValue('keep_proportion', value)));

        const cropDd = mount('#resize-crop-slot', MpiDropdown, {
            options: CROP_POSITIONS.map(value => ({ value, label: labelize(value) })),
            value: settings.crop_position, direction: 'up',
            info: 'Crop anchor position',
        });
        _unsubs.push(cropDd.on('change', ({ value }) => setValue('crop_position', value)));

        const colorPicker = mount('#resize-color-slot', MpiColorPicker, {
            value: settings.pad_color, info: 'Padding color',
        });
        _unsubs.push(colorPicker.on('change', ({ r, g, b }) => setValue('pad_color', { r, g, b })));

        const divisibleInput = mount('#resize-divisible-slot', MpiInput, {
            type: 'number', label: 'Divisible by', value: settings.divisible_by,
            min: 1, step: 1, info: 'Force dimensions to be divisible by this number',
        });
        _unsubs.push(divisibleInput.on('input',  ({ value }) => setValue('divisible_by', clampInt(value, settings.divisible_by))));
        _unsubs.push(divisibleInput.on('change', ({ value }) => setValue('divisible_by', clampInt(value, settings.divisible_by))));

        const flipRadio = mount('#resize-flip-slot', MpiRadioGroup, {
            name: 'resize-flip', value: settings.flip, iconOnly: true,
            options: [
                { label: 'None',       value: 'none', icon: 'close',        info: 'No flip' },
                { label: 'Vertical',   value: 'x',    icon: 'flipY_stroke', info: 'Flip vertically' },
                { label: 'Horizontal', value: 'y',    icon: 'flipX_stroke', info: 'Flip horizontally' },
            ],
        });
        _unsubs.push(flipRadio.on('select', ({ value }) => setValue('flip', value)));

        const rotationRadio = mount('#resize-rotation-slot', MpiRadioGroup, {
            name: 'resize-rotation', value: settings.rotation,
            options: [
                { label: 'None', value: 'none', info: 'No rotation' },
                { label: '90',   value: '90',   info: 'Rotate 90 degrees' },
                { label: '180',  value: '180',  info: 'Rotate 180 degrees' },
                { label: '270',  value: '270',  info: 'Rotate 270 degrees' },
            ],
        });
        _unsubs.push(rotationRadio.on('select', ({ value }) => setValue('rotation', value)));

        _previewImg = qs('.mpi-tool-options-resize__preview-img', el);
        const spinnerHost = qs('#resize-preview-spinner', el);
        _previewSpinner = MpiSpinner.mount(spinnerHost, { size: 'sm' });
        _children.push(_previewSpinner);
        _previewSpinner.el.style.display = 'none';

        const applyBtn = mount('#resize-actions-slot', MpiButton, {
            icon: 'check', label: 'Apply', variant: 'primary', size: 'sm',
            info: 'Apply resize settings',
        });
        _unsubs.push(applyBtn.on('click', () => {
            cancelPreview();
            emit('apply', { params: params() });
        }));

        function syncConditionalRows() {
            const cropSlot = qs('#resize-crop-slot', el);
            const colorSlot = qs('#resize-color-slot', el);
            cropSlot.hidden = settings.keep_proportion !== 'crop';
            colorSlot.hidden = !PAD_COLOR_MODES.has(settings.keep_proportion);
        }

        function setPreviewBusy(on) {
            if (_previewSpinner?.el) _previewSpinner.el.style.display = on ? '' : 'none';
        }

        function cancelPreview() {
            clearTimeout(_previewTimer);
            _previewTimer = null;
            _previewAbort?.abort();
            _previewAbort = null;
            _previewExec?.cancel?.();
            _previewExec = null;
            setPreviewBusy(false);
        }

        function schedulePreview() {
            if (!_thumbDataUrl) return;
            clearTimeout(_previewTimer);
            _previewTimer = setTimeout(runPreview, 250);
        }

        async function _refreshThumbnail({ awaitNextLoad = false, syncDims = false } = {}) {
            const sourceEl = viewer?.el?.getSourceElement?.();
            if (!sourceEl) { _thumbDataUrl = null; return; }
            if (sourceEl instanceof HTMLVideoElement) {
                await waitForVideoFrame(sourceEl, { awaitNextLoad });
            }
            const thumb = extractThumbnail(sourceEl, THUMB_MAX_EDGE);
            if (!thumb) { _thumbDataUrl = null; return; }
            _thumbDataUrl = thumb.dataUrl;
            _thumbW = thumb.width;
            _thumbH = thumb.height;
            _sourceW = thumb.sourceWidth;
            _sourceH = thumb.sourceHeight;
            // Only seed dim inputs from source when in FREE mode — preset
            // families compute dims from ratio × multiplier.
            if (syncDims && settings.family === 'free' && _sourceW > 0 && _sourceH > 0) {
                _syncDimInputsToSource();
            }
            if (_previewImg) _previewImg.src = _thumbDataUrl;
        }

        function _syncDimInputsToSource() {
            const w = clampInt(_sourceW, settings.width);
            const h = clampInt(_sourceH, settings.height);
            settings = { ...settings, width: w, height: h };
            const wField = widthInput?.el ? qs('.mpi-input__field', widthInput.el) : null;
            const hField = heightInput?.el ? qs('.mpi-input__field', heightInput.el) : null;
            if (wField) wField.value = String(w);
            if (hField) hField.value = String(h);
            persist('width', w);
            persist('height', h);
            syncConditionalRows();
        }

        async function runPreview() {
            if (_destroyed || !_thumbDataUrl) return;

            _previewAbort?.abort();
            _previewExec?.cancel?.();
            const abort = new AbortController();
            const serial = ++_previewSerial;
            _previewAbort = abort;
            setPreviewBusy(true);

            const fullParams = params();
            const sourceLongest = Math.max(_sourceW, _sourceH);
            const thumbLongest  = Math.max(_thumbW, _thumbH);
            const previewParams = scaleParamsForThumb(fullParams, sourceLongest, thumbLongest);

            const exec = runCommand({
                operation: 'resize',
                modelId: null,
                positive: '',
                negative: '',
                mediaItems: [{ url: _thumbDataUrl, mediaType: 'image', source: 'thumbnail' }],
                injectionParams: previewParams,
                previewOnly: true,
                suppressLifecycleEvents: true,
            });
            _previewExec = exec;

            exec.onComplete = async (urls = []) => {
                if (_destroyed || abort.signal.aborted || serial !== _previewSerial) return;
                try {
                    const first = urls[0];
                    if (!first) throw new Error('Resize preview returned no output');
                    const res = await fetch(first, { signal: abort.signal });
                    if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`);
                    const blobUrl = URL.createObjectURL(await res.blob());
                    if (_destroyed || abort.signal.aborted || serial !== _previewSerial) {
                        URL.revokeObjectURL(blobUrl);
                        return;
                    }
                    if (_previewImg) {
                        const prev = _previewImg.src;
                        _previewImg.src = blobUrl;
                        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
                    }
                } catch (err) {
                    if (!abort.signal.aborted) {
                        clientLogger.warn('MpiToolOptionsResize', 'Resize preview failed', err);
                    }
                } finally {
                    if (serial === _previewSerial) {
                        _previewExec = null;
                        _previewAbort = null;
                        setPreviewBusy(false);
                    }
                }
            };

            exec.onError = (err) => {
                if (!abort.signal.aborted) {
                    clientLogger.warn('MpiToolOptionsResize', 'Resize preview failed', err);
                }
                if (serial === _previewSerial) {
                    _previewExec = null;
                    _previewAbort = null;
                    setPreviewBusy(false);
                }
            };
        }

        el.getParams = params;
        el.setCurrentItem = async (item) => {
            if (!item || item.id === currentItem?.id) return;
            currentItem = item;
            cancelPreview();
            await _refreshThumbnail({ awaitNextLoad: kind === 'video', syncDims: true });
            schedulePreview();
        };

        rebuildResolutionControls();
        syncConditionalRows();

        (async () => {
            await _refreshThumbnail({ syncDims: true });
            schedulePreview();
        })();

        el.destroy = () => {
            _destroyed = true;
            cancelPreview();
            _persistTimers.forEach(timer => clearTimeout(timer));
            _persistTimers.clear();
            if (_previewImg?.src?.startsWith('blob:')) {
                try { URL.revokeObjectURL(_previewImg.src); } catch (_) {}
            }
            _unsubs.forEach(fn => fn?.());
            _children.forEach(child => child.destroy?.());
        };
    },
});
