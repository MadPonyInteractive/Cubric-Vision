# History Workspace — Photoshop-Style Refactor

<!-- trackers
to-do-1: NIM-32
to-do-2: NIM-33
to-do-3: NIM-34
to-do-4: NIM-35
to-do-5: NIM-36
to-do-6: NIM-37
to-do-7: NIM-38
to-do-8: NIM-39
to-do-9: NIM-40
to-do-10: NIM-41
to-do-11: NIM-42
-->

## Goal

Rework the Group History workspace into a Photoshop-style layout with a left tool column, a right panel split into a props-bar (top) and a history list (bottom), and a PromptBox that stays at its current centre-bottom position but is toggled via the left toolbar. Consolidate overlapping picker components into one reusable compound. Remove the now-redundant selection-bar and bottom-slot action-bar choreography.

## Final layout (target)

```
┌──────┬─────────────────────────────┬──────────────────┐
│ Left │           Centre            │ Props bar (top)  │ ← swaps per activeTool; collapsed for prompt
│ Tool ├─────────────────────────────┼──────────────────┤
│ col  │ Canvas / Video viewer       │ History list     │ ← dims, ctrl/shift, right-click context menu
│      │                             │                  │
│      │ PromptBox (centre-bottom,   │                  │
│      │  toggled via CSS class)     │                  │
└──────┴─────────────────────────────┴──────────────────┘
```

Left toolbar order (top → bottom):
1. PromptBox toggle (`prompt`) — disabled when no model available for group type.
2. Crop (`crop`).
3. Mask group (opens `MpiOptionSelector` popup: manual / auto).
4. Interpolate (`interpolate`) — video groups only (disabled on image).
5. Video upscale (`videoUpscale`) — video groups only (disabled on image).

Radio behaviour: exactly one tool active at a time. `activeTool` is block-local; the `groupHistory` channel broadcasts `tool:activated` / `tool:deactivated`.

## Scope contract (from brainstorm)

- PromptBox shell service, Gallery workspace, Landing workspace — untouched.
- No hotkeys per tool (v1).
- No gallery multi-select (deferred).
- No existing users — no migration, no backwards compat.
- Every new/touched component follows `.claude/rules/*` (BEM, ComponentFactory, preloadStyles, types.js, `_unsubs[] + el.destroy`, floating-UI contract, no raw DOM/events/hotkeys, top-level state replacement).
- Every `.claude/rules/*` edit requires explicit user approval (cardinal rule 3).

## To-dos

### [ ] 1. Build `MpiOptionSelector` compound + migrate ratio/number consumers

Merge `MpiRatioSelector` + `MpiNumberSelector` into a single reusable compound at `js/components/Compounds/MpiOptionSelector/`. Supports:
- Generic `{ label, value, icon?, badge? }` option entries.
- Trigger button rendering; popup portaled to body; outside-click dismiss; `ui:close-all-popups` self-close; MutationObserver body cleanup; viewport clamp; popup z-index contract (9999); selected-option icon reflected on trigger.
- Modes/props sufficient to cover (a) ratio picker (preset list with orientation swap where needed — delegate orientation UI to caller via an optional `headerSlot`), (b) number picker (simple value list), (c) tool-group picker (icon + label list, used for mask manual/auto).
- Migrate **every** existing `MpiRatioSelector` + `MpiNumberSelector` call site (gallery ratio, history video crop ratio, upscale factor, upscale model dropdown where it composed with NumberSelector, interpolate multiplier, PromptBoxControls `batch` entry) to `MpiOptionSelector`. Delete `MpiRatioSelector` + `MpiNumberSelector` directories and their preloadStyles + types.js entries. Grep-clean all imports.
- Register CSS in `js/shell/preloadStyles.js`. Document props in `js/components/types.js`. Add to `js/pages/components.js` dev gallery with at least ratio, number, and tool-group demo instances.

**Verify:** Dev gallery (`test_styles: true`) renders three `MpiOptionSelector` demos; each opens a popup, selects a value, fires `change`. Then open an existing image project → gallery ratio selector works. Open a video group → crop ratio, upscale factor, upscale model, interpolate multiplier all work. `grep -r "MpiRatioSelector\|MpiNumberSelector" js/` returns nothing outside the dev gallery history comment.

### [ ] 2. Build `MpiContextMenu` compound

