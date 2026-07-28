/**
 * MpiToolOptionsCrop — Organism: tool-options panel for Crop mode.
 *
 * Inline-only (no popups). Stacked sections:
 *   Resolution Type — MpiRadioGroup (ratio / free / resolution)
 *   Orientation     — MpiRadioGroup icon-only (portrait / landscape) [ratio only]
 *   Ratio           — horizontal ratio row (icon over label), [ratio only]
 *   Width / Height  — MpiInput pair, exact output pixels [resolution only]
 *   Fill            — MpiColorPicker for the pixels outside the source [image only]
 *   Divisible by    — MpiInput (default 16), above Apply [ratio + free]
 *
 * The ratio row is backed by CROP_RATIOS (pure aspect, no fixed resolutions):
 * the user drags a ratio-locked box and whatever pixels are selected become the
 * output. Divisible-by rounds those selected output pixels on apply.
 *
 * RESOLUTION (MPI-383) is the one family that RESAMPLES: the box seeds at
 * exactly width×height image px, stays locked to that ratio, and the crop is
 * scaled to the typed size on apply. RATIO and FREE never resample.
 *
 * The crop box may leave the image in every family; the fill colour is what
 * lands outside the source, and is the colour the user then asks an edit model
 * to paint over. Video crop cannot extend, so fill + resolution are image-only.
 *
 * Mounted by MpiGroupHistoryBlock into #right-top-slot when active tool = 'crop'.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @param {'image'|'video'} kind - Determines which viewer API to call
 *
 * Emits:
 *   'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiColorPicker } from '../../Primitives/MpiColorPicker/MpiColorPicker.js';
import { CROP_RATIOS } from '../../../utils/ratios.js';
import { qs } from '../../../utils/dom.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';

const DEFAULTS = Object.freeze({
    family:       'ratio',
    orientation:  'portrait',
    label:        '1:1',
    divisible_by: 16,
    res_w:        1920,
    res_h:        1080,
    // eslint-disable-next-line mpi/no-hardcoded-hex-color -- default fill for pixels outside the source
    fill_color:   '#000000',
});

const FAMILY_VALUES      = new Set(['ratio', 'free', 'resolution']);
const ORIENTATION_VALUES = new Set(['portrait', 'landscape']);

const clampInt = (value, fallback = 1) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
};

function coerceSettings(raw) {
    const family = FAMILY_VALUES.has(raw.family) ? raw.family : DEFAULTS.family;
    const orientation = ORIENTATION_VALUES.has(raw.orientation) ? raw.orientation : DEFAULTS.orientation;
    let label = String(raw.label ?? DEFAULTS.label);
    // Validate label exists in the active orientation's ratio list — else first.
    if (family === 'ratio') {
        const list = CROP_RATIOS[orientation] ?? CROP_RATIOS.portrait;
        if (!list.some(r => r.label === label)) label = list[0]?.label ?? DEFAULTS.label;
    }
    const divisible_by = clampInt(raw.divisible_by, DEFAULTS.divisible_by);
    const res_w = clampInt(raw.res_w, DEFAULTS.res_w);
    const res_h = clampInt(raw.res_h, DEFAULTS.res_h);
    const fill_color = typeof raw.fill_color === 'string' ? raw.fill_color : DEFAULTS.fill_color;
    return { family, orientation, label, divisible_by, res_w, res_h, fill_color };
}

const FAMILIES = [
    { label: 'RATIO',      value: 'ratio'      },
    { label: 'FREE',       value: 'free'       },
    { label: 'RESOLUTION', value: 'resolution' },
];

const ORIENTATIONS = [
    { label: 'Portrait',  value: 'portrait',  icon: 'ratio_9_16', info: 'Portrait orientation' },
    { label: 'Landscape', value: 'landscape', icon: 'ratio_16_9', info: 'Landscape orientation' },
];

/** Build radio options for ratio row — icon + label, label as value. */
function _ratioOptionsFor(orientation) {
    const list = CROP_RATIOS[orientation] ?? CROP_RATIOS.portrait;
    return list.map(r => ({
        label: r.label,
        value: r.label,
        icon:  r.icon.replace('rect_', 'ratio_'),
        info:  r.label,
    }));
}

/** Resolve numeric ratio float for an orientation/label. null = FREE. */
function _resolveRatio(family, orientation, label) {
    if (family === 'free') return null;
    const list = CROP_RATIOS[orientation] ?? CROP_RATIOS.portrait;
    const r = list.find(x => x.label === label) || list[0];
    return r.ratio;
}

