/**
 * MpiToolActionBar — Floating bottom action bar for canvas tools (Compound)
 *
 * A pill-shaped bar that slides up from the bottom of the workspace when a
 * canvas tool is active. Renders an optional top-slot (for e.g. a thumbnail
 * strip), an optional left-side content slot (for arbitrary controls like a
 * ratio selector), and a right-side row of action buttons. Toggleable buttons
 * within the same `radioGroup` enforce radio behaviour (at most one active at
 * a time).
 *
 * Usage:
 *   const bar = MpiToolActionBar.mount(container, {
 *       topSlot:  thumbsInstance,          // optional — shown above the pill
 *       leftSlot: ratioSelectorInstance,   // optional — shown left of actions
 *       actions: [
 *           { key: 'brush',  icon: 'pencil', label: 'Brush',  variant: 'ghost', toggleable: true, active: true, radioGroup: 'tool' },
 *           { key: 'eraser', icon: 'eraser', label: 'Eraser', variant: 'ghost', toggleable: true, radioGroup: 'tool' },
 *           { key: 'clear',  icon: 'trash',  label: 'Clear',  variant: 'ghost' },
 *           { key: 'cancel', icon: 'close',  label: 'Cancel', variant: 'ghost' },
 *           { key: 'apply',  icon: 'check',  label: 'Apply',  variant: 'primary' },
 *       ],
 *   });
 *   bar.el.show();
 *   bar.el.hide();
 *   bar.el.setActive('brush');   // sync a toggleable button's active state externally
 *   bar.on('action', ({ key, active }) => { ... });
 *
 * Props:
 * @param {Array<ActionDef>} actions      - Button definitions (see typedef below)
 * @param {Object}           [topSlot]    - A mounted component instance to embed above the pill
 * @param {Object}           [leftSlot]   - A mounted component instance to embed on the left of the pill
 *
 * @typedef {Object} ActionDef
 * @property {string}  key           - Unique identifier emitted with 'action' event
 * @property {string}  icon          - Icon registry key
 * @property {string}  [label]       - Text label
 * @property {string}  [variant='ghost'] - MpiButton variant
 * @property {boolean} [toggleable]  - Whether button commits active state
 * @property {boolean} [active]      - Initial active state (for toggleable buttons)
 * @property {string}  [radioGroup]  - Buttons sharing a radioGroup enforce mutual exclusion
 * @property {string}  [info]        - Tooltip / info bar text
 *
 * Instance methods (on instance.el):
 *   show()            — make the bar visible
 *   hide()            — hide the bar
 *   setActive(key)    — set the active button in a radio group (does NOT emit 'action')
 *
 * Emits:
 *   'action' { key: string, active: boolean } — any button was clicked
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';

export const MpiToolActionBar = ComponentFactory.create({
    name: 'MpiToolActionBar',
    css:  ['js/components/Compounds/MpiToolActionBar/MpiToolActionBar.css'],

    template: () => `
        <div class="mpi-tool-action-bar">
            <div class="mpi-tool-action-bar__top"></div>
            <div class="mpi-tool-action-bar__pill">
                <div class="mpi-tool-action-bar__left"></div>
                <div class="mpi-tool-action-bar__actions"></div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const topEl     = el.querySelector('.mpi-tool-action-bar__top');
        const leftEl    = el.querySelector('.mpi-tool-action-bar__left');
        const actionsEl = el.querySelector('.mpi-tool-action-bar__actions');

        // ── Inline variant — bar sits inside its mount slot (no fixed float) ─
        // Starts hidden; show()/hide() toggle --visible class which drives display.
        if (props.inline) {
            el.classList.add('mpi-tool-action-bar--inline');
        }

        // ── Top slot (optional — e.g. thumbnail strip above the pill) ─────────
        if (props.topSlot?.el) {
            topEl.appendChild(props.topSlot.el);
        } else {
            topEl.style.display = 'none';
        }

        // ── Left slot (optional arbitrary component) ───────────────────────────
        if (props.leftSlot?.el) {
            leftEl.appendChild(props.leftSlot.el);
        } else {
            leftEl.style.display = 'none';
        }

        // ── Button instances keyed by action key ───────────────────────────────
        /** @type {Map<string, Object>} key → MpiButton instance */
        const _btns = new Map();

        /** @type {Map<string, string[]>} radioGroup → [key, ...] */
        const _radioGroups = new Map();

        (props.actions || []).forEach(def => {
            const slot = document.createElement('div');
            actionsEl.appendChild(slot);

            const btn = MpiButton.mount(slot, {
                icon:       def.icon,
                label:      def.label || '',
                labelPosition: 'top',
                size:       'sm',
                variant:    def.variant || 'ghost',
                info:       def.info || def.label || def.key,
                toggleable: def.toggleable || false,
                active:     def.active    || false,
            });

            btn.on('toggle', ({ active }) => {
                // Radio group: deactivate siblings when this one activates
                if (active && def.radioGroup) {
                    const siblings = _radioGroups.get(def.radioGroup) || [];
                    siblings.forEach(sibKey => {
                        if (sibKey !== def.key) _btns.get(sibKey)?.el.setActive(false);
                    });
                }
                emit('action', { key: def.key, active });
            });

            btn.on('click', ({ active }) => {
                // Non-toggleable buttons still emit action
                if (!def.toggleable) emit('action', { key: def.key, active: false });
            });

            _btns.set(def.key, btn);

            if (def.radioGroup) {
                if (!_radioGroups.has(def.radioGroup)) _radioGroups.set(def.radioGroup, []);
                _radioGroups.get(def.radioGroup).push(def.key);
            }
        });

        // ── Public API ─────────────────────────────────────────────────────────

        el.show = () => el.classList.add('mpi-tool-action-bar--visible');
        el.hide = () => el.classList.remove('mpi-tool-action-bar--visible');

        /**
         * Sync a toggleable button's active state from external code.
         * Does NOT emit 'action'. Useful for B/E hotkey → button highlight sync.
         * @param {string} key
         */
        el.setActive = (key) => {
            const btn = _btns.get(key);
            if (!btn) return;
            btn.el.setActive(true);
            // Deactivate radio siblings
            const def = (props.actions || []).find(a => a.key === key);
            if (def?.radioGroup) {
                (_radioGroups.get(def.radioGroup) || []).forEach(sibKey => {
                    if (sibKey !== key) _btns.get(sibKey)?.el.setActive(false);
                });
            }
        };
    }
});
