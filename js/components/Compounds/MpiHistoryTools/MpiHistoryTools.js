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
 * A group member may instead be a COLLAPSE entry (`{ collapse, icon, info, sub }`,
 * MPI-425): one rail button that owns several modes and opens them in a floating
 * strip beside the rail instead of stacking them all in the column. It activates
 * nothing itself — the modes underneath stay ordinary modes, only their
 * presentation changes.
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
import { MpiPopup } from '../../Primitives/MpiPopup/MpiPopup.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { qs, on } from '../../../utils/dom.js';

/** How long the collapse strip survives once the pointer leaves it (ms). */
const STRIP_DISMISS_MS = 1500;

// ── Built-in tool lists ─────────────────────────────────────────────────────
// Groups: each group gets a label strip + separator. group[] items render as
// stacked flat buttons under the label; multi-item groups stack vertically.
// A member carrying `collapse` + `sub[]` renders as ONE button that opens its
// sub-modes in a floating strip instead (MPI-425).

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
        mode: 'enhance',
        label: 'Enhance',
        group: [
            { mode: 'imageUpscale', icon: 'upscaler', info: 'Upscale' },
            // ponytail: eraser icon reused for cutout; add a dedicated icon if design wants one.
            { mode: 'removeBackground', icon: 'eraser', info: 'Remove Background' },
        ],
    },
    {
        mode: 'mask',
        label: 'Mask',
        // One job per button (MPI-371, MPI-381) — but the three DETECTION methods
        // are one job with three engines, so MPI-425 collapses them behind a single
        // rail button and gives the column back to the methods that differ. This
        // supersedes the older note that Shapes (MPI-368) "does not become a
        // switcher": that was written when the family was four hand-picked methods.
        // Now Mask, Paint and Composite are groups, Shapes mounts once per group
        // off ONE gizmo, and only same-job siblings collapse. Shapes still gets its
        // own button here — it is not a detection method.
        group: [
            { mode: 'maskBrush', icon: 'brush', info: 'Brush' },
            {
                collapse: 'detect',
                icon: 'search',
                info: 'Detect',
                sub: [
                    { mode: 'maskPoints', icon: 'circle',  info: 'Points', label: 'Points' },
                    { mode: 'maskText',   icon: 'text',    info: 'Text',   label: 'Text'   },
                    { mode: 'maskDetect', icon: 'sparkle', info: 'Auto',   label: 'Auto'   },
                ],
            },
            { mode: 'maskShapes', icon: 'shapes_stroke', info: 'Shapes' },
            // Below Detect on purpose (user, 2026-08-03): Adjust operates on a mask
            // that already exists, so it reads in the order the work happens —
            // make it by hand or by detection, then adjust it.
            { mode: 'maskAdjust', icon: 'mask_adjust_stroke', info: 'Adjust' },
        ],
    },
    {
        mode: 'paint',
        label: 'Paint',
        // The second GROUP of the MPI-424 taxonomy: same engines, different
        // artifact. Groups are by artifact, never by feature — Paint Brush is the
        // Mask Brush with the RGBA layer as its destination, which is why the rail
        // gains a group here rather than another button under Mask.
        // Shapes (MPI-368) joins this group and the Mask one off ONE gizmo.
        group: [
            { mode: 'paint', icon: 'brush', info: 'Paint' },
            // The SAME gizmo as maskShapes above, pointed at the RGBA layer — one
            // geometry, two destinations (MPI-368). Two rail buttons, one component.
            { mode: 'paintShapes', icon: 'shapes_stroke', info: 'Shapes' },
            // Adjust, pointed at the paint layer (MPI-436) — one panel, one distance
            // field, two destinations. Last in the group for the same reason mask
            // Adjust is last in its own: it operates on paint that already exists.
            { mode: 'paintAdjust', icon: 'mask_adjust_stroke', info: 'Adjust' },
        ],
    },
    {
        mode: 'composite',
        label: 'Composite',
        // The THIRD and last group of the MPI-424 taxonomy (MPI-373). Its artifact is
        // a blended IMAGE, so it is a group rather than another Mask button, and it is
        // the only group that drops the PromptBox — it ends at its own Apply and needs
        // the column for its slots. THREE buttons, TWO panels: the first two are one
        // operation with two ways of supplying the cut. NOT a collapse: they are different
        // jobs, not the same job with different engines, which is the rule Detect is on
        // the other side of.
        group: [
            { mode: 'paintComp', icon: 'brush',  info: 'Paint Comp' },
            { mode: 'maskComp',  icon: 'layers', info: 'Mask Comp' },
            // Place (MPI-454) inverts the stack the other two share: the slot image goes
            // ON TOP at a size and angle a gizmo decides, and its own alpha is the cut —
            // no hole, no mask, nothing to brush. Same group because the artifact is the
            // same (a blended image), its own panel because nothing about the controls
            // overlaps. LAST, in the order the work happens: place the object, then cut
            // and blend.
            { mode: 'placeComp', icon: 'place_stroke', info: 'Place' },
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
    {
        mode: 'export',
        label: 'Export',
        group: [
            { mode: 'exportGif', icon: 'to_gif_stroke', info: 'Export GIF' },
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

        /** Collapse entries indexed by their `collapse` key (MPI-425). */
        const _collapseByKey = new Map();

        toolDefs.forEach(def => {
            _defsByMode.set(def.mode, def);
            if (def.group) def.group.forEach(sub => {
                // A collapse entry owns modes instead of being one. Its sub-modes
                // still map back to the outer group so setMode / setDisabled work
                // on them exactly as they did when they were rail buttons.
                if (sub.collapse) {
                    _collapseByKey.set(sub.collapse, sub);
                    (sub.sub || []).forEach(leaf => {
                        _defsByMode.set(leaf.mode, leaf);
                        _subToGroup.set(leaf.mode, def.mode);
                    });
                    return;
                }
                _defsByMode.set(sub.mode, sub);
                _subToGroup.set(sub.mode, def.mode);
            });
        });

        /** True when a collapse entry owns the currently active mode. */
        const _collapseOwnsActive = (def) => (def.sub || []).some(s => s.mode === _activeMode);

        /** Cleanup registry. */
        const _unsubs = [];

        // ── Rendering helpers ────────────────────────────────────────────────

        /**
         * Append a flat tool button into a slot. Each button gets its own wrapper
         * container so MpiButton.mount's innerHTML overwrite doesn't clobber siblings.
         */
        const _appendFlatButton = (def, slot) => {
            const key = def.mode || def.collapse;
            const prev = _buttons.get(key);
            if (prev) prev.destroy?.();

            const dstate = _disabledState.get(key);
            const isDisabled = !!dstate?.disabled;
            const tooltip = isDisabled && dstate?.reason ? dstate.reason : (def.info || key);

            const wrap = document.createElement('div');
            wrap.className = 'mpi-history-tools__btn';
            wrap.setAttribute('data-info', tooltip);
            slot.appendChild(wrap);

            const btn = MpiButton.mount(wrap, {
                icon: def.icon,
                size: 'sm',
                variant: 'ghost',
                info: tooltip,
                toggleable: false,
                // A collapse button shows active while any mode it owns is active,
                // but keeps its OWN fixed icon — it never takes on the identity of
                // the last-used method (MPI-425 decision 1).
                active: def.collapse ? _collapseOwnsActive(def) : _activeMode === def.mode,
                disabled: isDisabled,
                // Strip entries carry a text label; rail buttons stay icon-only and
                // name themselves through the hover tooltip.
                label: def.label || '',
                extraClasses: 'mpi-ibtn--rail',
            });

            const off = btn.on('click', () => {
                if (isDisabled) return;
                if (def.collapse) { _toggleStrip(def, wrap); return; }
                // Picking a method dismisses the strip it was picked from. Safe to
                // destroy this button inside its own handler: MpiButton's listener
                // ends on emit('click') and touches nothing afterwards.
                _closeStrip();
                _activate(def.mode);
            });
            _unsubs.push(off);

            _buttons.set(key, btn);
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
            // A mode living inside an OPEN collapse strip has its button there, not
            // in the rail column — re-render the strip instead of (only) the group.
            if (_stripDef && (_stripDef.sub || []).some(s => s.mode === toolMode)) {
                _renderStripSlot();
                return;
            }
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
            // Any tool activation dismisses an open collapse strip, including the
            // no-op re-activation of the mode that is already live.
            _closeStrip();
            if (_activeMode === newMode) return;
            const prev = _activeMode;
            _activeMode = newMode;

            if (prev && _buttons.has(prev)) {
                _buttons.get(prev)?.el.setActive?.(false);
            }
            if (_buttons.has(newMode)) {
                _buttons.get(newMode)?.el.setActive?.(true);
            }
            // A collapse button is active whenever one of ITS modes is.
            _collapseByKey.forEach((cdef, key) => {
                _buttons.get(key)?.el.setActive?.(_collapseOwnsActive(cdef));
            });

            emit('activate', { mode: newMode });
        };

        // ── Collapse strip (MPI-425) ─────────────────────────────────────────
        // A collapse button opens its sub-modes in a floating strip beside the rail
        // rather than stacking them in the column. Reuses MpiPopup exactly as the
        // hover tooltip below does (portals to body, position 'right', triggerEl) —
        // no new positioning code. Kept in its OWN variables: `_tip` is destroyed on
        // every hover and would take the strip with it.

        /** @type {object|null} live MpiPopup instance holding the strip. */
        let _strip = null;
        /** @type {object|null} the collapse def the open strip belongs to. */
        let _stripDef = null;
        /** The rail button wrapper the strip is anchored to. */
        let _stripAnchor = null;
        let _stripTimer = null;
        let _stripUnbindEsc = null;

        const _clearStripTimer = () => {
            if (_stripTimer) { clearTimeout(_stripTimer); _stripTimer = null; }
        };

        /** Start (or restart) the unhovered auto-dismiss countdown. */
        const _armStripTimer = () => {
            _clearStripTimer();
            if (!_strip) return;
            _stripTimer = setTimeout(() => _closeStrip(), STRIP_DISMISS_MS);
        };

        const _closeStrip = () => {
            _clearStripTimer();
            _stripUnbindEsc?.();
            _stripUnbindEsc = null;
            // The strip's buttons are registered in _buttons like any other; drop
            // them so a later setActive never reaches a detached instance.
            (_stripDef?.sub || []).forEach(s => {
                _buttons.get(s.mode)?.destroy?.();
                _buttons.delete(s.mode);
            });
            _strip?.destroy?.();
            _strip = null;
            _stripDef = null;
            _stripAnchor = null;
        };

        /** (Re)fill the open strip with one flat button per sub-mode. */
        const _renderStripSlot = () => {
            const slot = _strip && qs('.mpi-history-tools__strip', _strip.el);
            if (!slot) return;
            slot.innerHTML = '';
            (_stripDef.sub || []).forEach(sub => _appendFlatButton(sub, slot));
        };

        const _openStrip = (def, anchorEl) => {
            _closeStrip();
            _hideTip();

            const wrap = document.createElement('div');
            _strip = MpiPopup.mount(wrap, {
                active: true,
                position: 'right',
                variant: 'glass',
                triggerEl: anchorEl,
            }, `<div class="mpi-history-tools__strip"></div>`);
            _stripDef = def;
            _stripAnchor = anchorEl;
            _strip.el?.classList.add('mpi-popup--tool-strip');

            _renderStripSlot();

            // Hovering the strip holds it open; leaving it restarts the countdown.
            _strip.on('mouseenter', _clearStripTimer);
            _strip.on('mouseleave', _armStripTimer);

            // Bound only while open, so Escape keeps its normal meaning otherwise.
            // The workspace's own Escape handler already stands down while an
            // `.mpi-popup.is-active` is on screen (hotkeyManager escape context).
            _stripUnbindEsc = Hotkeys.bind('historyTools.collapseStrip.close', () => _closeStrip());

            // The countdown is NOT armed here. The pointer is still on the button
            // that was just clicked, and arming now would dismiss the strip out
            // from under a stationary cursor. `mouseout` on the anchor arms it —
            // the timer measures unhovered time, which is what it is for.
        };

        const _toggleStrip = (def, anchorEl) => {
            if (_stripDef === def) { _closeStrip(); return; }
            _openStrip(def, anchorEl);
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

        // ── Hover tooltip (MPI-264) ──────────────────────────────────────────
        // A floating name label on the RIGHT of the hovered rail button. Reuses
        // the MpiPopup primitive (portals to body, carets, entrance anim). One
        // live instance at a time, mounted per-hover because MpiPopup captures its
        // anchor at mount. Text = the button's [data-info] (the tool name).
        // mouseenter/leave don't bubble → delegate via mouseover/mouseout + closest.
        let _tip = null;

        const _hideTip = () => { _tip?.destroy?.(); _tip = null; };

        _unsubs.push(on(el, 'mouseover', (e) => {
            const btn = e.target.closest('.mpi-history-tools__btn');
            if (!btn || btn === _tip?._anchor) return;
            // The open strip anchors position:'right' off this same button — a
            // tooltip there would sit on top of it. Hovering the button also holds
            // the strip open, same as hovering the strip itself.
            if (btn === _stripAnchor) { _clearStripTimer(); _hideTip(); return; }
            _hideTip();
            const name = btn.getAttribute('data-info');
            if (!name) return;
            const label = document.createElement('span');
            label.textContent = name; // textContent-safe; names are internal
            // Mount into a throwaway wrapper — MpiPopup.mount() does
            // `container.innerHTML = html`, which would WIPE the button's icon if
            // we mounted into `btn`. The popup portals itself to body on setup;
            // `triggerEl: btn` is what actually anchors it.
            const wrap = document.createElement('div');
            _tip = MpiPopup.mount(wrap, {
                active: true,
                position: 'right',
                variant: 'glass',
                triggerEl: btn,
            }, label.outerHTML);
            _tip._anchor = btn;
            if (_tip.el) {
                // Compact-tooltip skin (smaller text + tighter padding). MpiPopup has
                // no size variant, so scope it via a modifier + our own stylesheet
                // rather than touching the shared primitive CSS.
                _tip.el.classList.add('mpi-popup--tip');
                // MpiPopup's built-in gap is small for a left-edge rail; nudge further right.
                _tip.el.style.left = `${parseFloat(_tip.el.style.left || 0) + 12}px`;
            }
        }));

        _unsubs.push(on(el, 'mouseout', (e) => {
            const btn = e.target.closest('.mpi-history-tools__btn');
            if (!btn) return;
            // Ignore moves that stay inside the same button (icon <-> wrapper).
            if (e.relatedTarget && e.relatedTarget.closest('.mpi-history-tools__btn') === btn) return;
            if (btn === _stripAnchor) _armStripTimer();
            _hideTip();
        }));

        // ── Initial mount ────────────────────────────────────────────────────

        toolDefs.forEach((def, i) => _mountTool(def, i === 0));

        // ── Teardown ─────────────────────────────────────────────────────────

        el.destroy = () => {
            _hideTip();
            _closeStrip();
            _unsubs.forEach(fn => fn?.());
            _buttons.forEach(btn => btn?.destroy?.());
            _buttons.clear();
            _subToGroup.clear();
            _collapseByKey.clear();
            _disabledState.clear();
        };
    },
});
