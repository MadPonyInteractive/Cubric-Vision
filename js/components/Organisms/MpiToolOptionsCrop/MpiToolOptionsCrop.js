/**
 * MpiToolOptionsCrop — Organism: tool-options panel for Crop mode.
 *
 * Self-contained: owns ratio selector + apply (+ snapshot for video).
 * Mounted by MpiGroupHistoryBlock mediator into #right-top-slot when
 * active tool = 'crop'. Enters/exits viewer crop mode in setup/destroy.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @param {'image'|'video'} kind - Determines which viewer API to call
 *
 * Emits:
 *   'apply'     { kind: 'image' | 'video-save' | 'video-snapshot', ratio? }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOptionSelector } from '../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { qs } from '../../../utils/dom.js';

export const MpiToolOptionsCrop = ComponentFactory.create({
    name: 'MpiToolOptionsCrop',
    css: ['js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css'],

    template: () => `
        <div class="mpi-tool-options-crop">
            <div class="mpi-tool-options-crop__ratio" id="ratio-slot"></div>
            <div class="mpi-tool-options-crop__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer, kind } = props;
        const isVideo = kind === 'video';

        // Enter viewer crop mode on mount
        if (isVideo) viewer.el.enterCropMode?.();
        else         viewer.el.enterMode?.('crop');

        // Ratio selector
        const ratioSel = MpiOptionSelector.mount(document.createElement('div'), {
            variant: 'ratio',
            modelType: 'social',
            value: SOCIAL_RATIOS[0].label,
        });
        qs('#ratio-slot', el).appendChild(ratioSel.el);
        ratioSel.on('change', ({ ratio }) => {
            viewer.el.setCropRatio?.(ratio);
        });

        // Actions
        const actionsSlot = qs('#actions-slot', el);
        const _children = [];

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
            ratioSel.destroy?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
