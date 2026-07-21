/**
 * MpiToolOptionsGif — Organism: tool-options panel for "Export GIF" (video only).
 *
 * Pure export, NOT a history operation. Controls: fps, size preset (both-axis
 * WxAUTO / AUTOxH), loop count. The active control-bar trim range is applied by
 * the parent block. "Generate preview" runs a real ffmpeg GIF encode
 * (POST /api/video/gif) to a temp file → shows the animated GIF inline + a real
 * file-size badge (accurate byte count, platform-limit aware). "Export" hands
 * the parent the encoded temp GIF url + filename to save via native Save-As
 * (`<a download>`); it reuses the last preview encode when settings are unchanged.
 *
 * Persists settings to project.json `toolSettings.exportGif`.
 *
 * Props:
 * @param {object} viewer - MpiVideoViewer instance (unused directly; kept for
 *                          registry-uniform mount signature)
 *
 * Emits:
 *   'apply' { url, fileName } — user pressed Export; parent triggers Save-As.
 *                               When absent (never previewed / stale), parent
 *                               encodes on demand from getExportParams().
 */

import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs } from '../../../utils/dom.js';

const SIZE_OPTIONS = [
    { value: 'original', label: 'Original' },
    { value: '480xauto', label: '480 × auto' },
    { value: '320xauto', label: '320 × auto' },
    { value: 'autox480', label: 'auto × 480' },
    { value: 'autox320', label: 'auto × 320' },
];
const SIZE_VALUES = new Set(SIZE_OPTIONS.map(o => o.value));

const DEFAULTS = Object.freeze({ fps: 10, sizePreset: 'original', loop: 0 });

const clampInt = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
};

function coerceSettings(raw) {
    return {
        fps: clampInt(raw.fps, DEFAULTS.fps, 1, 60),
        sizePreset: SIZE_VALUES.has(raw.sizePreset) ? raw.sizePreset : DEFAULTS.sizePreset,
        loop: clampInt(raw.loop, DEFAULTS.loop, 0, 999),
    };
}

function formatBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KiB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

