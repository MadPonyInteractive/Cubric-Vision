/**
 * mentionPicker.js — the `@` popup that turns a half-typed name into a bracketed tag.
 *
 * MPI-664 checklist L30. `MpiPromptBox` has shipped this interaction since MPI-475 for
 * staged references (`@pic` -> `<Picture 1>`); the Lyrics box of the Song flow needs the
 * same one for its VOICE ROSTER (`@sin` -> `<Singer A>`), because MiniMax hands a line to
 * a voice by name in angle brackets and remembering the exact spelling is the user's
 * problem otherwise.
 *
 * WHAT IS SHARED AND WHAT IS NOT. The matching is already shared and already pure —
 * `matchRefTagQuery` in js/data/commandRegistry.js owns every edge case (an email address
 * mid-text must not open a picker, `@` then a space closes one, a tag with a space in it
 * is reachable without typing the space). This file is the half that is NOT pure: the
 * popup, the four listeners and the splice. Nothing about a reference or a voice is in
 * here — the caller says what the list is and what a pick writes.
 *
 * BEM stays with the caller, exactly as `declaredFields.js` does it: `block` prefixes
 * every class, so a consumer styles `<block>__mention-picker*` in its own stylesheet and
 * nothing moves into a shared one.
 *
 * 🟡 `MpiPromptBox` KEEPS ITS OWN COPY for now, deliberately (Fabio, 2026-09-10). Its
 * picker works, it is wired into that organism's draft/mode/emit plumbing, and MPI-677
 * had just landed in the file. Repoint it at this util the next time that file is open
 * for a real reason — the two behave the same, so the diff is a deletion.
 */

import { ce, on } from './dom.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { matchRefTagQuery } from '../data/commandRegistry.js';

/**
 * What a pick writes into the textarea.
 *
 * A voice marker has to sit ON ITS OWN LINE — every line outside a `[section]` tag is
 * sung, so a marker sharing a line with words changes what the model is handed. Hence
 * the two splices below rather than a plain concatenation:
 *   - trailing spaces/tabs before the `@` are dropped, so a marker typed mid-line does
 *     not leave a stranded space at the end of the line above;
 *   - a newline is added after the tag unless the text already continues on one.
 *
 * @param {string} value    the full textarea value
 * @param {number} at       index of the `@` that opened the picker
 * @param {number} caret    selectionStart (end of the typed query)
 * @param {string} tag      the chosen tag, without brackets
 * @returns {{value:string, caret:number}}
 */
export function spliceMentionTag(value, at, caret, tag) {
    const before = value.slice(0, at).replace(/[ \t]+$/, '');
    const after = value.slice(caret);
    const lead = before === '' || before.endsWith('\n') ? '' : '\n';
    const trail = after.startsWith('\n') ? '' : '\n';
    const insert = `${lead}<${tag}>${trail}`;
    return { value: before + insert + after, caret: before.length + insert.length };
}

/**
 * Attach the `@` picker to a textarea. Idempotent per element is NOT promised — call it
 * once per mount and call the returned function on teardown.
 *
 * @param {HTMLTextAreaElement} textareaEl
 * @param {object} opts
 * @param {HTMLElement} opts.host        element the popup is appended to (must be positioned)
 * @param {string} opts.block            BEM block for the popup's classes
 * @param {() => Array<{tag:string, label?:string}>} opts.getTags
 *        read LIVE on every keystroke — the roster it comes from is editable while the
 *        box is open, so a captured array would go stale the first time a name changes
 * @param {(next:string, caret:number) => void} [opts.onInsert]
 *        called with the new value and the caret it belongs at, after a pick
 * @returns {() => void} destroy
 */
