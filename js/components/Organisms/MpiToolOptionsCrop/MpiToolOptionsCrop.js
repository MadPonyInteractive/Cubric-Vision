/**
 * MpiToolOptionsCrop — Organism: tool-options panel for Crop mode.
 *
 * Self-contained: owns family dropdown + orientation + ratio picker + apply
 * (+ snapshot for video). Mounted by MpiGroupHistoryBlock mediator into
 * #right-top-slot when active tool = 'crop'. Enters/exits viewer crop mode
 * in setup/destroy.
 *
 * Family options:
 *   SDXL / FLUX  — orientation toggle + ratio icons (w,h derived)
 *   SOCIAL       — flat ratio icons
 *   FREE         — no ratio controls; viewer crop is unconstrained
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @param {'image'|'video'} kind - Determines which viewer API to call
 *
 * Emits:
 *   'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { getModelRatios, SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { qs } from '../../../utils/dom.js';

const FAMILIES = [
    { label: 'SDXL',   value: 'sdxl'   },
    { label: 'FLUX',   value: 'flux'   },
    { label: 'SOCIAL', value: 'social' },
    { label: 'FREE',   value: 'free'   },
];

const ORIENTATIONS = [
    { label: 'Portrait',  value: 'portrait',  icon: 'ratio_9_16', info: 'Portrait orientation' },
    { label: 'Landscape', value: 'landscape', icon: 'ratio_16_9', info: 'Landscape orientation' },
];

/** Build radio options for a family + orientation. icon-only with per-option info. */
function _ratiosToOptions(family, orientation) {
    if (family === 'social') {
        return SOCIAL_RATIOS.map(r => ({
            label: r.label,
            value: r.label,
            icon:  r.icon.replace('rect_', 'ratio_'),
            info:  `Ratio ${r.label}`,
        }));
    }
    const list = getModelRatios(family, orientation);
    return list.map(r => ({
        label: r.label,
        value: r.label,
        icon:  r.icon.replace('rect_', 'ratio_'),
        info:  `Ratio ${r.label} (${r.w}×${r.h})`,
    }));
}

/** Resolve numeric ratio float for a family/orientation/label. null = FREE. */
function _resolveRatio(family, orientation, label) {
    if (family === 'free') return null;
    if (family === 'social') {
        const r = SOCIAL_RATIOS.find(x => x.label === label) || SOCIAL_RATIOS[0];
        return r.ratio;
    }
    const list = getModelRatios(family, orientation);
    const r = list.find(x => x.label === label) || list[0];
    return r.w / r.h;
}

export const MpiToolOptionsCrop = ComponentFactory.create({
    name: 'MpiToolOptionsCrop',
    css: ['js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css'],

    template: () => `
        <div class="mpi-tool-options-crop">
            <div class="mpi-tool-options-crop__family"      id="family-slot"></div>
            <div class="mpi-tool-options-crop__orientation" id="orient-slot"></div>
            <div class="mpi-tool-options-crop__ratios"      id="ratios-slot"></div>
            <div class="mpi-tool-options-crop__actions"     id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer, kind } = props;
        const isVideo = kind === 'video';

        // Local state
        let _family      = 'free';
        let _orientation = 'portrait';
        let _label       = SOCIAL_RATIOS[0].label;

        const familySlot  = qs('#family-slot',  el);
        const orientSlot  = qs('#orient-slot',  el);
        const ratiosSlot  = qs('#ratios-slot',  el);
        const actionsSlot = qs('#actions-slot', el);

        // Enter viewer crop mode on mount
        if (isVideo) viewer.el.enterCropMode?.();
        else         viewer.el.enterMode?.('crop');

        // Push initial ratio so canvas overlay matches selector on first render
        viewer.el.setCropRatio?.(_resolveRatio(_family, _orientation, _label));

        // ── Children ─────────────────────────────────────────────────────────
        const _children = [];

        // Family dropdown
        const familyDD = MpiDropdown.mount(document.createElement('div'), {
            options: FAMILIES,
            value:   _family,
            info:    'Aspect ratio family',
        });
        familySlot.appendChild(familyDD.el);
        _children.push(familyDD);

        // Orientation radio (only used by sdxl/flux)
        let orientRadio = null;
        // Ratio radio (icon-only)
        let ratioRadio = null;

        const _mountOrientation = () => {
            if (orientRadio) { orientRadio.destroy?.(); orientRadio = null; orientSlot.innerHTML = ''; }
            if (_family !== 'sdxl' && _family !== 'flux') return;
            orientRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options: ORIENTATIONS,
                value:   _orientation,
                name:    'orientation',
                iconOnly: true,
            });
            orientSlot.appendChild(orientRadio.el);
            orientRadio.on('select', ({ value }) => {
                _orientation = value;
                // Keep current label if exists in new orientation, else first
                const opts = _ratiosToOptions(_family, _orientation);
                if (!opts.some(o => o.value === _label)) _label = opts[0].value;
                _mountRatios();
                _pushRatio();
            });
        };

        const _mountRatios = () => {
            if (ratioRadio) { ratioRadio.destroy?.(); ratioRadio = null; ratiosSlot.innerHTML = ''; }
            if (_family === 'free') return;
            const opts = _ratiosToOptions(_family, _orientation);
            ratioRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options:  opts,
                value:    _label,
                name:     'ratio',
                iconOnly: true,
            });
            ratiosSlot.appendChild(ratioRadio.el);
            ratioRadio.on('select', ({ value }) => {
                _label = value;
                _pushRatio();
            });
        };

        const _pushRatio = () => {
            viewer.el.setCropRatio?.(_resolveRatio(_family, _orientation, _label));
        };

        familyDD.on('change', ({ value }) => {
            _family = value;
            if (_family === 'social') _label = SOCIAL_RATIOS[0].label;
            else if (_family === 'sdxl' || _family === 'flux') {
                const opts = _ratiosToOptions(_family, _orientation);
                _label = opts[0].value;
            }
            _mountOrientation();
            _mountRatios();
            _pushRatio();
        });

        _mountOrientation();
        _mountRatios();

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

        el.destroy = () => {
            if (isVideo) viewer.el.exitCropMode?.();
            else         viewer.el.exitMode?.();
            orientRadio?.destroy?.();
            ratioRadio?.destroy?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
