/**
 * MpiHistoryTools — Photoshop-style left toolbar for the Group History workspace (Compound).
 *
 * Single source of truth for the active tool mode in the Group History workspace.
 * Builds its own tool list from a `mode: 'image' | 'video'` prop and renders a
 * vertical radio strip of icon buttons. Exactly one mode may be active at a time.
 *
 * Grouped tool defs render their sub-tools as a vertical stack of flat buttons
 * directly under the group label — no popup, no portal. New tools added to a
 * group automatically stack inline; the layout scales without changes here.
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
import { qs } from '../../../utils/dom.js';

// ── Built-in tool lists ─────────────────────────────────────────────────────
// Groups: each group gets a label strip + separator. group[] items render as
// stacked flat buttons under the label; multi-item groups stack vertically.

const IMAGE_TOOLS = [
    {
        mode: 'prompt',
        label: 'Prompt',
        group: [
            { mode: 'prompt', icon: 'chat', info: 'Prompt' },
        ],
    },
    {
        mode: 'transform',
        label: 'Transform',
        group: [
            { mode: 'crop', icon: 'crop', info: 'Crop' },
            { mode: 'resize', icon: 'resize_stroke', info: 'Resize' },
        ],
    },
    {
        mode: 'mask',
        label: 'Mask',
        group: [
            { mode: 'mask', icon: 'brush', info: 'Mask' },
        ],
    },
];

const VIDEO_TOOLS = [
    {
        mode: 'prompt',
        label: 'Prompt',
        group: [
            { mode: 'prompt', icon: 'chat', info: 'Prompt' },
        ],
    },
    {
        mode: 'transform',
        label: 'Transform',
        group: [
            { mode: 'crop',        icon: 'crop',          info: 'Crop'   },
            { mode: 'resizeVideo', icon: 'resize_stroke', info: 'Resize' },
        ],
    },
    {
        mode: 'enhance',
        label: 'Enhance',
        group: [
            { mode: 'videoUpscale', icon: 'upscaler',           info: 'Upscale'     },
            { mode: 'interpolate',  icon: 'interpolate_stroke', info: 'Interpolate' },
        ],
    },
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

        /** Reverse lookup: subMode -> outer group mode (for grouped tool defs). */
        const _subToGroup = new Map();

        /** Per-def disabled state. Shape: { mode: { disabled: bool, reason?: string } } */
        const _disabledState = new Map();

        /** Current tool defs indexed by mode for cheap lookup on remount. */
        const _defsByMode = new Map();
        toolDefs.forEach(def => {
            _defsByMode.set(def.mode, def);
            if (def.group) def.group.forEach(sub => {
                _defsByMode.set(sub.mode, sub);
                _subToGroup.set(sub.mode, def.mode);
            });
        });

        /** Cleanup registry. */
        const _unsubs = [];

        // ── Rendering helpers ────────────────────────────────────────────────

        /**
         * Append a flat tool button into a slot. Each button gets its own wrapper
         * container so MpiButton.mount's innerHTML overwrite doesn't clobber siblings.
         */
        const _appendFlatButton = (def, slot) => {
            const prev = _buttons.get(def.mode);
            if (prev) prev.destroy?.();

            const dstate = _disabledState.get(def.mode);
            const isDisabled = !!dstate?.disabled;
            const tooltip = isDisabled && dstate?.reason ? dstate.reason : (def.info || def.mode);

            const wrap = document.createElement('div');
            wrap.className = 'mpi-history-tools__btn';
            slot.appendChild(wrap);

            const btn = MpiButton.mount(wrap, {
                icon: def.icon,
                size: 'sm',
                variant: 'ghost',
                info: tooltip,
                toggleable: false,
                active: _activeMode === def.mode,
                disabled: isDisabled,
                extraClasses: 'mpi-ibtn--rail',
            });

            const off = btn.on('click', () => {
                if (isDisabled) return;
                _activate(def.mode);
            });
            _unsubs.push(off);

            _buttons.set(def.mode, btn);
        };

        /** Render every sub-tool of a group as a stacked flat button into one slot. */
        const _renderGroupSlot = (def, slot) => {
            slot.innerHTML = '';
            const subs = def.group || [def];
            subs.forEach(sub => _appendFlatButton(sub, slot));
        };

        /** Mount a single tool def into a labelled group section. */
        const _mountTool = (def, isFirst) => {
            // Separator line between groups (not before the first)
            if (!isFirst) {
                const sep = document.createElement('div');
                sep.className = 'mpi-history-tools__sep';
                el.appendChild(sep);
            }

            // Group label strip
            const lbl = document.createElement('span');
            lbl.className = 'mpi-history-tools__label';
            lbl.textContent = def.label || def.mode;
            el.appendChild(lbl);

            const slot = document.createElement('div');
            slot.className = 'mpi-history-tools__slot';
            slot.dataset.mode = def.mode;
            el.appendChild(slot);

            _renderGroupSlot(def, slot);
        };

        /** Re-render only the group containing the tool whose disabled state changed. */
        const _remountTool = (toolMode) => {
            const outer = _subToGroup.get(toolMode) || toolMode;
            const def = _defsByMode.get(outer);
            if (!def) return;
            const slot = qs(`.mpi-history-tools__slot[data-mode="${outer}"]`, el);
            if (!slot) return;
            _renderGroupSlot(def, slot);
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

            if (prev && _buttons.has(prev)) {
                _buttons.get(prev)?.el.setActive?.(false);
            }
            if (_buttons.has(newMode)) {
                _buttons.get(newMode)?.el.setActive?.(true);
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

        toolDefs.forEach((def, i) => _mountTool(def, i === 0));

        // ── Teardown ─────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _buttons.forEach(btn => btn?.destroy?.());
            _buttons.clear();
            _subToGroup.clear();
            _disabledState.clear();
        };
    },
});