New floating-UI compound at `js/components/Compounds/MpiContextMenu/`. Props: `{ items: [{ key, icon?, label, disabled?, danger? }] }`. API: static `MpiContextMenu.show({ x, y, items, onSelect })` that portals to body, clamps to viewport, dismisses on outside-click / Escape / `ui:close-all-popups`, cleans up via MutationObserver, emits `select { key }` then self-closes. Register CSS in preloadStyles, document props in types.js, add dev gallery demo.

**Verify:** Dev gallery demo button opens a context menu at cursor with Delete + Compare entries; selecting an entry logs the chosen key to console; clicking outside closes; Escape closes. `console.log('[MpiContextMenu] select', key)` during `onSelect` is visible in devtools.

### [ ] 3. Rework `MpiHistoryList` — dimensions, ctrl/shift multi-select, right-click menu

Replace the current checkbox-based list with a Photoshop-style entry list:
- Each entry shows its dimensions (read from `item.width` / `item.height` if in memory; otherwise from sidecar via existing lookup — confirm path during implementation and add a `console.log('[MpiHistoryList] entry dims', { itemId, w, h, source })` for the first render). No date, no checkbox.
- Click: single-select (replaces selection).
- Ctrl/Cmd-click: toggle entry in selection; does not change anchor.
- Shift-click: range-select from anchor to clicked index; keeps anchor.
- Right-click on an entry: if the clicked entry is not in the current selection, replace selection with it; then open `MpiContextMenu` at cursor with:
  - `Delete` — always enabled.
  - `Compare` — enabled only when exactly 2 entries are selected **and** both are images (verify `MpiCompareOverlay` rejects video; if video compare is not supported, disable for video groups).
- Emits: `selection-changed { indices: number[], anchor: number }`, `open { index }` (unchanged open-on-click behaviour), `delete-selected { indices }`, `compare-requested { indices: [a, b] }`.
- `MpiSelectionBar` is NOT deleted yet (next to-do) — simply stop mounting it from this component's callers in this step if needed to keep the app runnable, OR leave the selection bar present-but-unused for now; the Block still mounts it, but `MpiHistoryList` no longer feeds it. Decide at implementation time which minimises broken intermediate state. Prefer: leave `MpiSelectionBar` mounted but hidden via `display: none` until to-do 4 deletes it.
- Update types.js props for the new emit shapes. Keep CSS in same file; rework BEM classes as needed.

