/**
 * MpiToolOptionsManualMask — Organism: tool-options panel for Manual Mask mode.
 *
 * Self-contained: brush/eraser radio + clear + invert + apply.
 * Enters canvas viewer mask mode in setup; exits in destroy.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires (exposed by MpiCanvasViewer in sub-commit 3):
 *   viewer.el.enterMode('mask') / exitMode()
 *   viewer.el.setMaskBrushMode('brush'|'eraser')
 *   viewer.el.clearMask()
 *   viewer.el.invertMask()
 *
 * Emits:
 *   'apply' {} — user pressed Apply; Block handler reads getCurrentMaskDataURL
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';

export const MpiToolOptionsManualMask = ComponentFactory.create({
    name: 'MpiToolOptionsManualMask',
    css: ['js/components/Organisms/MpiToolOptionsManualMask/MpiToolOptionsManualMask.css'],

    template: () => `
        <div class="mpi-tool-options-manual-mask">
            <div class="mpi-tool-options-manual-mask__row" id="tools-slot"></div>
            <div class="mpi-tool-options-manual-mask__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;

        viewer.el.enterMode?.('mask');

        const toolsSlot   = qs('#tools-slot',   el);
        const actionsSlot = qs('#actions-slot', el);
        const _children   = [];

        const brushBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'brush', size: 'sm', variant: 'ghost', info: 'Paint mask (B)',
            toggleable: true, active: true,
        });
        const eraserBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'eraser', size: 'sm', variant: 'ghost', info: 'Erase mask (E)',
            toggleable: true, active: false,
        });
        toolsSlot.appendChild(brushBtn.el);
        toolsSlot.appendChild(eraserBtn.el);

        brushBtn.on('click', () => {
            brushBtn.el.setActive(true);
            eraserBtn.el.setActive(false);
            viewer.el.setMaskBrushMode?.('brush');
        });
        eraserBtn.on('click', () => {
            eraserBtn.el.setActive(true);
            brushBtn.el.setActive(false);
            viewer.el.setMaskBrushMode?.('eraser');
        });

        const clearBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash', size: 'sm', variant: 'ghost', info: 'Clear mask',
        });
        const invertBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'invert', size: 'sm', variant: 'ghost', info: 'Invert mask',
        });
        actionsSlot.appendChild(clearBtn.el);
        actionsSlot.appendChild(invertBtn.el);

        clearBtn.on('click', () => viewer.el.clearMask?.());
        invertBtn.on('click', () => viewer.el.invertMask?.());

        _children.push(brushBtn, eraserBtn, clearBtn, invertBtn);

        // No Apply button. Mask compounds only create a mask; the PromptBox is
        // the single place where the user picks what operation to run with it.
        // On destroy (tool switch) we evaluate the mask so the Block's
        // _canvasHasMask flag is current before the PromptBox reappears.
        el.destroy = () => {
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
