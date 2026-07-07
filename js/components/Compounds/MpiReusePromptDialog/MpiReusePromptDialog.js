import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiCheckbox } from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { qs } from '../../../utils/dom.js';

const PARTS = [
    { key: 'prompt', label: 'Use Prompt' },
    { key: 'settings', label: 'Use Settings' },
    { key: 'model', label: 'Use Model' },
    { key: 'images', label: 'Use Images' },
];

function _normalizeIncludes(value = {}) {
    return {
        prompt: value.prompt !== false,
        settings: value.settings !== false,
        model: value.model !== false,
        images: value.images !== false,
    };
}

export const MpiReusePromptDialog = ComponentFactory.create({
    name: 'MpiReusePromptDialog',
    css: ['js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.css'],

    template: () => `
        <div class="mpi-reuse-prompt-dialog" role="dialog" aria-modal="true">
            <div class="mpi-reuse-prompt-dialog__body">
                <h3 class="mpi-reuse-prompt-dialog__title">Reuse Prompt</h3>
                <div class="mpi-reuse-prompt-dialog__section">
                    <div class="mpi-reuse-prompt-dialog__label">Use</div>
                    <div class="mpi-reuse-prompt-dialog__checks" id="reuse-parts-slot"></div>
                </div>
                <div class="mpi-reuse-prompt-dialog__section" id="reuse-source-section">
                    <div class="mpi-reuse-prompt-dialog__label">From</div>
                    <div id="reuse-source-slot"></div>
                </div>
            </div>
            <div class="mpi-reuse-prompt-dialog__actions" id="reuse-actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(420px, 92vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        const stored = state.promptReuseOptions || {};
        const includes = _normalizeIncludes(props.includes || stored);
        let source = props.source || state.promptReuseSource;
        source = source === 'current' ? 'current' : 'original';
        const partsSlot = qs('#reuse-parts-slot', el);
        const sourceSection = qs('#reuse-source-section', el);
        const sourceSlot = qs('#reuse-source-slot', el);
        const actionsSlot = qs('#reuse-actions-slot', el);

        // Per-source flag: does the reuse source actually carry an input image to
        // reuse? A card generated WITHOUT one (e.g. a t2i output) has none, so
        // "Use Images" is meaningless — greying it out (vs silently no-op-ing)
        // tells the user why and stops it injecting an empty slot (MPI-212).
        const imageAvailability = props.imageAvailability || {};
        const _sourceHasImages = () => imageAvailability[source] !== false;

        // Keep the Use Images checkbox so the source radio can re-toggle its
        // disabled state live.
        let imagesCheckbox = null;

        PARTS.forEach(({ key, label }) => {
            const wrap = document.createElement('div');
            const checkbox = MpiCheckbox.mount(wrap, {
                label,
                checked: includes[key] === true,
                name: `reuse-${key}`,
            });
            checkbox.on('change', ({ checked }) => {
                includes[key] = checked === true;
                state.promptReuseOptions = {
                    ...(state.promptReuseOptions || {}),
                    ask: state.promptReuseOptions?.ask === true,
                    ...includes,
                };
            });
            partsSlot.appendChild(checkbox.el);
            if (key === 'images') imagesCheckbox = checkbox;
        });

        // Disable + uncheck Use Images when the active source has no reusable image.
        // `includes.images` (the applied value) is forced false so Apply doesn't try
        // to inject nothing. The user's STORED default is left untouched — this is a
        // per-source availability gate, not a preference change.
        const _syncImagesAvailability = () => {
            if (!imagesCheckbox) return;
            const has = _sourceHasImages();
            imagesCheckbox.el.setDisabled?.(!has);
            if (!has) {
                includes.images = false;
                imagesCheckbox.el.setChecked?.(false);
            }
        };
        _syncImagesAvailability();

        if (props.showSource === false) {
            sourceSection.style.display = 'none';
        } else {
            const sourceRadio = MpiRadioGroup.mount(sourceSlot, {
                name: 'reuse-source',
                value: source,
                size: 'sm',
                options: [
                    { label: 'Original', value: 'original' },
                    { label: 'Current', value: 'current' },
                ],
            });
            sourceRadio.on('select', ({ value }) => {
                source = value === 'current' ? 'current' : 'original';
                state.promptReuseSource = source;
                // Availability is per-source (Original may have an input image,
                // Current may not, or vice-versa) — re-gate on switch.
                _syncImagesAvailability();
            });
        }

        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel',
            variant: 'secondary',
            size: 'md',
        });
        cancelBtn.on('click', () => {
            emit('cancel', {});
            el.hide();
        });
        actionsSlot.appendChild(cancelBtn.el);

        const okBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Apply',
            variant: 'primary',
            size: 'md',
        });
        const _confirm = () => {
            emit('apply', { includes: { ...includes }, source });
            el.hide();
        };
        okBtn.on('click', _confirm);
        modal.on('confirm', _confirm);
        actionsSlot.appendChild(okBtn.el);

        el.destroy = () => {
            modal.el.hide?.();
            modal.el.destroy?.();
        };
    },
});