Wire the new events in `MpiGroupHistoryBlock`:
- `delete-selected` → existing delete flow (same `MpiOkCancel` confirmation path currently triggered by `MpiSelectionBar`'s `delete` event).
- `compare-requested` → existing `MpiCompareOverlay` path currently triggered by `MpiSelectionBar`'s `compare` event.
- `selection-changed` → existing selection-sync logic (viewer mode reset, strategy `onSelectionChanged`).

**Verify:** Open an image group with ≥ 3 history entries. (a) Entries show `WxH` instead of date. (b) Click entry → viewer loads it. (c) Ctrl-click second entry → both highlighted. (d) Shift-click a later entry → range highlighted. (e) Right-click a highlighted entry with 2 selected → context menu shows Delete + Compare (both enabled). (f) Click Compare → `MpiCompareOverlay` opens with the 2 entries. (g) Right-click with 3 selected → Compare is disabled. (h) Click Delete → existing confirmation dialog opens; confirm → entries removed. Repeat on a video group; Compare disabled if video not supported.

### [ ] 4. Delete `MpiSelectionBar` and purge all references

Remove `js/components/Compounds/MpiSelectionBar/` directory, its CSS preload entry, its types.js typedef, and every import/mount in the codebase (gallery + group-history + anywhere else). Remove the `selectionBar` variable and the `#bottom-slot` selection-bar mount path from `MpiGroupHistoryBlock.js`. Remove the `groupHistory` channel reducer lines that show/hide `selectionBar`. Grep-verify nothing references `MpiSelectionBar`, `mpi-selection-bar`, or `selection-bar-slot` afterwards. If Gallery relied on `MpiSelectionBar` for its own selection UI, swap Gallery to the equivalent `MpiContextMenu` flow as part of this to-do (only if Gallery already relies on the bar — otherwise defer per scope contract). Verify first during implementation.

**Verify:** `grep -r "MpiSelectionBar\|mpi-selection-bar\|selectionbar-slot" js/ styles/` returns zero hits. App boots and navigating to both a gallery view and a group history view does not throw. Deleting entries from history still works via the context menu.

### [ ] 5. Rework `MpiGroupHistoryBlock` layout — props-bar host + right-panel split + activeTool reducer

Rewrite block template + CSS:
- New DOM: `#left-slot`, `#centre-slot`, `#right-top-slot` (props bar host), `#right-bottom-slot` (history list). Drop `#right-slot` and `#bottom-slot` as primary action-bar targets. Keep a single floating `#prompt-box-mount` container positioned centre-bottom exactly as today (existing CSS `.mpi-group-history-block__bottom` rules retained on a renamed element; PromptBox still managed by `PromptBoxService`).
- Grid: `grid-template-columns: 3.5rem 1fr 14rem;` unchanged outer width; inner right column becomes `display: grid; grid-template-rows: auto 1fr;` to stack props bar + history list. Same outer footprint, internal split only.
- Add a `setActiveTool(tool)` reducer inside the Block that:
  - Writes `_activeTool` (block-local).
  - Toggles `.mpi-group-history-block--prompt-active` on `el` (drives PromptBox visibility + props-bar collapsed state via CSS).
  - Mounts/unmounts the props-bar content via `strategy.mountPropsBar(tool, rightTopSlot)` (added in next to-do).
  - Emits on the `groupHistory` channel: `tool:activated { mode }` / `tool:deactivated { mode }` (keep existing event names for continuity).
- Keep the `MpiHistoryList` mount but target `#right-bottom-slot`.
- Keep `MpiHistoryTools` mount at `#left-slot`; its contents are reworked in to-do 7.
- Remove dead `#bottom-slot` action-bar mounts **stubbed**: for this step, have strategies log `console.log('[strategy] mountPropsBar called for', tool)` and render a placeholder `<div>Props bar: ${tool}</div>` into `#right-top-slot`; real content migrates in to-do 6.
- PromptBox visibility: when `_activeTool === 'prompt'`, remove hidden class; otherwise add hidden class. Props bar is hidden (CSS `display: none` via `--prompt-active` class) when prompt is active.

**Verify:** Open a group. Devtools shows the new DOM IDs. Resize doesn't break layout. Set `_activeTool` manually via the left toolbar (still works from to-do 1's existing toggle) → placeholder "Props bar: crop" appears in right-top when crop active; disappears/collapses and PromptBox shows when prompt active. Console shows `[strategy] mountPropsBar called for crop` etc. Right-bottom still shows the history list identically.

### [ ] 6. Migrate crop / mask / upscale / interpolate action bars into the props-bar host

Replace the placeholder from to-do 5. In `imageStrategy` and `videoStrategy`, implement `mountPropsBar(tool, slot)` that constructs the tool's `MpiToolActionBar` (with its `leftSlot` selectors now all `MpiOptionSelector` instances per to-do 1) and returns an instance + `destroy()`. Block calls `mountPropsBar` on activate, `destroy()` on deactivate. `MpiToolActionBar` is reused but mounted into `#right-top-slot`. Remove all residual `#bottom-slot` mounts, `_hideAllVideoBars`, and related channel reducer logic now that each tool owns its own mount/teardown cycle. Keep existing `MpiToolActionBar` emit contracts — the Block's existing action handlers (`snapshot`, `apply`, `cancel`, `run`, etc.) are re-pointed to the new props-bar instance without changing their body.

**Verify:** Image group — activate crop → crop action bar appears in right-top with ratio selector; apply/cancel work; deactivate → bar gone. Activate mask (pending to-do 7 tool-group popup — for now exercise whichever mask mode is currently wired) → mask controls appear. Video group — activate crop → ratio + snapshot/cancel/apply in right-top; activate videoUpscale → factor + model + cancel/run in right-top; activate interpolate → multiplier + cancel/run in right-top. All four video action paths still produce working outputs. `grep` confirms no code still references `#bottom-slot` for action bars (only PromptBox uses the floating centre-bottom container).

### [ ] 7. Rework `MpiHistoryTools` — PromptBox toggle, mask tool-group, disabled-state reactivity

