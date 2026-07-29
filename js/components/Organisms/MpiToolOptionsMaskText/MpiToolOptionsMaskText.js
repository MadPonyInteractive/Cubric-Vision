/**
 * MpiToolOptionsMaskText — Organism: the Text mask tool (MPI-384).
 *
 * Name the object and SAM3's open-vocabulary detector finds it. This is the
 * answer to what the Points tool fights with: thin, strappy subjects — a bikini,
 * a purse, a strap — where dots over-select and a face can need six of them.
 *
 * Owns only what is specific to this method: the name field and the count. The
 * run/commit row and the brush strip are shared components, and the chips are
 * the existing ones — a text run returns N objects, so it uses the detector's
 * normal detect-then-pick flow rather than the points tool's auto-pick-0.
 *
 * THE COUNT IS PART OF THE PROMPT. `_parse_prompts` in
 * comfy/text_encoders/sam3_clip.py reads `name:N` as that category's detection
 * cap; a bare category silently returns exactly ONE object. So the string handed
 * to the viewer is always stamped, per comma-separated category.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   enterMode('mask'), exitMode(), evaluateMask(), setMaskPointsMode(),
 *   setMaskTextMode(), setMaskTextPrompt()
 * No 'apply' emitted — the mask is canvas-resident; PromptBox drives operations.
 */

import { ComponentFactory }  from '../../factory.js';
import { MpiInput }          from '../../Primitives/MpiInput/MpiInput.js';
import { MpiMaskDetectRow }  from '../../Compounds/MpiMaskDetectRow/MpiMaskDetectRow.js';
import { MpiMaskStrip }      from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs }                from '../../../utils/dom.js';
import { Events }            from '../../../events.js';
import { state }             from '../../../state.js';
import { getToolSettings }   from '../../../data/projectModel.js';
import { stampDetectionCount } from '../../../utils/maskTextPrompt.js';

const DEFAULTS = { textPrompt: '', textCount: 1 };

export const MpiToolOptionsMaskText = ComponentFactory.create({
    name: 'MpiToolOptionsMaskText',
    css: ['js/components/Organisms/MpiToolOptionsMaskText/MpiToolOptionsMaskText.css'],

    template: () => `
        <div class="mpi-tool-options-mask-text">
            <p class="mpi-tool-options-mask-text__info">
                Name what to mask — <b>bikini</b>, <b>purse</b>, <b>head</b>. Set how
                many to find, then Detect and pick a result.
            </p>
            <div class="mpi-tool-options-mask-text__row">
                <div class="mpi-tool-options-mask-text__prompt" id="prompt-slot"></div>
                <div class="mpi-tool-options-mask-text__count"  id="count-slot"></div>
            </div>
            <div id="detect-row-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];

        viewer.el.enterMode?.('mask');
        // Entering Text from Points must give the right mouse button back.
        viewer.el.setMaskPointsMode?.(false);
        viewer.el.setMaskTextMode?.(true);

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, 'mask', DEFAULTS) };
        let _raw   = typeof settings.textPrompt === 'string' ? settings.textPrompt : '';
        let _count = Math.max(1, Math.round(Number(settings.textCount) || 1));

        const _push = () => viewer.el.setMaskTextPrompt?.(stampDetectionCount(_raw, _count));

        const promptInput = MpiInput.mount(qs('#prompt-slot', el), {
            type: 'text', value: _raw, placeholder: 'bikini, purse',
            info: 'What to mask. Separate several with commas.',
        });
        promptInput.on('input', ({ value }) => {
            _raw = value;
            _push();
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'textPrompt', value });
        });
        _children.push(promptInput);

        const countInput = MpiInput.mount(qs('#count-slot', el), {
            type: 'number', value: _count, min: 1, max: 20, step: 1, size: 'sm',
            info: 'How many of them to find',
        });
        countInput.on('change', ({ value }) => {
            _count = value;
            _push();
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'textCount', value });
        });
        _children.push(countInput);

        _push();

        _children.push(MpiMaskDetectRow.mount(qs('#detect-row-slot', el), { viewer }));
        // No brush pair (MPI-381): painting belongs to the Brush tool.
        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), { viewer, brush: false }));

        el.destroy = () => {
            viewer.el.setMaskTextMode?.(false);
            viewer.el.evaluateMask?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
