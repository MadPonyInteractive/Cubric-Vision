/**
 * MpiHistoryTools — Photoshop-style left toolbar for the Group History workspace (Compound).
 *
 * Single source of truth for the active tool mode in the Group History workspace.
 * Builds its own tool list from a `mode: 'image' | 'video'` prop and renders a
 * vertical radio strip of icon buttons. Exactly one mode may be active at a time.
 *
 * Grouped tool defs render an `MpiOptionSelector` (buttons variant) as the trigger;
 * picking a sub-option activates that sub-mode and persists the last-picked icon
 * onto the trigger for the session.
 *
 * Usage:
 *   const tools = MpiHistoryTools.mount(leftSlot, { mode: 'image' });
 *   tools.on('activate', ({ mode }) => mountOptions(mode));
 *   tools.el.setMode('prompt');
 *   tools.el.setDisabled({ prompt: { disabled: true, reason: 'No prompt-driven ops' } });
 *
 * Props:
 * @param {'image'|'video'} mode - Determines the built-in tool list.
 *
 * Instance methods (on instance.el):
 *   setMode(mode)      — programmatically activate a mode; emits 'activate { mode }'.
 *                        Re-activating the current mode is a no-op.
 *   setDisabled(map)   — bulk update disabled state. Shape: { [toolMode]: { disabled, reason? } }.
 *                        Accepts top-level modes (e.g. 'mask', 'crop').
 *   getActiveMode()    — read current active mode (null if none).
 *
 * Emits:
 *   'activate' { mode: string } — fired on any mode change (user click or setMode).
 *                                 No 'deactivate' event — radio switch emits only activate.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiOptionSelector } from '../MpiOptionSelector/MpiOptionSelector.js';
import { qs } from '../../../utils/dom.js';

// ── Built-in tool lists ─────────────────────────────────────────────────────

const IMAGE_TOOLS = [
    { mode: 'prompt', icon: 'chat', info: 'Prompt' },
    { mode: 'crop',   icon: 'crop', info: 'Crop'   },
    { mode: 'mask',   icon: 'mask', info: 'Mask'   },
];

const VIDEO_TOOLS = [
    { mode: 'prompt',       icon: 'chat',               info: 'Prompt'      },
    { mode: 'crop',         icon: 'crop',               info: 'Crop'        },
    { mode: 'videoUpscale', icon: 'upscaler',           info: 'Upscale'     },
    { mode: 'interpolate',  icon: 'interpolate_stroke', info: 'Interpolate' },
];

const TOOL_LISTS = { image: IMAGE_TOOLS, video: VIDEO_TOOLS };

export const MpiHistoryTools = ComponentFactory.create({
    name: 'MpiHistoryTools',
    css: ['js/components/Compounds/MpiHistoryTools/MpiHistoryTools.css'],

    template: () => `<div class="mpi-history-tools"></div>`,

    setup: (el, props, emit) => {
        const mode = props.mode === 'video' ? 'video' : 'image';
        const toolDefs = TOOL_LISTS[mode];

        /** Currently active mode (null = nothing active). */
        let _activeMode = null;

        /** Flat button instances keyed by tool mode ({mode -> MpiButton instance}). */
        const _buttons = new Map();

        /** Option-selector instances keyed by OUTER group mode (e.g. 'mask' -> MpiOptionSelector). */
        const _selectors = new Map();

        /** Reverse lookup: subMode -> outer group mode (for grouped tool defs). */
        const _subToGroup = new Map();

        /** Per-def disabled state. Shape: { mode: { disabled: bool, reason?: string } } */
        const _disabledState = new Map();

        /** Last-picked sub-tool per group trigger (persists icon across popup opens). */
        const _lastSubIcon = new Map();

        /** Current tool defs indexed by mode for cheap lookup on remount. */
        const _defsByMode = new Map();
        toolDefs.forEach(def => {
            _defsByMode.set(def.mode, def);
            if (def.group) def.group.forEach(sub => _defsByMode.set(sub.mode, sub));
        });

        /** Cleanup registry. */
        const _unsubs = [];

        // ── Rendering helpers ────────────────────────────────────────────────

        /**
         * Render a flat (non-grouped) tool button into its slot. Re-mounts to apply
         * disabled-state + active-state changes (MpiButton has no setDisabled).
         */
        const _renderFlatButton = (def, slot) => {
            const prev = _buttons.get(def.mode);
            if (prev) prev.destroy?.();

            const dstate = _disabledState.get(def.mode);
            const isDisabled = !!dstate?.disabled;
            const tooltip = isDisabled && dstate?.reason ? dstate.reason : (def.info || def.mode);

            slot.innerHTML = '';
            const btn = MpiButton.mount(slot, {
                icon: def.icon,
                size: 'sm',
                variant: 'ghost',
                info: tooltip,
                toggleable: false,
                active: _activeMode === def.mode,
                disabled: isDisabled,
            });

            const off = btn.on('click', () => {
                if (isDisabled) return;
                _activate(def.mode);
            });
            _unsubs.push(off);

            _buttons.set(def.mode, btn);
        };

        /**
         * Render a grouped tool as an MpiOptionSelector (buttons variant). Sub-tool
         * click activates that sub-mode and persists the sub-tool's icon on the trigger.
         */
        const _renderGroupedTool = (def, slot) => {
            const prev = _selectors.get(def.mode);
            if (prev) prev.destroy?.();

            // Build button list from group def; carry disabled flags through.
            const buttons = def.group.map(sub => {
                const dstate = _disabledState.get(sub.mode);
                return {
                    icon: sub.icon,
                    label: sub.label ?? sub.info ?? sub.mode,
                    value: sub.mode,
                    info: dstate?.disabled && dstate?.reason
                        ? dstate.reason
                        : (sub.info ?? sub.label ?? sub.mode),
                };
            });

            // Trigger icon defaults to first sub-tool's icon (Photoshop-style —
            // the trigger reflects which sub-tool will fire on repeat-click).
            // Persist last-picked across re-renders via _lastSubIcon.
            if (!_lastSubIcon.has(def.mode)) {
                _lastSubIcon.set(def.mode, def.group[0]?.icon || def.icon);
            }
            const triggerIcon = _lastSubIcon.get(def.mode);
            // Trigger is "active" when any sub-mode is currently selected.
            const triggerActive = def.group.some(sub => sub.mode === _activeMode);

            // Record sub -> outer mapping (idempotent).
            def.group.forEach(sub => _subToGroup.set(sub.mode, def.mode));

            slot.innerHTML = '';
            const sel = MpiOptionSelector.mount(slot, {
                variant: 'buttons',
                buttons,
                triggerIcon,
                triggerActive,
                triggerSize: 'sm',
                triggerVariant: 'ghost',
                popupTitle: def.info || def.mode,
                info: def.info || def.mode,
            });

            const off = sel.on('change', ({ value, def: subDef }) => {
                // Check disabled state on the sub-mode before activating.
                const dstate = _disabledState.get(value);
                if (dstate?.disabled) return;
                if (subDef?.icon) _lastSubIcon.set(def.mode, subDef.icon);
                _activate(value);
            });
            _unsubs.push(off);

            _selectors.set(def.mode, sel);
        };

        /** Mount a single tool def (flat or grouped) into a fresh slot appended to el. */
        const _mountTool = (def) => {
            const slot = document.createElement('div');
            slot.className = 'mpi-history-tools__slot';
            slot.dataset.mode = def.mode;
            el.appendChild(slot);
            if (def.group) _renderGroupedTool(def, slot);
            else _renderFlatButton(def, slot);
        };

        /** Re-render only the tool whose disabled state changed. */
        const _remountTool = (toolMode) => {
            // A sub-mode change requires remount of its outer group trigger.
            const outer = _subToGroup.get(toolMode) || toolMode;
            const def = _defsByMode.get(outer);
            if (!def) return;
            const slot = qs(`.mpi-history-tools__slot[data-mode="${outer}"]`, el);
            if (!slot) return;
            if (def.group) _renderGroupedTool(def, slot);
            else _renderFlatButton(def, slot);
        };

        // ── Activation ───────────────────────────────────────────────────────

        /**
         * Switch active mode. Re-activating the current mode is a no-op.
         * Updates button visual states and emits 'activate { mode }'.
         */
        const _activate = (newMode) => {
            if (_activeMode === newMode) return;
            const prev = _activeMode;
            _activeMode = newMode;

            // Clear previous flat-button active visual.
            if (prev && _buttons.has(prev)) {
                _buttons.get(prev)?.el.setActive?.(false);
            }
            // Clear previous grouped-trigger active visual.
            const prevOuter = prev ? _subToGroup.get(prev) : null;
            if (prevOuter && _selectors.has(prevOuter)) {
                _selectors.get(prevOuter)?.el.setTriggerActive?.(false);
            }

            // Set new active visual.
            if (_buttons.has(newMode)) {
                _buttons.get(newMode)?.el.setActive?.(true);
            }
            const newOuter = _subToGroup.get(newMode);
            if (newOuter && _selectors.has(newOuter)) {
                const sel = _selectors.get(newOuter);
                sel?.el.setTriggerActive?.(true);
                const subDef = _defsByMode.get(newMode);
                if (subDef?.icon) sel?.el.setTriggerIcon?.(subDef.icon);
            }

            emit('activate', { mode: newMode });
        };

        // ── Public API (on el) ───────────────────────────────────────────────

        el.setMode = (newMode) => {
            // Validate: mode must exist in current tool list (top-level or sub).
            if (!_defsByMode.has(newMode)) return;
            _activate(newMode);
        };

        el.getActiveMode = () => _activeMode;

        /**
         * Bulk-update disabled state for a set of tool modes.
         * @param {Object} map - { [mode]: { disabled: boolean, reason?: string } }
         */
        el.setDisabled = (map) => {
            if (!map || typeof map !== 'object') return;
            for (const [toolMode, dstate] of Object.entries(map)) {
                _disabledState.set(toolMode, {
                    disabled: !!dstate?.disabled,
                    reason: dstate?.reason || '',
                });
                _remountTool(toolMode);
            }
        };

        // ── Initial mount ────────────────────────────────────────────────────

        toolDefs.forEach(_mountTool);

        // ── Teardown ─────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _buttons.forEach(btn => btn?.destroy?.());
            _selectors.forEach(sel => sel?.destroy?.());
            _buttons.clear();
            _selectors.clear();
            _subToGroup.clear();
            _disabledState.clear();
            _lastSubIcon.clear();
        };
    },
});