Rework the compound:
- Accept a tool definition list where one entry can be a group: `{ mode: 'mask', icon: 'mask', info: 'Mask', group: [{ mode: 'maskManual', icon: ..., label: 'Manual Mask' }, { mode: 'maskAuto', icon: ..., label: 'Auto Mask' }] }`. Clicking a grouped entry opens `MpiOptionSelector` as a popup anchored to the button; choosing an option activates that sub-mode, updates the button's rendered icon to the last-used sub-tool (Photoshop behaviour), and closes the popup.
- Accept per-tool `disabled: boolean` and `disabledReason?: string` on definitions; disabled buttons render grayed-out, are non-interactive, and show `disabledReason` as tooltip (fallback to normal `info` if absent).
- Add a new top entry for `prompt` (before crop). Its activate/deactivate fire the same `activate`/`deactivate` emits with `mode: 'prompt'`, which the Block's reducer maps to PromptBox visibility.
- `MpiGroupHistoryBlock` builds the tool list per group type and per model availability:
  - Image group with ≥ 1 installed image model for the active operation → prompt enabled; else disabled with reason `Install an image model to enable prompts`.
  - Video group with ≥ 1 installed video model → prompt enabled; else disabled with same-style reason.
  - Image-only tools disabled on video; video-only tools disabled on image (grayed, not removed) — keeps layout stable.
- Subscribe inside the Block to `Events.onState('s_installedModelIds', ...)`, `Events.onState('s_selectedModelId', ...)`, and `Events.on('project:changed', ...)` — on each change, rebuild the tool list via `tools.el.setTools(newList)` (add this imperative setter on `MpiHistoryTools`). Collect unsubs in `_unsubs[]`.
- Update types.js for the new def shape and `setTools` method. Update dev gallery demo to show grouped + disabled states.
- Update `.claude/rules/component-events.md` locally in-memory (actual file edit deferred to to-do 11): track the new emit shape.

**Verify:** Open image group with a model installed → prompt button highlighted/active on load; click crop → crop activates, PromptBox hides, props bar shows crop. Click prompt → PromptBox reappears, props bar collapses. Click mask → popup appears with Manual + Auto; pick Auto → button icon updates, mask-auto mode active, props bar shows auto-mask controls. Uninstall all image models (or open a video group with no video model) → prompt button grayed with tooltip; clicking does nothing. Switch between image and video groups → video-only tools visible but disabled on image and vice-versa.

### [ ] 8. Finalise PromptBox visibility toggle + bottom-slot cleanup

The previous to-dos already toggle PromptBox via the `--prompt-active` class. In this step, make that the single source of truth:
- Remove any remaining imperative `PromptBoxService.hide()` / `show()` calls inside `MpiGroupHistoryBlock` that were part of the old bottom-bar swap. PromptBox visibility is driven purely by the CSS class now.
- Ensure PromptBox claim/release on workspace mount/unmount remains intact (gallery and group-history still claim on enter, release on `destroy`).
- Ensure `el.destroy` on the Block cleans up **all** `_unsubs`, including the new `Events.onState` subscriptions from to-do 7, the channel bus subscriptions, strategy-owned listeners, and child component destroys.
- Initial `activeTool` on mount: `prompt` for image groups with a model installed; `crop` for video groups (no prompt); `null` (nothing active, props bar empty, PromptBox hidden) for image groups with no model installed — PromptBox disabled button grays out, user picks another tool.

**Verify:** Open image group → PromptBox visible, prompt tool active. Switch tools → PromptBox hides crisply via CSS, no flicker. Navigate away (back to gallery) and back → no duplicate subscriptions (add a `console.log('[GroupHistoryBlock] destroy — unsubs:', _unsubs.length)` and confirm the count matches what was registered). Open a video group → crop is the default active tool; PromptBox stays hidden even when the user toggles tools off (prompt tool is disabled). Open image group with zero models → no tool active; PromptBox hidden; prompt button disabled with tooltip.

### [ ] 9. Cleanup sweep — dead code, dead events, `_unsubs` coverage, lint

- `grep -r "MpiSelectionBar\|MpiRatioSelector\|MpiNumberSelector\|selectionbar-slot\|#bottom-slot" js/ styles/` returns zero hits outside intentional new code.
- Run `/mpi-component-audit` (ESLint audit) on `js/components/`. Report violations — fix any in files touched during this refactor; file a follow-up note in the plan for violations in untouched files.
- Verify every modified component's `setup()` collects subscriptions into `_unsubs[]` and defines `el.destroy`. Add missing destroys.
- Remove dead CSS rules (any `.mpi-group-history-block__bottom--hidden` usages now unreachable, old right-slot styles, etc.).
- Remove dead types.js typedefs (SelectionBar, Ratio/Number selectors).

