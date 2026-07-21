import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { qs } from '../../../utils/dom.js';

const PARTS = [
    { key: 'prompt', label: 'Use Prompt' },
    { key: 'settings', label: 'Use Settings' },
    { key: 'model', label: 'Use Model' },
    { key: 'images', label: 'Use Images' },
    { key: 'video', label: 'Use Video' },
    { key: 'audio', label: 'Use Audio' },
];

// Media parts gated per-source by an availability prop (MPI-227). Each maps its
// includes key to the `*Availability` prop the mount site passes.
const MEDIA_PARTS = [
    { key: 'images', availabilityProp: 'imageAvailability' },
    { key: 'video', availabilityProp: 'videoAvailability' },
    { key: 'audio', availabilityProp: 'audioAvailability' },
];

function _normalizeIncludes(value = {}) {
    return {
        prompt: value.prompt !== false,
        settings: value.settings !== false,
        model: value.model !== false,
        images: value.images !== false,
        video: value.video !== false,
        audio: value.audio !== false,
    };
}

export const MpiReusePromptDialog = ComponentFactory.create({
    name: 'MpiReusePromptDialog',
    css: ['js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.css'],

    template: () => `
        <div class="mpi-reuse-prompt-dialog" role="dialog" aria-modal="true">
            <div class="mpi-reuse-prompt-dialog__head">
                <h3 class="mpi-reuse-prompt-dialog__title">Reuse Prompt</h3>
            </div>
            <div class="mpi-reuse-prompt-dialog__bar" id="reuse-source-section">
                <div class="mpi-reuse-prompt-dialog__bulk" id="reuse-bulk-slot"></div>
                <div id="reuse-source-slot"></div>
            </div>
            <div class="mpi-reuse-prompt-dialog__list" id="reuse-parts-slot"></div>
            <div class="mpi-reuse-prompt-dialog__foot" id="reuse-actions-slot"></div>
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
        const bulkSlot = qs('#reuse-bulk-slot', el);
        const sourceSlot = qs('#reuse-source-slot', el);
        const actionsSlot = qs('#reuse-actions-slot', el);

        // Per-source availability for each media part (MPI-212 → MPI-227): does the
        // reuse source actually carry an image / video / audio input to reuse? A card
        // generated WITHOUT one (e.g. a t2i output has no image; an image op has no
        // video/audio) has none, so that "Use …" toggle is meaningless — greying it
        // out (vs silently no-op-ing) tells the user why and stops it injecting an
        // empty slot. Keep each media checkbox so the source radio can re-toggle its
        // disabled state live.
        const availabilityMaps = {};
        for (const { key, availabilityProp } of MEDIA_PARTS) {
            availabilityMaps[key] = props[availabilityProp] || {};
        }
        const mediaToggles = {};
        const allToggles = {};

        const _persistIncludes = () => {
            state.promptReuseOptions = {
                ...(state.promptReuseOptions || {}),
                ask: state.promptReuseOptions?.ask === true,
                ...includes,
            };
        };

        // Per-row ON / OFF / NONE state word (pinned right). NONE = the part isn't
        // available for this source; otherwise reflects the toggle. Design element,
        // not just feedback — the row balances label-left / state-right.
        const stateWords = {};
        const _isUnavailable = (key) =>
            key in availabilityMaps && availabilityMaps[key][source] === false;
        const _syncRowStates = () => {
            for (const { key } of PARTS) {
                const span = stateWords[key];
                if (!span) continue;
                span.textContent = _isUnavailable(key) ? 'none' : (includes[key] ? 'on' : 'off');
            }
        };

        // Each part is a toggleable MpiButton (icon mode). Off shows a hollow circle,
        // on swaps to a check (iconActive) over the heat fill — check only on the
        // selected rows. Row wrapper carries the state word + full-width surface + dim.
        PARTS.forEach(({ key, label }) => {
            const row = document.createElement('div');
            row.className = 'mpi-reuse-prompt-dialog__row';
            const toggle = MpiButton.mount(document.createElement('div'), {
                icon: 'circle',
                iconActive: 'check',
                label,
                labelPosition: 'right',
                active: includes[key] === true,
                size: 'md',
                variant: 'secondary',
                extraClasses: 'mpi-reuse-prompt-dialog__toggle',
            });
            const stateWord = document.createElement('span');
            stateWord.className = 'mpi-reuse-prompt-dialog__state';
            toggle.on('toggle', ({ active }) => {
                includes[key] = active === true;
                _persistIncludes();
                _syncRowStates();
            });
            row.appendChild(toggle.el);
            row.appendChild(stateWord);
            partsSlot.appendChild(row);
            allToggles[key] = toggle;
            stateWords[key] = stateWord;
            if (key in availabilityMaps) mediaToggles[key] = toggle;
        });

        // All / None. Respects the per-source availability gate — a media part with
        // no input for the active source stays off. Both persist to state.
        const _setAll = (on) => {
            PARTS.forEach(({ key }) => {
                // Skip media parts unavailable for the active source — mirrors the
                // gate in _syncMediaAvailability so Apply never injects an empty slot.
                if (on && key in availabilityMaps
                    && availabilityMaps[key][source] === false) return;
                includes[key] = on;
                allToggles[key].el.setActive?.(on);
            });
            _persistIncludes();
            _syncRowStates();
        };
        const selectBtn = MpiButton.mount(document.createElement('div'), {
            text: 'All', variant: 'ghost', size: 'sm',
        });
        selectBtn.on('click', () => _setAll(true));
        bulkSlot.appendChild(selectBtn.el);
        const clearBtn = MpiButton.mount(document.createElement('div'), {
            text: 'None', variant: 'ghost', size: 'sm',
        });
        clearBtn.on('click', () => _setAll(false));
        bulkSlot.appendChild(clearBtn.el);

        // Disable + turn off a media toggle when the active source lacks that media.
        // `includes[key]` (the applied value) is forced false so Apply doesn't try to
        // inject nothing. The user's STORED default is left untouched — this is a
        // per-source availability gate, not a preference change.
        const _syncMediaAvailability = () => {
            for (const { key } of MEDIA_PARTS) {
                const toggle = mediaToggles[key];
                if (!toggle) continue;
                const has = availabilityMaps[key][source] !== false;
                toggle.el.setDisabled?.(!has);
                toggle.el.parentElement?.classList.toggle('mpi-reuse-prompt-dialog__row--off', !has);
                if (!has) {
                    includes[key] = false;
                    toggle.el.setActive?.(false);
                }
            }
        };
        _syncMediaAvailability();
        _syncRowStates();

        // Only the source picker hides when showSource===false — the bulk buttons
        // share the bar and must stay. Push bulk to the right so it doesn't look
        // orphaned once the source picker is gone.
        if (props.showSource === false) {
            sourceSlot.style.display = 'none';
            bulkSlot.style.marginLeft = 'auto';
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
                // Current may not, or vice-versa) — re-gate all media on switch.
                _syncMediaAvailability();
                _syncRowStates();
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

        // Emit apply with the chosen destination. dest: 'promptbox' honors the
        // checkboxes; 'app' reopens the App card (checkboxes ignored downstream).
        const _apply = (dest) => {
            emit('apply', { includes: { ...includes }, source, dest });
            el.hide();
        };

        if (props.isAppCard === true) {
            // App cards (MPI-263): two same-color Apply buttons — no destination
            // selector, one click each.
            const toPromptBtn = MpiButton.mount(document.createElement('div'), {
                text: 'Prompt Box',
                variant: 'primary',
                size: 'md',
            });
            toPromptBtn.on('click', () => _apply('promptbox'));
            actionsSlot.appendChild(toPromptBtn.el);

            const toAppBtn = MpiButton.mount(document.createElement('div'), {
                text: 'App',
                variant: 'primary',
                size: 'md',
            });
            toAppBtn.on('click', () => _apply('app'));
            modal.on('confirm', () => _apply('app'));
            actionsSlot.appendChild(toAppBtn.el);
        } else {
            const okBtn = MpiButton.mount(document.createElement('div'), {
                text: 'Apply',
                variant: 'primary',
                size: 'md',
            });
            okBtn.on('click', () => _apply('promptbox'));
            modal.on('confirm', () => _apply('promptbox'));
            actionsSlot.appendChild(okBtn.el);
        }

        el.destroy = () => {
            modal.el.hide?.();
            modal.el.destroy?.();
        };
    },
});
