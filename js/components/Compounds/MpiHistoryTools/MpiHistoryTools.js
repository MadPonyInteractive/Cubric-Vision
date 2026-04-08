/**
 * MpiHistoryTools — Canvas tool toolbar for the groupHistory workspace (Compound)
 *
 * Renders a vertical strip of toggleable icon buttons, one per canvas tool.
 * Exactly one button may be active at a time (radio behaviour). Pressing the
 * currently-active button deactivates it (toggle-off). External mode changes
 * (e.g. compare mode entered via checkboxes) are reflected via `el.syncMode()`
 * without re-emitting events.
 *
 * Usage:
 *   const tools = MpiHistoryTools.mount(leftBarEl, {
 *       tools: [
 *           { mode: 'crop', icon: 'crop', info: 'Crop image to social media ratio' },
 *           { mode: 'mask', icon: 'mask', info: 'Paint a mask for inpainting'      },
 *       ]
 *   });
 *   tools.on('activate',   ({ mode }) => { canvas.activeMode = mode; });
 *   tools.on('deactivate', ({ mode }) => { canvas.activeMode = 'none'; });
 *   canvasInst.on('modechange', ({ mode }) => tools.el.syncMode(mode));
 *
 * Props:
 * @param {Array<{mode: string, icon: string, info?: string}>} tools - Tool definitions
 *
 * Instance methods (on instance.el):
 *   syncMode(mode) — update button active states from an external modechange event.
 *                    Does NOT emit 'activate'/'deactivate'. Pass 'none' to deactivate all.
 *
 * Emits:
 *   'activate'   { mode: string } — user pressed an inactive tool button
 *   'deactivate' { mode: string } — user pressed the currently-active tool button (toggle off)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../../components/Primitives/MpiButton/MpiButton.js';

export const MpiHistoryTools = ComponentFactory.create({
    name: 'MpiHistoryTools',
    css: ['js/components/Compounds/MpiHistoryTools/MpiHistoryTools.css'],

    template: () => `<div class="mpi-history-tools"></div>`,

    setup: (el, props, emit) => {
        const toolDefs = props.tools || [];

        /** Map from mode string → MpiButton instance */
        const _buttons = new Map();

        /** Currently active mode ('none' means no tool active) */
        let _activeMode = 'none';

        toolDefs.forEach(({ mode, icon, info }) => {
            const slot = document.createElement('div');
            el.appendChild(slot);

            const btn = MpiButton.mount(slot, {
                icon,
                size: 'sm',
                variant: 'ghost',
                info: info || mode,
                toggleable: true,
                active: false,
            });

            btn.on('toggle', ({ active }) => {
                if (active) {
                    // Deactivate whatever was previously active
                    if (_activeMode !== 'none' && _activeMode !== mode) {
                        _buttons.get(_activeMode)?.el.setActive(false);
                    }
                    _activeMode = mode;
                    emit('activate', { mode });
                } else {
                    _activeMode = 'none';
                    emit('deactivate', { mode });
                }
            });

            _buttons.set(mode, btn);
        });

        /**
         * Sync button states from an external modechange without re-emitting events.
         * Called by the workspace's modechange handler so toolbar stays in sync when
         * the canvas mode changes from a non-toolbar source (e.g. compare checkboxes).
         * @param {string} mode - New canvas mode ('none'|'crop'|'mask'|'compare'|...)
         */
        el.syncMode = (mode) => {
            _activeMode = mode;
            _buttons.forEach((btn, btnMode) => {
                btn.el.setActive(btnMode === mode);
            });
        };
    }
});