**Verify:** `/mpi-component-audit` output reviewed; app boots clean; `grep` verifications from above all return zero. Console on a full workspace visit (gallery → group history → switch tools → delete → compare → back) shows no warnings or errors.

### [ ] 10. Smoke test matrix + manual regression

Walk through every flow end-to-end and capture pass/fail in this plan file's `## Smoke Test Results` appendix (added at the bottom during this step):

- Image group, model installed: open, prompt active by default, type prompt, generate, entry lands in history, entry shows dimensions. Click crop → crop bar in right-top → apply → new entry. Click mask → popup → Manual → paint mask → generate inpaint. Click mask → popup → Auto → pick auto-mask thumb → generate. Click prompt → PromptBox returns. Ctrl+shift selection in history list. Context menu → Compare → overlay opens. Context menu → Delete → confirm → entries gone.
- Image group, no model installed: prompt disabled; other tools work; PromptBox hidden.
- Video group with video model: crop (ratio + snapshot/apply/cancel) works; upscale factor+model works; interpolate multiplier works; prompt disabled since there's no PromptBox for video.
- Video group with no video model: everything still navigable; no crashes.
- Navigation teardown: enter group history → switch tools several times → back to gallery → re-enter same group → no duplicate event handlers (check console log count from to-do 8 instrumentation).
- Memory sanity: repeat enter/leave 5× and confirm `_unsubs.length` stable (no growth), via the instrumentation from to-do 8.

**Verify:** Results appendix is populated with PASS for every row; any FAIL rows have a linked tracker or are resolved before this to-do is marked done.

### [ ] 11. Documentation + rules updates (requires user approval)

Ask the user explicitly: "Should I update `.claude/rules/*` and `docs/*` to reflect this refactor?" (cardinal rule 3). On approval, edit:

- `.claude/rules/workspaces.md` — Group History workspace description: right-panel split, new slot IDs (`#left-slot`, `#centre-slot`, `#right-top-slot`, `#right-bottom-slot`), PromptBox toggle mechanic driven by `--prompt-active` class, removal of the bottom-slot swap.
- `.claude/rules/component-mounts.md` — new `MpiOptionSelector`, `MpiContextMenu`, removed `MpiSelectionBar`, `MpiRatioSelector`, `MpiNumberSelector`. Update the `MpiGroupHistoryBlock` section to show new mount points and the props-bar mount contract. Update the `MpiGalleryBlock` section if its selection bar entry is now obsolete.
- `.claude/rules/component-events.md` — remove `MpiSelectionBar`, `MpiRatioSelector`, `MpiNumberSelector` entries; add `MpiOptionSelector`, `MpiContextMenu`; update `MpiHistoryTools` emit shape (grouped defs, `setTools` method); update `MpiHistoryList` emit shape (`selection-changed`, `delete-selected`, `compare-requested`).
- `.claude/rules/component-state.md` — note `groupHistory` channel events `tool:activated` / `tool:deactivated`; note block-local `_activeTool` (explicitly NOT a `state` key).
- `docs/workspaces.md` — rewrite the Group History section to match the new layout and mechanics.
- `docs/shell.md` — verify no change needed (PromptBoxService untouched); only edit if something drifted.
- `docs/PROJECT.md` — update cross-refs if any now-deleted doc sections were linked.

**Verify:** `git diff` on each edited file is reviewed with the user and matches the implementation. Re-read each file and confirm no stale references to deleted components/slots/events remain.

## Open questions (resolve during execution, not blockers)

- Compare tool for video groups: verified during to-do 3 when wiring `compare-requested`; if `MpiCompareOverlay` accepts two images only, the context menu disables Compare on video groups.
- Props-bar host: decided as a Block-owned slot (`#right-top-slot`) + `strategy.mountPropsBar` contract, not a new Compound. Keeps the dynamic content logic co-located with existing strategies.
- Disabled PromptBox button: gray + tooltip with reason text (`disabledReason`), not just gray.

## Smoke Test Results

_(populated during to-do 10)_
