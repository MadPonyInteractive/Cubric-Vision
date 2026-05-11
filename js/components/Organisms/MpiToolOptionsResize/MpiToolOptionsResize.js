/**
 * MpiToolOptionsResize — Organism: resize / flip / rotate tool options.
 *
 * Image resize owns debounced live preview. Apply emits the full params object;
 * the parent block commits the result through generationService.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { runCommand } from '../../../services/commandExecutor.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs } from '../../../utils/dom.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';

const UPSCALE_METHODS = ['nearest', 'exact', 'bilinear', 'area', 'bicubic', 'lanczos', 'nvidia_rtx_vsr'];
const KEEP_PROPORTIONS = ['stretch', 'resize', 'pad', 'pad_edge', 'pad_edge_pixel', 'crop', 'pillarbox_blur', 'total_pixels'];
const CROP_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'];
const PAD_COLOR_MODES = new Set(['pad', 'pad_edge', 'pad_edge_pixel', 'pillarbox_blur']);

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

function defaultsForItem(item) {
    const dims = item?.pixelDimensions || {};
    return {
        width: clampInt(dims.w, 1024),
        height: clampInt(dims.h, 1024),
        upscale_method: 'lanczos',
        keep_proportion: 'crop',
        pad_color: { r: 0, g: 0, b: 0 },
        crop_position: 'center',
        divisible_by: 1,
        flip: 'none',
        rotation: 'none',
    };
}

function coerceSettings(settings, defaults) {
    return {
        width: clampInt(settings.width, defaults.width),
        height: clampInt(settings.height, defaults.height),
        upscale_method: UPSCALE_METHODS.includes(settings.upscale_method) ? settings.upscale_method : defaults.upscale_method,
        keep_proportion: KEEP_PROPORTIONS.includes(settings.keep_proportion) ? settings.keep_proportion : defaults.keep_proportion,
        pad_color: normalizeColor(settings.pad_color || defaults.pad_color),
        crop_position: CROP_POSITIONS.includes(settings.crop_position) ? settings.crop_position : defaults.crop_position,
        divisible_by: clampInt(settings.divisible_by, defaults.divisible_by),
        flip: ['none', 'x', 'y'].includes(settings.flip) ? settings.flip : defaults.flip,
        rotation: ['none', '90', '180', '270'].includes(String(settings.rotation)) ? String(settings.rotation) : defaults.rotation,
    };
}

export const MpiToolOptionsResize = ComponentFactory.create({
    name: 'MpiToolOptionsResize',
    css: ['js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.css'],

    template: () => `
        <div class="mpi-tool-options-resize">
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Size</div>
                <div class="mpi-tool-options-resize__pair">
                    <div id="resize-width-slot"></div>
                    <div id="resize-height-slot"></div>
                </div>
            </div>
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Method</div>
                <div class="mpi-tool-options-resize__row" id="resize-method-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-proportion-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-crop-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-color-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-divisible-slot"></div>
            </div>
            <div class="mpi-tool-options-resize__section">
                <div class="mpi-tool-options-resize__section-label">Transform</div>
                <div class="mpi-tool-options-resize__row" id="resize-flip-slot"></div>
                <div class="mpi-tool-options-resize__row" id="resize-rotation-slot"></div>
            </div>
            <div class="mpi-tool-options-resize__actions" id="resize-actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer, kind = 'image' } = props;
        let currentItem = props.currentItem ?? null;
        const defaults = defaultsForItem(currentItem);
        const hasPersistedResize = !!state.currentProject?.toolSettings?.resize;
        let settings = coerceSettings(
            getToolSettings(state.currentProject || {}, 'resize', defaults),
            defaults
        );
        const _children = [];
        const _unsubs = [];
        const _persistTimers = new Map();
        let _previewTimer = null;
        let _previewExec = null;
        let _previewAbort = null;
        let _previewSerial = 0;
        let _destroyed = false;
        let _lastPreviewUrl = null;
        let _lastPreviewParamsKey = null;
        let widthInput = null;
        let heightInput = null;

        if (kind === 'image' && !hasPersistedResize) {
            _unsubs.push(viewer.on?.('resize-source-ready', ({ width, height }) => {
                const nextWidth = clampInt(width, settings.width);
                const nextHeight = clampInt(height, settings.height);
                settings = { ...settings, width: nextWidth, height: nextHeight };
                qs('.mpi-input__field', widthInput?.el).value = String(nextWidth);
                qs('.mpi-input__field', heightInput?.el).value = String(nextHeight);
                Events.emit('settings:tool:update', { toolKey: 'resize', key: 'width', value: nextWidth });
                Events.emit('settings:tool:update', { toolKey: 'resize', key: 'height', value: nextHeight });
            }));
        }

        Events.emit('settings:tool:update', { toolKey: 'resize', key: 'width', value: settings.width });
        Events.emit('settings:tool:update', { toolKey: 'resize', key: 'height', value: settings.height });

        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'resize', key, value });
                _persistTimers.delete(key);
            }, 300));
        };

        const setValue = (key, value) => {
            settings = { ...settings, [key]: value };
            _lastPreviewUrl = null;
            _lastPreviewParamsKey = null;
            persist(key, value);
            syncConditionalRows();
            schedulePreview();
        };

        const params = () => ({
            ...settings,
            pad_color: { ...settings.pad_color },
        });

        const _paramsKey = (p) => JSON.stringify(p);

        const mount = (slotId, Component, componentProps) => {
            const host = qs(slotId, el);
            const inst = Component.mount(document.createElement('div'), componentProps);
            host.appendChild(inst.el);
            _children.push(inst);
            return inst;
        };

        widthInput = mount('#resize-width-slot', MpiInput, {
            type: 'number',
            label: 'Width',
            value: settings.width,
            min: 1,
            step: 1,
            info: 'Output width',
        });
        _unsubs.push(widthInput.on('input', ({ value }) => setValue('width', clampInt(value, settings.width))));
        _unsubs.push(widthInput.on('change', ({ value }) => setValue('width', clampInt(value, settings.width))));

        heightInput = mount('#resize-height-slot', MpiInput, {
            type: 'number',
            label: 'Height',
            value: settings.height,
            min: 1,
            step: 1,
            info: 'Output height',
        });
        _unsubs.push(heightInput.on('input', ({ value }) => setValue('height', clampInt(value, settings.height))));
        _unsubs.push(heightInput.on('change', ({ value }) => setValue('height', clampInt(value, settings.height))));

        const methodDd = mount('#resize-method-slot', MpiDropdown, {
            options: UPSCALE_METHODS.map(value => ({ value, label: labelize(value) })),
            value: settings.upscale_method,
            direction: 'up',
            info: 'Resize method',
            wrapLabels: true,
        });
        _unsubs.push(methodDd.on('change', ({ value }) => setValue('upscale_method', value)));

        const proportionDd = mount('#resize-proportion-slot', MpiDropdown, {
            options: KEEP_PROPORTIONS.map(value => ({ value, label: labelize(value) })),
            value: settings.keep_proportion,
            direction: 'up',
            info: 'How to preserve the source image proportions',
            wrapLabels: true,
        });
        _unsubs.push(proportionDd.on('change', ({ value }) => setValue('keep_proportion', value)));

        const cropDd = mount('#resize-crop-slot', MpiDropdown, {
            options: CROP_POSITIONS.map(value => ({ value, label: labelize(value) })),
            value: settings.crop_position,
            direction: 'up',
            info: 'Crop anchor position',
        });
        _unsubs.push(cropDd.on('change', ({ value }) => setValue('crop_position', value)));

        const colorPicker = mount('#resize-color-slot', MpiColorPicker, {
            value: settings.pad_color,
            info: 'Padding color',
        });
        _unsubs.push(colorPicker.on('change', ({ r, g, b }) => setValue('pad_color', { r, g, b })));

        const divisibleInput = mount('#resize-divisible-slot', MpiInput, {
            type: 'number',
            label: 'Divisible by',
            value: settings.divisible_by,
            min: 1,
            step: 1,
            info: 'Force dimensions to be divisible by this number',
        });
        _unsubs.push(divisibleInput.on('input', ({ value }) => setValue('divisible_by', clampInt(value, settings.divisible_by))));
        _unsubs.push(divisibleInput.on('change', ({ value }) => setValue('divisible_by', clampInt(value, settings.divisible_by))));

        const flipRadio = mount('#resize-flip-slot', MpiRadioGroup, {
            name: 'resize-flip',
            value: settings.flip,
            iconOnly: true,
            options: [
                { label: 'None', value: 'none', icon: 'close', info: 'No flip' },
                { label: 'Vertical', value: 'x', icon: 'flipY_stroke', info: 'Flip vertically' },
                { label: 'Horizontal', value: 'y', icon: 'flipX_stroke', info: 'Flip horizontally' },
            ],
        });
        _unsubs.push(flipRadio.on('select', ({ value }) => setValue('flip', value)));

        const rotationRadio = mount('#resize-rotation-slot', MpiRadioGroup, {
            name: 'resize-rotation',
            value: settings.rotation,
            options: [
                { label: 'None', value: 'none', info: 'No rotation' },
                { label: '90', value: '90', info: 'Rotate 90 degrees' },
                { label: '180', value: '180', info: 'Rotate 180 degrees' },
                { label: '270', value: '270', info: 'Rotate 270 degrees' },
            ],
        });
        _unsubs.push(rotationRadio.on('select', ({ value }) => setValue('rotation', value)));

        const applyBtn = mount('#resize-actions-slot', MpiButton, {
            icon: 'check',
            label: 'Apply',
            variant: 'primary',
            size: 'sm',
            info: 'Apply resize settings',
        });
        _unsubs.push(applyBtn.on('click', () => {
            const current = params();
            const previewUrl = _lastPreviewParamsKey === _paramsKey(current) ? _lastPreviewUrl : null;
            cancelPreview();
            emit('apply', { params: current, previewUrl });
        }));

        function syncConditionalRows() {
            const cropSlot = qs('#resize-crop-slot', el);
            const colorSlot = qs('#resize-color-slot', el);
            cropSlot.hidden = settings.keep_proportion !== 'crop';
            colorSlot.hidden = !PAD_COLOR_MODES.has(settings.keep_proportion);
        }

        function setPreviewing(on) {
            if (kind === 'image') viewer.el.setGenerating?.(on);
        }

        function cancelPreview() {
            clearTimeout(_previewTimer);
            _previewTimer = null;
            _previewAbort?.abort();
            _previewAbort = null;
            _previewExec?.cancel?.();
            _previewExec = null;
            setPreviewing(false);
        }

        function schedulePreview() {
            if (kind !== 'image') return;
            clearTimeout(_previewTimer);
            _previewTimer = setTimeout(runPreview, 250);
        }

        async function runPreview() {
            if (_destroyed || kind !== 'image') return;
            const sourceUrl = currentItem?.filePath ? resolveMediaUrl(currentItem.filePath) : null;
            if (!sourceUrl) return;

            _previewAbort?.abort();
            _previewExec?.cancel?.();
            const abort = new AbortController();
            const serial = ++_previewSerial;
            _previewAbort = abort;
            setPreviewing(true);

            const previewParams = params();
            const previewKey = _paramsKey(previewParams);

            const exec = runCommand({
                operation: 'resize',
                modelId: null,
                positive: '',
                negative: '',
                mediaItems: [{ id: currentItem.id, url: sourceUrl, mediaType: 'image', source: 'history' }],
                injectionParams: previewParams,
                previewOnly: true,
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
                    _lastPreviewUrl = first;
                    _lastPreviewParamsKey = previewKey;
                    await viewer.el.setResizePreview?.(blobUrl);
                } catch (err) {
                    if (!abort.signal.aborted) {
                        clientLogger.warn('MpiToolOptionsResize', 'Resize preview failed', err);
                    }
                } finally {
                    if (serial === _previewSerial) {
                        _previewExec = null;
                        _previewAbort = null;
                        setPreviewing(false);
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
                    setPreviewing(false);
                }
            };
        }

        el.getParams = params;
        el.setCurrentItem = (item) => {
            if (!item || item.id === currentItem?.id) return;
            currentItem = item;
            _lastPreviewUrl = null;
            _lastPreviewParamsKey = null;
            cancelPreview();
            viewer.el.clearResizePreview?.();
            schedulePreview();
        };

        syncConditionalRows();

        if (kind === 'video') viewer.el.enterResizeMode?.();
        else viewer.el.enterResizeMode?.();

        // Kick off an initial preview so the user sees the tool's effect on the
        // active entry without touching any control first.
        if (kind === 'image' && currentItem?.filePath) schedulePreview();

        el.destroy = () => {
            _destroyed = true;
            cancelPreview();
            _persistTimers.forEach(timer => clearTimeout(timer));
            _persistTimers.clear();
            if (kind === 'video') viewer.el.exitResizeMode?.();
            else viewer.el.exitResizeMode?.();
            _unsubs.forEach(fn => fn?.());
            _children.forEach(child => child.destroy?.());
        };
    },
});
