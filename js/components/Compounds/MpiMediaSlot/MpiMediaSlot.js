/**
 * MpiMediaSlot — Compound: a one-media drop point filled by PASTE (MPI-373).
 *
 * The Composite group's slot. The selected entry is image 1 and sits on top; the slot
 * holds what goes underneath. Filling it from a buffer rather than by selecting two
 * entries is the whole point of MPI-373: with the retired modal, changing the selection
 * restarted the operation, so the user ran it three or four times before the blend
 * looked right.
 *
 * DUMB ON PURPOSE. It knows a label, a thumbnail URL and a right-click menu. What is
 * on the copy buffer, and what a filled value MEANS, belong to the panel.
 *
 * Props:
 * @param {string}          label      - shown when empty, e.g. 'Image underneath'
 * @param {string}          [empty]    - hint under the label; defaults to the paste hint
 * @param {() => boolean}   canPaste   - is there something on the buffer to paste
 * @param {() => {url: string, name?: string}|null} readPaste - take it off the buffer
 * @param {Function}        [onEmptyClick] - clicking the EMPTY slot calls this instead of
 *        taking the shortcut paste. Place (MPI-454) passes it to open `MpiMediaPicker`,
 *        which is the single entry point for both project media and the filesystem. Still
 *        dumb: the slot knows only that the click has an owner, and the panel decides what
 *        opens. Omit it and the paste shortcut is unchanged, which is what the two
 *        hole-cutting front ends want — their only origin IS the buffer.
 *
 * Emits:
 *   'change' { url: string|null, name: string|null } — filled or cleared
 *
 * Instance API (on el):
 *   el.getValue()  — { url, name } | null
 *   el.setValue(v) — fill it without a gesture (emits 'change')
 *   el.clear()     — empty it (emits 'change' with url: null)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiContextMenu }   from '../MpiContextMenu/MpiContextMenu.js';
import { qs, on }           from '../../../utils/dom.js';

export const MpiMediaSlot = ComponentFactory.create({
    name: 'MpiMediaSlot',
    css: ['js/components/Compounds/MpiMediaSlot/MpiMediaSlot.css'],

    template: (props = {}) => `
        <div class="mpi-media-slot" tabindex="0">
            <img class="mpi-media-slot__thumb" id="slot-thumb" alt="" hidden />
            <div class="mpi-media-slot__empty" id="slot-empty">
                <span class="mpi-media-slot__label">${props.label || 'Slot'}</span>
                <span class="mpi-media-slot__hint">${props.empty || 'Right-click to paste'}</span>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        const thumb = qs('#slot-thumb', el);
        const empty = qs('#slot-empty', el);
        const _offs = [];

        /** @type {{url: string, name: string|null}|null} */
        let _value = null;

        function _render() {
            const filled = !!_value;
            thumb.hidden = !filled;
            empty.hidden = filled;
            el.classList.toggle('mpi-media-slot--filled', filled);
            thumb.src = filled ? _value.url : '';
            thumb.alt = filled ? (_value.name || props.label || '') : '';
        }

        function _set(next) {
            _value = next;
            _render();
            emit('change', { url: _value?.url || null, name: _value?.name || null });
        }

        // Right-click is the gesture the history list already teaches for Copy mask,
        // so the slots answer the same one. The menu is built per open because both
        // rows are conditional — a Paste row with nothing to paste, or a Clear row on
        // an empty slot, is a greyed line the user has to read past every time.
        _offs.push(on(el, 'contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const items = [];
            if (props.canPaste?.()) items.push({ key: 'paste', icon: 'paste', label: 'Paste' });
            if (_value) items.push({ key: 'clear', icon: 'trash', label: 'Clear slot', danger: true });
            if (!items.length) return;
            MpiContextMenu.show({
                x: e.clientX,
                y: e.clientY,
                items,
                onSelect: (key) => {
                    if (key === 'paste') _set(props.readPaste?.() || null);
                    else if (key === 'clear') _set(null);
                },
            });
        }));

        // Left-click pastes too when the slot is empty and something is on the
        // buffer. The right-click menu is still the full contract; this is the
        // shortcut for the only thing an empty slot can do.
        //
        // `onEmptyClick` OUTRANKS that shortcut when a panel supplies one (MPI-454): a
        // slot with a picker has more than one thing an empty click could mean, and the
        // picker is the one that reaches every origin. Paste is still on the right-click
        // menu, where it always was.
        _offs.push(on(el, 'click', () => {
            if (_value) return;
            if (props.onEmptyClick) { props.onEmptyClick(); return; }
            if (!props.canPaste?.()) return;
            _set(props.readPaste?.() || null);
        }));

        el.getValue = () => (_value ? { ..._value } : null);
        el.clear = () => _set(null);
        // Fill it without a gesture — the Composite panel seeds the slot from the copy
        // buffer on mount, because `Send to Composite` happens on a different entry
        // before the panel exists. Emits `change` like a paste does, so whoever owns
        // the slot's meaning reacts through one path.
        el.setValue = (v) => _set(v?.url ? { url: v.url, name: v.name || null } : null);

        _render();

        el.destroy = () => { _offs.forEach(fn => fn?.()); };
    },
});