export const MpiToolOptionsCrop = ComponentFactory.create({
    name: 'MpiToolOptionsCrop',
    css: ['js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css'],

    template: () => `
        <div class="mpi-tool-options-crop">
            <div class="mpi-tool-options-crop__section">
                <div class="mpi-tool-options-crop__section-label">Resolution Type</div>
                <div class="mpi-tool-options-crop__family" id="family-slot"></div>
            </div>
            <div class="mpi-tool-options-crop__section" id="orient-section">
                <div class="mpi-tool-options-crop__section-label">Orientation</div>
                <div class="mpi-tool-options-crop__orientation" id="orient-slot"></div>
            </div>
            <div class="mpi-tool-options-crop__section" id="ratios-section">
                <div class="mpi-tool-options-crop__section-label">Ratio</div>
                <div class="mpi-tool-options-crop__ratios" id="ratios-slot"></div>
            </div>
            <div class="mpi-tool-options-crop__section" id="res-section" hidden>
                <div class="mpi-tool-options-crop__section-label">Output Resolution</div>
                <div class="mpi-tool-options-crop__pair">
                    <div id="res-w-slot"></div>
                    <div id="res-h-slot"></div>
                </div>
            </div>
            <div class="mpi-tool-options-crop__section" id="fill-section">
                <div class="mpi-tool-options-crop__section-label">Fill Outside</div>
                <div class="mpi-tool-options-crop__fill" id="fill-slot"></div>
            </div>
            <div class="mpi-tool-options-crop__divisible" id="divisible-slot"></div>
            <div class="mpi-tool-options-crop__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer, kind } = props;
        const isVideo = kind === 'video';

        const _initial = coerceSettings(
            getToolSettings(state.currentProject || {}, 'crop', DEFAULTS)
        );
        let _family       = _initial.family;
        let _orientation  = _initial.orientation;
        let _label        = _initial.label;
        let _divisible_by = _initial.divisible_by;
        let _res_w        = _initial.res_w;
        let _res_h        = _initial.res_h;

        // Video crop cannot extend past the frame (ffmpeg crops, it does not
        // pad), so the exact-size family and the fill colour are image-only.
        if (isVideo && _family === 'resolution') _family = DEFAULTS.family;

        const _persistTimers = new Map();
        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey: 'crop', key, value });
                _persistTimers.delete(key);
            }, 200));
        };

        const familySlot   = qs('#family-slot',    el);
        const orientSlot   = qs('#orient-slot',    el);
        const orientSection = qs('#orient-section', el);
        const ratiosSlot   = qs('#ratios-slot',    el);
        const ratiosSection = qs('#ratios-section', el);
        const resSection   = qs('#res-section',    el);
        const fillSection  = qs('#fill-section',   el);
        const divisibleSlot = qs('#divisible-slot', el);
        const actionsSlot  = qs('#actions-slot',   el);

        if (isVideo) viewer.el.enterCropMode?.();
        else         viewer.el.enterMode?.('crop');

        const _children = [];

        // Family radio
        const familyRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: isVideo ? FAMILIES.filter(f => f.value !== 'resolution') : FAMILIES,
            value:   _family,
            name:    'crop-family',
            info:    'Aspect ratio family',
        });
        familySlot.appendChild(familyRadio.el);
        _children.push(familyRadio);

        // Orientation radio (only for ratio family)
        let orientRadio = null;
        let ratioRadio = null;

        const _mountOrientation = () => {
            if (orientRadio) { orientRadio.destroy?.(); orientRadio = null; orientSlot.innerHTML = ''; }
            const visible = _family === 'ratio';
            orientSection.style.display = visible ? '' : 'none';
            if (!visible) return;
            orientRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options: ORIENTATIONS,
                value:   _orientation,
                name:    'crop-orientation',
                iconOnly: true,
            });
            orientSlot.appendChild(orientRadio.el);
            orientRadio.on('select', ({ value }) => {
                const prevOrientation = _orientation;
                _orientation = value;
                // Mirror by index across orientations (lists are same length
                // + parallel: 1:1↔1:1, 3:4↔4:3, 4:5↔5:4, 5:8↔8:5, 9:16↔16:9).
                const prevList = _ratioOptionsFor(prevOrientation);
                const newList  = _ratioOptionsFor(_orientation);
                const idx = prevList.findIndex(o => o.value === _label);
                if (idx >= 0 && newList[idx]) _label = newList[idx].value;
                else if (!newList.some(o => o.value === _label)) _label = newList[0]?.value ?? _label;
                persist('orientation', _orientation);
                persist('label', _label);
                _mountRatios();
                _pushShape();
            });
        };

        const _mountRatios = () => {
            if (ratioRadio) { ratioRadio.destroy?.(); ratioRadio = null; ratiosSlot.innerHTML = ''; }
            const visible = _family === 'ratio';
            ratiosSection.style.display = visible ? '' : 'none';
            if (!visible) return;
            const opts = _ratioOptionsFor(_orientation);
            ratioRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options: opts,
                value:   _label,
                name:    'crop-ratio',
                labelPosition: 'top',
                size:    'lg',
                columns: 4,
                featuredFirst: true,
            });
            ratiosSlot.appendChild(ratioRadio.el);
            ratioRadio.on('select', ({ value }) => {
                _label = value;
                persist('label', _label);
                _pushShape();
            });
        };

        /**
         * Push the active family's box shape to the viewer. RESOLUTION seeds an
         * exact pixel box (which may hang off the image); the other two set a
         * ratio lock, or null for free.
         */
        const _pushShape = () => {
            if (_family === 'resolution' && !isVideo) {
                viewer.el.setCropSize?.(_res_w, _res_h);
                return;
            }
            viewer.el.setCropRatio?.(_resolveRatio(_family, _orientation, _label));
        };

        /** Sections that only belong to one family. */
        const _syncSections = () => {
            resSection.hidden  = _family !== 'resolution' || isVideo;
            fillSection.hidden = isVideo;
            // Divisible-by rounds the SELECTED pixels; in RESOLUTION mode the
            // typed size is the output, so there is nothing left to round.
            divisibleSlot.hidden = _family === 'resolution';
        };

        familyRadio.on('select', ({ value }) => {
            _family = value;
            // Only RATIO ↔ FREE. The ratio table is orientation-keyed, not
            // family-keyed, so _label stays valid across the flip; RATIO just
            // re-shows it, FREE hides it (kept for later restore). Fall back to
            // the first label only if it somehow drifted out of the list.
            if (_family === 'ratio') {
                const opts = _ratioOptionsFor(_orientation);
                if (!opts.some(o => o.value === _label)) _label = opts[0]?.value ?? _label;
            }
            persist('family', _family);
            persist('label', _label);
            _mountOrientation();
            _mountRatios();
            _syncSections();
            _pushShape();
        });

        _mountOrientation();
        _mountRatios();

        // ── Output resolution (RESOLUTION family only) ────────────────────────
        // Pushed on `change`, not `input`: typing "1920" would otherwise reseed
        // the box at 1, 19 and 192 on the way there.
        const resWInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', label: 'Width', value: _res_w, min: 1, step: 1,
            info: 'Exact output width in pixels',
        });
        qs('#res-w-slot', el).appendChild(resWInput.el);
        _children.push(resWInput);
        resWInput.on('change', ({ value }) => {
            _res_w = clampInt(value, _res_w);
            persist('res_w', _res_w);
            _pushShape();
        });

        const resHInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', label: 'Height', value: _res_h, min: 1, step: 1,
            info: 'Exact output height in pixels',
        });
        qs('#res-h-slot', el).appendChild(resHInput.el);
        _children.push(resHInput);
        resHInput.on('change', ({ value }) => {
            _res_h = clampInt(value, _res_h);
            persist('res_h', _res_h);
            _pushShape();
        });

        // ── Fill colour for pixels outside the source (image only) ────────────
        const fillPicker = MpiColorPicker.mount(document.createElement('div'), {
            value: _initial.fill_color,
            info:  'Fills anything the crop selects beyond the image',
        });
        qs('#fill-slot', el).appendChild(fillPicker.el);
        _children.push(fillPicker);
        fillPicker.on('change', ({ hex }) => persist('fill_color', hex));

        _syncSections();
        _pushShape();

        // ── Divisible-by input (ratio + free, above Apply) ────────────────────
        const divisibleInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', label: 'Divisible by', value: _divisible_by,
            min: 1, step: 1, info: 'Round output width & height to a multiple of this',
        });
        divisibleSlot.appendChild(divisibleInput.el);
        _children.push(divisibleInput);
        divisibleInput.on('input',  ({ value }) => { _divisible_by = clampInt(value, _divisible_by); persist('divisible_by', _divisible_by); });
        divisibleInput.on('change', ({ value }) => { _divisible_by = clampInt(value, _divisible_by); persist('divisible_by', _divisible_by); });

        // ── Actions ──────────────────────────────────────────────────────────
        if (isVideo) {
            const snapshotBtn = MpiButton.mount(document.createElement('div'), {
                icon: 'camera', label: 'Snapshot', variant: 'ghost', size: 'sm',
                info: 'Save current frame as image',
            });
            actionsSlot.appendChild(snapshotBtn.el);
            snapshotBtn.on('click', () => emit('apply', { kind: 'video-snapshot' }));
            _children.push(snapshotBtn);

            const saveBtn = MpiButton.mount(document.createElement('div'), {
                icon: 'check', label: 'Save', variant: 'primary', size: 'sm',
                info: 'Encode cropped region to new video',
            });
            actionsSlot.appendChild(saveBtn.el);
            saveBtn.on('click', () => emit('apply', { kind: 'video-save' }));
            _children.push(saveBtn);
        } else {
            const applyBtn = MpiButton.mount(document.createElement('div'), {
                icon: 'check', label: 'Apply', variant: 'primary', size: 'sm',
                info: 'Save crop as a new history entry',
            });
            actionsSlot.appendChild(applyBtn.el);
            applyBtn.on('click', () => emit('apply', { kind: 'image' }));
            _children.push(applyBtn);
        }

        // Exposed for the apply path (Phase 3): the divisible-by value to round
        // selected output pixels to.
        el.getDivisibleBy = () => _divisible_by;

        el.destroy = () => {
            if (isVideo) viewer.el.exitCropMode?.();
            else         viewer.el.exitMode?.();
            _persistTimers.forEach(timer => clearTimeout(timer));
            _persistTimers.clear();
            orientRadio?.destroy?.();
            ratioRadio?.destroy?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
