import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { enhance as enhanceLocally } from '../../../services/llmService.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiEnhanceDialog — the Enhance overlay (MPI-677 step 1c).
 *
 * SHORT PROMPT ABOVE, ENHANCE, THE ENHANCED TEXT EDITABLE BELOW, OK / CANCEL
 * (Fabio, 2026-09-08). Before this, Enhance wrote its result straight back over
 * the user's own words in the prompt box — first over the broker, then, in step
 * 1b, locally. Either way the short prompt was gone the moment the button
 * answered, so a second press enhanced an enhancement.
 *
 * THE ITERATION LOOP IS THE POINT, and it is what makes the two boxes separate
 * rather than one box that grows: Enhance always reads the UPPER box, so editing
 * the short prompt and pressing Enhance again re-runs the recipe on the user's
 * words. Nothing in here can feed an enhanced text back into the enhancer.
 *
 * THE LOWER HALF MIRRORS THE MODEL'S FIELDS. `sdxl`, `pony`, `illustrious` and
 * `kling-3.0` declare `negativeHandling: 'separate-field'` and answer with one
 * labelled blob; `llmService.splitLabelledPrompt` cuts it, and the negative half
 * gets its OWN box here. That box appears only when a negative actually exists,
 * so a prose recipe's overlay stays a single field. The user sees which channel
 * each half lands in and approves it — deliberately not something the control
 * does behind them, which is why step 1b left the blob alone and recorded it.
 *
 * AN EMPTY LOWER BOX ON OK MEANS "RUN MY WORDS RAW" — the rule Character Sheet
 * already states in its own help text. Clearing it is how a user backs out of an
 * enhancement without backing out of their prompt.
 *
 * NO ENTER-TO-CONFIRM, deliberately. `MpiModal` binds `modal.confirm` with
 * `allowWhileTyping: true`, so a dialog that listens for it turns the newline key
 * of a multi-line editor into OK. This one never subscribes to `confirm`.
 *
 * PROVENANCE BELONGS TO THE TEXT, NOT TO THE RUN (Fabio, 2026-09-11). The note
 * line is emitted on apply and restored on reopen, because it is the only place
 * the FALLBACK WARNING is ever shown: when a model's key matches no recipe, the
 * pinned fallback answers anyway, and the warning is what says so. It used to be
 * written by `_run()` alone, so reopening an approved enhancement showed the text
 * with a blank note — the enhancement kept, the statement of where it came from
 * dropped. Only a SUCCESSFUL run updates it; a failed re-run leaves the previous
 * text standing, so the previous text's provenance must stand with it.
 *
 * Props:
 * @param {string}  [prompt='']     the user's short prompt, pre-filled into the upper box
 * @param {object}  [model]         the model card — picks the recipe and the backend
 * @param {{positive?: string, negative?: string, note?: {text: string, kind: string}}} [enhanced]
 *                                  an existing enhancement to reopen on, restored into
 *                                  the lower boxes so OK / Cancel are non-destructive.
 *                                  `note` is the provenance line the run that produced
 *                                  `positive` displayed
 *
 * Emits:
 *   'apply'  { shortPrompt, positive, negative, note }  — `positive` empty means "run raw"
 *   'cancel' {}
 *
 * Instance methods (on instance.el): show(), hide()
 */
