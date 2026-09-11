/**
 * loraSlotParts — the pieces one LoRA row is made of, shared by the two surfaces
 * that render LoRAs (MPI-724).
 *
 *   MpiModelSettings — the overlay where a LoRA is ADDED: picker + strengths + bypass.
 *   MpiLoraRack      — the read-out in the PromptBox settings popup: name + the same
 *                      strengths + the same bypass, no picker.
 *
 * One definition rather than two copies because the bypass contract (aria-pressed as
 * the single source of truth, MPI-588) and the strength bounds have to agree — the
 * two surfaces write the SAME `loras` value and live-sync each other, so a drift
 * between them is a bug the user sees as a number that changes when they look away.
 *
 * `bem` is the caller's block name: the parts carry the host component's own class
 * names so each keeps its CSS in its own stylesheet. Everything else — the -2..2
 * range, the 0.05 step, the 2 decimals, the ghost icon button — is identical by
 * construction.
 */

import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { on } from '../../../utils/dom.js';

/**
 * Build the strength-inputs row for one LoRA slot. `kinds` is the model's
 * loraStrengths array (e.g. ['model'], ['clip'], or ['model','clip']) — only the
 * listed knobs render. onModel/onClip fire on change.
 *
 * Returns `{ el, modelInput, clipInput }`, not a bare element: live sync writes an
 * incoming value through `input.el.setValue()` rather than re-rendering the row, so
 * a half-typed number never loses focus and an open picker beside it is never torn
 * down. `modelInput`/`clipInput` are null when that kind isn't rendered.
 *
 * @param {{strengthModel?: number, strengthClip?: number}} slot
 * @param {string[]} kinds
 * @param {(v: number) => void} onModel
 * @param {(v: number) => void} onClip
 * @param {string} [bem] host block name for the row's classes
 */
export function buildStrengthsRow(slot, kinds, onModel, onClip, bem = 'mpi-model-settings') {
    const strengthsEl = document.createElement('div');
    strengthsEl.className = `${bem}__lora-strengths`;

    let modelInput = null;
    let clipInput = null;

    if (kinds.includes('model')) {
        const modelLabel = document.createElement('label');
        modelLabel.className = `${bem}__strength-label`;
        modelLabel.textContent = 'Model';
        modelInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', size: 'sm', value: slot.strengthModel,
            min: -2, max: 2, step: 0.05, decimals: 2,
        });
        modelInput.on('change', ({ value }) => onModel(value));
        strengthsEl.appendChild(modelLabel);
        strengthsEl.appendChild(modelInput.el);
    }

    if (kinds.includes('clip')) {
        const clipLabel = document.createElement('label');
        clipLabel.className = `${bem}__strength-label`;
        clipLabel.textContent = 'Clip';
        clipInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', size: 'sm', value: slot.strengthClip,
            min: -2, max: 2, step: 0.05, decimals: 2,
        });
        clipInput.on('change', ({ value }) => onClip(value));
        strengthsEl.appendChild(clipLabel);
        strengthsEl.appendChild(clipInput.el);
    }

    return { el: strengthsEl, modelInput, clipInput };
}

/**
 * Build the per-slot bypass toggle button. Pressed = neutralise this LoRA at
 * generation (inject strength 0) without changing its saved name/values — the
 * slot's controls grey out (CSS, via the --bypassed class) but stay readable.
 * `bypassed` sets the initial pressed state; `onToggle(next)` fires with the new
 * boolean. (MPI-223)
 *
 * @param {boolean} bypassed
 * @param {(next: boolean) => void} onToggle
 * @param {string} [bem] host block name for the button's class
 */
export function buildBypassBtn(bypassed, onToggle, bem = 'mpi-model-settings') {
    // Not `toggleable`: the pressed state is published as aria-pressed, which is
    // what the CSS and assistive tech both read here — the Primitive's own
    // `is-active` class would be a second, silent source of truth (MPI-588).
    const btn = mountButton({
        icon: 'negative',
        size: 'sm',
        variant: 'ghost',
        extraClasses: `${bem}__lora-bypass`,
    });
    btn.title = 'Bypass this LoRA (inject at zero strength)';
    btn.setAttribute('aria-pressed', String(Boolean(bypassed)));
    on(btn, 'click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(next));
        onToggle(next);
    });
    return btn;
}

/**
 * Apply a bypass state that arrived from the OTHER surface — the same two writes
 * the click handler makes, without firing onToggle (which would echo straight back
 * out and re-enter the sync).
 *
 * @param {HTMLElement} btn the button from buildBypassBtn
 * @param {HTMLElement} hostEl the slot/row element carrying the bypassed modifier
 * @param {boolean} next
 * @param {string} bypassedClass full modifier class, e.g. 'mpi-lora-rack__row--bypassed'
 */
export function applyBypass(btn, hostEl, next, bypassedClass) {
    btn?.setAttribute('aria-pressed', String(Boolean(next)));
    hostEl?.classList.toggle(bypassedClass, Boolean(next));
}

/** Filename without any folder, separator-agnostic. */
export const baseName = (f) => String(f || '').replace(/\\/g, '/').split('/').pop();

/** Separator-agnostic full-path key (forward slash, lowercased). */
export const pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

/**
 * Resolve a saved LoRA name to a list entry. Returns { value, healed, ambiguous }:
 *  - exact full-path match (separator-agnostic) → that entry, healed:false.
 *  - exact path gone but ONE same-basename file exists (e.g. the LoRA's subfolder
 *    was removed and the file now sits at root) → heal to it, healed:true.
 *  - MULTIPLE same-basename files (genuinely different files) → ambiguous:true,
 *    value unchanged (caller keeps it red so the user re-picks).
 *  - nothing matches → value unchanged, neither healed nor ambiguous (missing).
 */
export function resolveInfo(value, available) {
    if (!value) return { value, healed: false, ambiguous: false };
    const list = available || [];
    const want = pathKey(value);
    const exact = list.find(f => pathKey(f) === want);
    if (exact) return { value: exact, healed: false, ambiguous: false };
    const base = baseName(value).toLowerCase();
    const byName = list.filter(f => baseName(f).toLowerCase() === base);
    if (byName.length === 1) return { value: byName[0], healed: true, ambiguous: false };
    if (byName.length > 1) return { value, healed: false, ambiguous: true };
    return { value, healed: false, ambiguous: false };
}

/**
 * True when `value` is set but cannot be resolved to a loadable list entry —
 * either nothing matches OR the basename is ambiguous (multiple folders, we won't
 * guess). A unique-basename heal counts as PRESENT (not missing).
 */
export function isMissing(value, available) {
    if (!value) return false;
    const info = resolveInfo(value, available);
    if (info.ambiguous) return true;          // multiple same-name files → can't resolve
    if (info.healed) return false;            // unique basename heal → loadable
    // Neither healed nor ambiguous: present only if an exact entry exists.
    return !(available || []).some(f => pathKey(f) === pathKey(value));
}