export const MpiToolOptionsGif = ComponentFactory.create({
    name: 'MpiToolOptionsGif',
    css: ['js/components/Organisms/MpiToolOptionsGif/MpiToolOptionsGif.css'],

    template: () => `
        <div class="mpi-tool-options-gif">
            <div class="mpi-tool-options-gif__section">
                <div class="mpi-tool-options-gif__section-label">Settings</div>
                <div class="mpi-tool-options-gif__row" id="gif-fps-slot"></div>
                <div class="mpi-tool-options-gif__row" id="gif-size-slot"></div>
                <div class="mpi-tool-options-gif__row" id="gif-loop-slot"></div>
            </div>
            <div class="mpi-tool-options-gif__preview">
                <div class="mpi-tool-options-gif__preview-head">
                    <span class="mpi-tool-options-gif__preview-label">Preview</span>
                    <span class="mpi-tool-options-gif__badge" id="gif-badge" hidden></span>
                </div>
                <div class="mpi-tool-options-gif__preview-frame">
                    <img class="mpi-tool-options-gif__preview-img" id="gif-preview-img" alt="GIF preview" hidden />
                    <span class="mpi-tool-options-gif__preview-empty" id="gif-preview-empty">No preview yet</span>
                    <div class="mpi-tool-options-gif__preview-spinner" id="gif-preview-spinner"></div>
                </div>
                <div class="mpi-tool-options-gif__row" id="gif-refresh-slot"></div>
            </div>
            <div class="mpi-tool-options-gif__actions" id="gif-actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        let settings = coerceSettings(
            getToolSettings(state.currentProject || {}, 'exportGif', DEFAULTS)
        );

        const _children = [];
        const _unsubs = [];
        const _persistTimers = new Map();
        let _destroyed = false;
        let _busy = false;

        // Cache the last successful preview encode keyed by the settings that
        // produced it, so Export reuses it instead of re-encoding.
        let _lastEncode = null;      // { url, fileName }
        let _lastEncodeKey = '';

        const _img = qs('#gif-preview-img', el);
        const _empty = qs('#gif-preview-empty', el);
        const _badge = qs('#gif-badge', el);
        const _spinner = MpiSpinner.mount(qs('#gif-preview-spinner', el), { size: 'sm' });
        _children.push(_spinner);
        _spinner.el.style.display = 'none';

        const settingsKey = () => `${settings.fps}|${settings.sizePreset}|${settings.loop}`;

        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'exportGif', key, value });
                _persistTimers.delete(key);
            }, 250));
        };

        // Any settings change invalidates the cached preview → mark badge stale.
        const _markStale = () => {
            if (_lastEncode && _lastEncodeKey !== settingsKey()) {
                _badge.classList.add('mpi-tool-options-gif__badge--stale');
            }
        };

        const setValue = (key, value) => {
            settings = { ...settings, [key]: value };
            persist(key, value);
            _markStale();
        };

        // ── Controls ─────────────────────────────────────────────────────────
        const fpsInput = MpiInput.mount(qs('#gif-fps-slot', el), {
            type: 'number', label: 'Frame rate (fps)', value: settings.fps,
            min: 1, max: 60, step: 1, info: 'Output GIF frame rate',
        });
        _children.push(fpsInput);
        _unsubs.push(fpsInput.on('input',  ({ value }) => setValue('fps', clampInt(value, settings.fps, 1, 60))));
        _unsubs.push(fpsInput.on('change', ({ value }) => setValue('fps', clampInt(value, settings.fps, 1, 60))));

        const sizeDd = MpiDropdown.mount(qs('#gif-size-slot', el), {
            options: SIZE_OPTIONS, value: settings.sizePreset, direction: 'down',
            info: 'Output size — one axis fixed, the other auto (keeps aspect)',
        });
        _children.push(sizeDd);
        _unsubs.push(sizeDd.on('change', ({ value }) => setValue('sizePreset', value)));

        const loopInput = MpiInput.mount(qs('#gif-loop-slot', el), {
            type: 'number', label: 'Loop count', value: settings.loop,
            min: 0, max: 999, step: 1, info: 'Total plays; 0 = loop forever, 1 = play once',
        });
        _children.push(loopInput);
        _unsubs.push(loopInput.on('input',  ({ value }) => setValue('loop', clampInt(value, settings.loop, 0, 999))));
        _unsubs.push(loopInput.on('change', ({ value }) => setValue('loop', clampInt(value, settings.loop, 0, 999))));

        const refreshBtn = MpiButton.mount(qs('#gif-refresh-slot', el), {
            icon: 'refresh_stroke', label: 'Generate preview', size: 'sm', variant: 'secondary',
            info: 'Encode a preview GIF with the current settings',
        });
        _children.push(refreshBtn);
        _unsubs.push(refreshBtn.on('click', () => _runPreview()));

        const exportBtn = MpiButton.mount(qs('#gif-actions-slot', el), {
            icon: 'download', label: 'Export', size: 'sm', variant: 'primary',
            info: 'Save the GIF to disk',
        });
        _children.push(exportBtn);
        _unsubs.push(exportBtn.on('click', () => {
            // Reuse a fresh (non-stale) preview encode; otherwise let the parent
            // encode on demand from getExportParams().
            if (_lastEncode && _lastEncodeKey === settingsKey()) {
                emit('apply', { ..._lastEncode });
            } else {
                emit('apply', {});
            }
        }));

        function _setBusy(on) {
            _busy = on;
            _spinner.el.style.display = on ? '' : 'none';
            exportBtn.el.setDisabled?.(on);
            refreshBtn.el.setDisabled?.(on);
        }

        // The parent owns source resolution + trim; it injects the encoder via
        // el.setEncoder(fn). fn(params) → Promise<{ url, byteSize, fileName }>.
        let _encoder = null;
        el.setEncoder = (fn) => { _encoder = fn; };
        el.getExportParams = () => ({ ...settings });

        async function _runPreview() {
            if (_destroyed || _busy || !_encoder) return;
            _setBusy(true);
            const key = settingsKey();
            try {
                const result = await _encoder({ ...settings });
                if (_destroyed || !result?.url) return;
                _img.src = result.url;
                _img.hidden = false;
                _empty.hidden = true;
                _badge.textContent = formatBytes(result.byteSize);
                _badge.hidden = !result.byteSize;
                _badge.classList.remove('mpi-tool-options-gif__badge--stale');
                _lastEncode = { url: result.url, fileName: result.fileName };
                _lastEncodeKey = key;
            } catch (err) {
                if (!_destroyed) clientLogger.warn('MpiToolOptionsGif', 'GIF preview failed', err);
            } finally {
                if (!_destroyed) _setBusy(false);
            }
        }

        el.destroy = () => {
            _destroyed = true;
            _persistTimers.forEach(t => clearTimeout(t));
            _persistTimers.clear();
            _unsubs.forEach(fn => fn?.());
            _children.forEach(c => c.destroy?.());
        };
    },
});