export function attachMentionPicker(textareaEl, { host, block, getTags, onInsert } = {}) {
    if (!textareaEl || !host || typeof getTags !== 'function') return () => {};

    const cls = (el) => `${block}__mention-picker${el}`;
    const unsubs = [];

    // 🔴 `MENTION_PICKER_OPEN_SELECTOR` (hotkeyRegistry.js) MATCHES THE MARKER CLASS, NOT
    // THE BEM ONE. The BEM class carries the caller's block, so it is a different string
    // per host and a substring selector would also match `…__mention-picker-item` rows —
    // which outlive a close and would gate Tab off permanently. The fixed marker is the
    // stable handle: the shell's Tab hotkey reads it to know this popup owns the key.
    const picker = ce('div', { className: `${cls('')} mpi-mention-picker hide` });
    host.appendChild(picker);

    let at = -1;
    let matches = [];
    let active = 0;
    const isOpen = () => at !== -1;

    // Every row is a mounted Primitive, so a repaint MUST destroy the previous set or
    // the instances leak for as long as the box stays open — same law as the voice
    // roster's own rows in declaredFields.js.
    let rowUnsubs = [];
    const dropRows = () => { rowUnsubs.forEach(fn => fn()); rowUnsubs = []; };

    const close = () => {
        if (!isOpen()) return;
        at = -1;
        matches = [];
        picker.classList.add('hide');
        dropRows();
        picker.innerHTML = '';
    };

    const paint = () => {
        dropRows();
        picker.innerHTML = '';
        matches.forEach((entry, i) => {
            // mount() replaces its container's contents (MPI-588), so each row mounts
            // into its own host and the button is then moved onto the popup — the
            // popup is the flex column, and a wrapper div between them would take the
            // row's sizing away from the button the CSS targets.
            const rowHost = ce('div');
            const inst = MpiButton.mount(rowHost, {
                // `text`, NOT `label`. MpiButton has two modes and `label` belongs to
                // the ICON one ("text label alongside the icon"); a plain text button
                // renders `props.text` and nothing else. Passing `label` with no icon
                // mounts a real, styled, EMPTY button — which is exactly what shipped
                // to Fabio's screen: the popup opened with three zero-height rows.
                text: entry.label || entry.tag,
                variant: 'ghost',
                size: 'sm',
                extraClasses: `${cls('-item')}${i === active ? ` ${cls('-item')}--active` : ''}`,
            });
            rowUnsubs.push(() => inst?.el?.destroy?.());
            const btn = inst?.el || rowHost.firstElementChild;
            if (!btn) return;
            btn.dataset.idx = String(i);
            picker.appendChild(btn);
        });
    };

    const insert = (entry) => {
        if (!entry) return;
        const next = spliceMentionTag(textareaEl.value, at, textareaEl.selectionStart, entry.tag);
        close();
        textareaEl.value = next.value;
        textareaEl.setSelectionRange(next.caret, next.caret);
        textareaEl.focus();
        // The caret goes out with the value: a consumer that owns a Primitive has to
        // write through its setter (`MpiInput.setValue` syncs the cached prop and
        // re-runs the auto-grow), and that assignment drops the selection.
        onInsert?.(next.value, next.caret);
    };

    const sync = () => {
        // Null on an empty roster, and that is correct rather than broken: a flow whose
        // cast list is empty has no name to offer.
        const query = matchRefTagQuery(textareaEl.value, textareaEl.selectionStart, getTags());
        if (!query) return close();
        at = query.at;
        matches = query.matches;
        active = Math.min(active, matches.length - 1);
        picker.classList.remove('hide');
        paint();
    };

    // mousedown, not click: the textarea blurs on click and blur closes us first.
    unsubs.push(on(picker, 'mousedown', (e) => {
        const btn = e.target.closest(`.${cls('-item')}`);
        if (!btn) return;
        e.preventDefault();
        insert(matches[Number(btn.dataset.idx)]);
    }));

    unsubs.push(on(textareaEl, 'keydown', (e) => {
        if (!isOpen()) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
            paint();
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insert(matches[active]);
            return;
        }
        if (e.key === 'Escape') close();
    }));

    unsubs.push(on(textareaEl, 'input', () => { active = 0; sync(); }));
    // The caret moves without an input event too — arrows, or a click into the text.
    unsubs.push(on(textareaEl, 'keyup', (e) => {
        if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') sync();
    }));
    unsubs.push(on(textareaEl, 'blur', () => close()));

    return () => {
        unsubs.forEach(fn => fn?.());
        close();
        picker.remove();
    };
}