export const MpiEnhanceDialog = ComponentFactory.create({
    name: 'MpiEnhanceDialog',
    css: ['js/components/Compounds/MpiEnhanceDialog/MpiEnhanceDialog.css'],

    template: () => `
        <div class="mpi-enhance-dialog" role="dialog" aria-modal="true">
            <div class="mpi-enhance-dialog__head">
                <h3 class="mpi-enhance-dialog__title">Enhance Prompt</h3>
            </div>
            <div class="mpi-enhance-dialog__body">
                <div id="enhance-short-slot"></div>
                <div class="mpi-enhance-dialog__bar">
                    <span class="mpi-enhance-dialog__note" id="enhance-note"></span>
                    <div id="enhance-run-slot"></div>
                </div>
                <div id="enhance-positive-slot"></div>
                <div class="hide" id="enhance-negative-slot"></div>
            </div>
            <div class="mpi-enhance-dialog__foot" id="enhance-actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(720px, 94vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        let shortText = String(props.prompt || '');
        let posText   = String(props.enhanced?.positive || '');
        let negText   = String(props.enhanced?.negative || '');
        let busy      = false;
        // The provenance of `posText`, carried in and back out. Null until a run
        // succeeds; a transient error (empty prompt, engine unreachable) never
        // touches it, because it describes the text, not the last button press.
        let lastNote  = props.enhanced?.note || null;

        const noteEl    = qs('#enhance-note', el);
        const negSlotEl = qs('#enhance-negative-slot', el);

        const shortInput = MpiInput.mount(qs('#enhance-short-slot', el), {
            type: 'textarea',
            label: 'Your prompt',
            value: shortText,
            placeholder: 'Type your prompt...',
            autoHeight: true,
        });
        shortInput.on('input', ({ value }) => { shortText = value; });

        const posInput = MpiInput.mount(qs('#enhance-positive-slot', el), {
            type: 'textarea',
            label: 'Enhanced prompt',
            value: posText,
            placeholder: 'Press Enhance, then edit the result here. Leave it empty to run your own words.',
        });
        posInput.on('input', ({ value }) => { posText = value; });

        const negInput = MpiInput.mount(negSlotEl, {
            type: 'textarea',
            label: 'Enhanced negative prompt',
            value: negText,
        });
        negInput.on('input', ({ value }) => { negText = value; });
        // Present only when this recipe actually produced a second channel.
        negSlotEl.classList.toggle('hide', !negText);

        const _note = (text, kind = '') => {
            noteEl.textContent = text || '';
            noteEl.className = `mpi-enhance-dialog__note${kind ? ` mpi-enhance-dialog__note--${kind}` : ''}`;
        };
        // Reopening on an approved enhancement shows the note that produced it.
        if (lastNote) _note(lastNote.text, lastNote.kind);

        const runBtn = MpiButton.mount(qs('#enhance-run-slot', el), {
            text: 'Enhance',
            variant: 'primary',
            size: 'md',
        });

        async function _run() {
            if (busy) return;
            if (!shortText.trim()) { _note('Type a prompt first.', 'warn'); return; }
            busy = true;
            runBtn.el.setDisabled?.(true);
            runBtn.el.setLabel?.('Enhancing…');
            _note('');
            try {
                const result = await enhanceLocally({ prompt: shortText, model: props.model });
                if (!result.ok) {
                    _note(result.error || 'Enhance failed.', 'warn');
                    return;
                }
                posText = String(result.text || '');
                posInput.el.setValue?.(posText);
                // `negativeText` is set only by a `separate-field` recipe whose reply
                // parsed. A recipe that returns none must not leave the previous run's
                // negative standing — that would send a stale channel to the graph.
                negText = String(result.negativeText || '');
                negInput.el.setValue?.(negText);
                negSlotEl.classList.toggle('hide', !negText);
                // `note` is set when the model's key matched no recipe and the pinned
                // fallback answered. The fallback is DESIGNED to answer, which is
                // exactly why it hides a miss so well — two MiniMax-H3 VIDEO cards were
                // enhanced by the `chroma` IMAGE recipe for a week and nothing failed
                // loudly. Surface it verbatim, in the dialog, before OK — and keep it
                // with the text, so reopening does not drop the warning.
                lastNote = {
                    text: result.note || `Enhanced by ${result.model || result.backend || 'the enhancer'}.`,
                    kind: result.note ? 'warn' : '',
                };
                _note(lastNote.text, lastNote.kind);
            } finally {
                busy = false;
                runBtn.el.setDisabled?.(false);
                runBtn.el.setLabel?.('Enhance');
            }
        }
        runBtn.on('click', () => { void _run(); });

        const actionsSlot = qs('#enhance-actions-slot', el);

        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel', variant: 'secondary', size: 'md',
        });
        cancelBtn.on('click', () => { emit('cancel', {}); el.hide(); });
        actionsSlot.appendChild(cancelBtn.el);

        const okBtn = MpiButton.mount(document.createElement('div'), {
            text: 'OK', variant: 'primary', size: 'md',
        });
        okBtn.on('click', () => {
            emit('apply', {
                shortPrompt: shortText,
                positive: posText.trim(),
                negative: negText.trim(),
                note: lastNote,
            });
            el.hide();
        });
        actionsSlot.appendChild(okBtn.el);

        el.destroy = () => {
            modal.el.hide?.();
            modal.el.destroy?.();
        };
    },
});
