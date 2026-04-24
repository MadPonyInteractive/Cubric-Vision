# History Workspace — Photoshop-Style Refactor

<!-- trackers
to-do-1: NIM-32
to-do-2: NIM-33
to-do-3: NIM-34
to-do-4: NIM-35
to-do-5: NIM-36
to-do-6: NIM-37 (done with caveats — see pivot notice)
to-do-7: NIM-38 (PIVOTED — rewritten 2026-04-24)
to-do-8: NIM-39
to-do-9: NIM-40
to-do-10: NIM-41
to-do-11: NIM-42
-->

## To-do 7 — Sub-commit progress log (live)

**Sub-commit 1a ✅ (2026-04-24):** `MpiOptionSelector` gained a third variant `buttons`. API: `buttons: [{icon, label?, value, info?}]`, `triggerIcon`, `triggerActive`, `popupTitle`, `info`; instance methods `setButtons`, `setTriggerIcon`, `setTriggerActive`, `getButtons`; emits `change {value, def}`. Drives the mask tool-group sub-menu in the rewritten `MpiHistoryTools`.

**Sub-commit 1b ✅ (2026-04-24):** 5 `MpiToolOptions*` components created — **placed in `js/components/Organisms/`**, NOT `Compounds/` as the plan text originally said. Reason: three of them (`Crop`, `Upscale`, `Interpolate`) import `MpiOptionSelector` (a Compound), which violates the Compound tier. Organisms can import Compounds + Primitives, so that is the correct tier. The 5 compound paths in §3 of to-do 7 should be read as `js/components/Organisms/MpiToolOptions<Name>/` everywhere below. CSS registered under the Organisms section of `preloadStyles.js`. Types.js typedefs tagged `(Organism — js/components/Organisms/...)`.

**Missing canvas-viewer API**: `MpiToolOptionsManualMask` + `MpiToolOptionsAutoMask` call methods that don't exist on `MpiCanvasViewer` yet. Sub-commit 3a must expose: `setMaskBrushMode(mode)`, `clearMask()`, `invertMask()`, `commitMask()`, `runCrop()` (promote internal `_runCrop`), `setAutoMaskModel(id)`, `setAutoMaskUseBox(bool)`, `runAutoMaskDetect()`, `commitAutoMask()`, `getAutoMaskThumbsEl()`. Calls in the new compounds already use `?.` optional chaining, so they no-op until exposed.

**DETECTION_MODELS duplication**: `MpiToolOptionsAutoMask` hard-codes `[yolov8, yolov11]` as a placeholder. Real list lives inside `MpiCanvasViewer.js`. Sub-commit 3 either exports the constant from canvas viewer + imports in the Organism, or exposes `viewer.el.getDetectionModels()`.

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

## ⚠ PIVOT NOTICE (2026-04-24)

To-dos 1–6 have been implemented using a strategy + channel-bus architecture. It works but is over-complicated and has caused repeated regressions (tool state ping-pong, bar mount duplication, stale overlays).

**To-dos 7, 8, 9 are rewritten** around a simpler mediator + self-contained `MpiToolOptions*` compounds. The old to-dos are preserved with `-SUPERSEDED` suffix — **DO NOT implement the superseded versions.** Read the pivoted to-do 7 in full. It:

- Deletes `imageStrategy.js` + `videoStrategy.js` entirely.
- Deletes `MpiToolActionBar` entirely — apply buttons live inside each `MpiToolOptions*` compound.
- Makes `MpiHistoryTools` the **single source of truth** for active mode (internal `_activeMode`, radio, sub-menus, disabled state, emits only `activate`).
- Replaces `setActiveTool` + channel bus with a flat `mountOptions(mode)` mediator in the Block.
- Creates 5 new `MpiToolOptions*` compounds (Crop, ManualMask, AutoMask, Upscale, Interpolate). Each owns its own controls + apply button + viewer-mode enter/exit lifecycle via setup/destroy.
- Kills `supportsPromptBox` / `supportsSelection`; PromptBox gated purely by `_opOptions()` / `_hasPromptOps()`.

Commit the current working state before starting the pivot.

## Vocabulary & invariants (read first — prevents repeat confusion)

- **`strategy.supportsPromptBox()`** — DEPRECATED flag, retained only for the current implementation transition. Do NOT add new code paths that branch on it. Video groups MUST be able to mount the PromptBox when the active video model exposes prompt-driven ops (v2v, extend-with-prompt, etc.) returned by `_opOptions()`. To-do 7 replaces this flag with a `hasPromptOps()` check driven by `_opOptions().length > 0` (filtered to operations the PromptBox serves). Until that refactor, the flag still gates the PromptBoxService wiring path but the plan's intent is: **PromptBox availability is a function of (active model, its operations), NOT strategy type.**
- **`strategy.supportsSelection()`** — both strategies return `true`. History selection (ctrl/shift/right-click) works on image AND video groups. Do NOT special-case selection per strategy. Do NOT delete this method.
- **History workspace is an EDIT workspace**, not a generation workspace. T2I / T2V belong to Gallery. History shows: image→image, video→video, extend, interpolate, upscale, mask-inpaint. Filter ops via `getAvailableCommands(mediaType, model, ctx)`.
- **Models are not fixed.** App will gain v2v, multi-image-edit, i2v models. Never hard-code assumptions about "image strategy = image ops only."
- **Tool list is built in the Block, not the strategy.** Strategy returns base tools; Block layers on per-model availability (prompt enabled/disabled, operation filter) before passing to `MpiHistoryTools`.
- **`#right-top-slot` layout:** grows vertically to fit contents (`height: auto`, `min-height: 0`). Buttons inside render **small** (`size: 'sm'` on `MpiButton`, compact padding on `MpiToolActionBar`). Content must never overflow horizontally — wrap or scroll vertically. Width is fixed by outer grid column (`14rem`).
- **Tools are non-toggleable on re-click.** A tool deactivates only when another tool activates (or workspace unmounts). `MpiHistoryTools` buttons set `toggleable: false`.
- **No `cancel` action on any tool bar.** Radio-style tools have no "off" state to fall back to — cancelling would leave `_activeTool` undefined with no UI to display. Users switch tools by picking another tool button. Destructive actions (apply/run/snapshot) commit; picking a different tool discards in-progress state (crop rect, mask strokes, etc.) via `strategy.onToolDeactivate(viewer, prevMode)` called by `setActiveTool`. Existing `cancel` action keys in `MpiToolActionBar` defs must be removed in to-do 6 (video bars) and to-do 7 (mask/auto-mask inside canvas viewer).

## To-dos

### [x] 1. Build `MpiOptionSelector` compound + migrate ratio/number consumers

Merge `MpiRatioSelector` + `MpiNumberSelector` into a single reusable compound at `js/components/Compounds/MpiOptionSelector/` with **three variants**. One component, one CSS file, one set of popup behaviours — no forks.

**Three variants:**
- `variant: 'ratio'` — preset ratio picker (replaces `MpiRatioSelector`). Preset list + orientation swap via optional `headerSlot`.
- `variant: 'number'` — value list picker (replaces `MpiNumberSelector`). Accepts `values: string[]`.
- `variant: 'buttons'` — generic button-list popup. Accepts `buttons: [{icon, label, value, info?}]`. Emits `change { value }` when any button is clicked. Consumed by `MpiHistoryTools` in to-do 7 for tool-group popups (mask manual/auto today, any future group later) and by anything else that needs trigger-button → popup-with-buttons.

**Shared behaviour across all variants:**
- Trigger button rendering; popup portaled to body; outside-click dismiss; `ui:close-all-popups` self-close; MutationObserver body cleanup; viewport clamp; popup z-index contract (9999); selected-option icon reflected on trigger (ratio + number) or last-used icon (buttons — persisted in-memory by caller, compound exposes `setTriggerIcon(icon)` imperative setter).

**Migration:**
- Migrate **every** existing `MpiRatioSelector` + `MpiNumberSelector` call site (gallery ratio, history video crop ratio, upscale factor, upscale model dropdown where it composed with NumberSelector, interpolate multiplier, PromptBoxControls `batch` entry) to the matching variant of `MpiOptionSelector`.
- Delete `MpiRatioSelector` + `MpiNumberSelector` directories and their preloadStyles + types.js entries. Grep-clean all imports.
- Register CSS in `js/shell/preloadStyles.js`. Document props in `js/components/types.js` (cover all three variants in the typedef). Add to `js/pages/components.js` dev gallery with demos for **all three variants** (ratio, number, buttons).

**Verify:** Dev gallery (`test_styles: true`) renders all three `MpiOptionSelector` variants (ratio, number, buttons); each opens a popup, selects a value, fires `change`. Buttons variant demo should show 2–3 mock tool buttons. Then open an existing image project → gallery ratio selector works. Open a video group → crop ratio, upscale factor, upscale model, interpolate multiplier all work. `grep -r "MpiRatioSelector\|MpiNumberSelector" js/` returns nothing outside the dev gallery history comment.

> **Retro note (post-implementation):** The initial `buttons` variant was implemented with *hard-coded* button definitions at call sites. To-do 7 requires grouped tool defs to be **dynamically injected** from `MpiHistoryTools`. If the current `buttons` variant does not already accept an array of `{icon, label, value, info?}` at mount-time AND expose `setButtons(buttons)` for runtime replacement, to-do 7 must extend it before use — do NOT fork a new variant, do NOT hard-code mask entries inside `MpiOptionSelector`. The trigger icon must also update dynamically from the last-picked sub-tool via `setTriggerIcon(icon)`.

### [x] 2. Build `MpiContextMenu` compound

New floating-UI compound at `js/components/Compounds/MpiContextMenu/`. Props: `{ items: [{ key, icon?, label, disabled?, danger? }] }`. API: static `MpiContextMenu.show({ x, y, items, onSelect })` that portals to body, clamps to viewport, dismisses on outside-click / Escape / `ui:close-all-popups`, cleans up via MutationObserver, emits `select { key }` then self-closes. Register CSS in preloadStyles, document props in types.js, add dev gallery demo.

**Verify:** Dev gallery demo button opens a context menu at cursor with Delete + Compare entries; selecting an entry logs the chosen key to console; clicking outside closes; Escape closes. `console.log('[MpiContextMenu] select', key)` during `onSelect` is visible in devtools.

### [x] 3. Rework `MpiHistoryList` — dimensions, ctrl/shift multi-select, right-click menu

Replace the current checkbox-based list with a Photoshop-style entry list:
- Each entry shows its dimensions (read from `item.width` / `item.height` if in memory; otherwise from sidecar via existing lookup — confirm path during implementation and add a `console.log('[MpiHistoryList] entry dims', { itemId, w, h, source })` for the first render). No date, no checkbox.
- Click: single-select (replaces selection).
- Ctrl/Cmd-click: toggle entry in selection; does not change anchor.
- Shift-click: range-select from anchor to clicked index; keeps anchor.
- Right-click on an entry: if the clicked entry is not in the current selection, replace selection with it; then open `MpiContextMenu` at cursor with:
  - `Delete` — always enabled.
  - `Compare` — enabled only when exactly 2 entries are selected **and** both are images (verify `MpiCompareOverlay` rejects video; if video compare is not supported, disable for video groups).
- **Dev-mode gating for native Electron menu:** right-click handler reads `dev_mode` flag from `dev_configs/app_config.js` (confirm exact key name — likely `test_styles` or `dev_mode`). If truthy → skip `preventDefault()`, let Electron's native context menu render so inspect-element keeps working. Else → `e.preventDefault()` and call `MpiContextMenu.show()`. Hook only on the `contextmenu` event; do NOT intercept `mousedown` or `dragstart` — preserves future history-card drag-to-PromptBox capability (deferred, see Deferred section).
- Emits: `selection-changed { indices: number[], anchor: number }`, `open { index }` (unchanged open-on-click behaviour), `delete-selected { indices }`, `compare-requested { indices: [a, b] }`.
- `MpiSelectionBar` is NOT deleted yet (next to-do) — simply stop mounting it from this component's callers in this step if needed to keep the app runnable, OR leave the selection bar present-but-unused for now; the Block still mounts it, but `MpiHistoryList` no longer feeds it. Decide at implementation time which minimises broken intermediate state. Prefer: leave `MpiSelectionBar` mounted but hidden via `display: none` until to-do 4 deletes it.
- Update types.js props for the new emit shapes. Keep CSS in same file; rework BEM classes as needed.

Wire the new events in `MpiGroupHistoryBlock`:
- `delete-selected` → existing delete flow (same `MpiOkCancel` confirmation path currently triggered by `MpiSelectionBar`'s `delete` event).
- `compare-requested` → existing `MpiCompareOverlay` path currently triggered by `MpiSelectionBar`'s `compare` event.
- `selection-changed` → existing selection-sync logic (viewer mode reset, strategy `onSelectionChanged`).

**Verify:** Open an image group with ≥ 3 history entries. (a) Entries show `WxH` instead of date. (b) Click entry → viewer loads it. (c) Ctrl-click second entry → both highlighted. (d) Shift-click a later entry → range highlighted. (e) Right-click a highlighted entry with 2 selected → context menu shows Delete + Compare (both enabled). (f) Click Compare → `MpiCompareOverlay` opens with the 2 entries. (g) Right-click with 3 selected → Compare is disabled. (h) Click Delete → existing confirmation dialog opens; confirm → entries removed. Repeat on a video group; Compare disabled if video not supported.

### [x] 4a. Remove `MpiSelectionBar` from `MpiGroupHistoryBlock` (done)

GroupHistory removal complete. See commit f03d0ff.

### [x] 4b. Replace `MpiSelectionBar` in Gallery with ctrl/shift/right-click pattern + delete `MpiSelectionBar` entirely

**Gallery new interaction model:**
- Checkbox removed from cards completely (remove `MpiCheckbox` mount + `.mpi-group-card__select-wrap` slot from `MpiGalleryGrid`).
- Normal click (no modifier, not in selection mode) → opens group (existing `open` emit, unchanged).
- Ctrl/Cmd-click → toggle card in selection; if first selection enters selection mode.
- Shift-click → range-select from anchor to clicked card (by rendered DOM order / index).
- Plain click **in selection mode** → toggles card (does NOT open group).
- Selection mode exits when: (A) selection count reaches 0 via toggles, OR (B) Escape key pressed — call `Hotkeys.register('Escape', exitFn)` on selection-mode enter, `Hotkeys.unregister` on exit.
- Right-click on any card → `MpiContextMenu.show({ x, y, items, onSelect })` with:
  - `Compare` — enabled only when exactly 2 cards selected; disabled otherwise.
  - `Download` — always enabled.
  - `Delete` — always enabled.
  - If right-clicked card is not in selection, replace selection with it first (same pattern as `MpiHistoryList`).
- `dev_mode` gate: read `dev_configs/app_config.js` flag (confirm key name). If truthy → skip `e.preventDefault()` on contextmenu so Electron inspect-element works. Else → `e.preventDefault()` + show `MpiContextMenu`.
- `compare` action → existing `MpiCompareOverlay` path currently wired in `MpiGalleryBlock` via `selectionBar.on('compare')`.
- `download` action → existing `downloadMediaFiles` path currently wired via `selectionBar.on('download')`.
- `delete` action → existing delete flow currently wired via `selectionBar.on('delete')`.
- `selection-start` / `selection-end` events on `MpiGalleryGrid` retained (still drive `PromptBoxService.hide/show` in `MpiGalleryBlock`).
- Remove `mpi-gallery-grid__selectionbar-slot` div from `MpiGalleryGrid` template.
- Remove `MpiSelectionBar` import, mount, and all `selectionBar.*` calls from `MpiGalleryBlock`.
- Remove `MpiCheckbox` import from `MpiGalleryGrid` if no longer used elsewhere in that file.

**Delete `MpiSelectionBar` entirely:**
- Delete `js/components/Compounds/MpiSelectionBar/` directory (both files).
- Remove `'js/components/Compounds/MpiSelectionBar/MpiSelectionBar.css'` from `js/shell/preloadStyles.js`.
- Remove `MpiSelectionBarProps` typedef block from `js/components/types.js`.

**Verify:** `grep -r "MpiSelectionBar\|mpi-selection-bar\|selectionbar-slot" js/ styles/` returns zero hits. `ls js/components/Compounds/MpiSelectionBar/` returns not-found. Gallery: ctrl-click card → selected state visible (CSS highlight). Shift-click second card → both selected. Right-click → context menu appears. With 2 selected → Compare enabled; click → compare overlay opens. With 1 or 3 selected → Compare disabled. Download → files download. Delete → confirm dialog → cards removed. Escape exits selection. Plain click in selection mode toggles, not opens. App boots with no console errors.

### [x] 5. Rework `MpiGroupHistoryBlock` layout — props-bar host + right-panel split + activeTool reducer

Rewrite block template + CSS:
- New DOM: `#left-slot`, `#centre-slot`, `#right-top-slot` (props bar host), `#right-bottom-slot` (history list). Drop `#right-slot` and `#bottom-slot` as primary action-bar targets. Keep a single floating `#prompt-box-mount` container positioned centre-bottom exactly as today (existing CSS `.mpi-group-history-block__bottom` rules retained on a renamed element; PromptBox still managed by `PromptBoxService`).
- Grid: `grid-template-columns: 3.5rem 1fr 14rem;` unchanged outer width; inner right column becomes `display: grid; grid-template-rows: auto 1fr;` to stack props bar + history list. Same outer footprint, internal split only.
- `#right-top-slot` = `height: auto; min-height: 0; display: flex; flex-direction: column;` — expands vertically to fit whatever tool mounts inside. Width capped by the `14rem` column. Tool content uses `size: 'sm'` buttons + wrap on overflow.
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

> **Retro note (post-implementation):** The canvas viewer's internal tool bars (crop/mask/automask) were routed into `#right-top-slot` via a new `barContainer` prop on `MpiCanvasViewer`. This means **image strategy does NOT implement `mountPropsBar`** — it returns `null`. Only the **video strategy** actually mounts bars via `mountPropsBar` (to-do 6). Do not try to "unify" image into `mountPropsBar`; that was rejected and caused duplicate bars. The old `#bottom-slot` div for video bars was left in place temporarily with a note — to-do 6 removes it.

### [x] 6. Delete `#bottom-slot` video bars — video bars mount into `#right-top-slot` via `strategy.mountPropsBar`

> **Done with caveats.** Image + video groups both render tool bars in `#right-top-slot` now. Works end-to-end. However, the underlying architecture (strategy + channel bus + `setActiveTool`) is slated for replacement in the pivoted to-do 7 — much of what this to-do built will be deleted. The working behaviour carries over; only the plumbing changes.

**Current state (post to-do 5, post two failed attempts):**
- Image strategy: `MpiCanvasViewer` already owns its own tool bars (crop, manual-mask, auto-mask) and routes them via `barContainer` prop to `#right-top-slot`. **Image strategy's `mountPropsBar` is a no-op** (returns `null`). Do not duplicate bars — canvas viewer is authoritative for image tool UIs.
- Video strategy: action bars (crop/upscale/interpolate) are still built eagerly in `MpiGroupHistoryBlock.setup` inside the `if (!strategy.supportsPromptBox())` branch and mounted into an ad-hoc `#bottom-slot` div, then shown/hidden via `_hideAllVideoBars` + `bar.on('tool:activated')`. This `#bottom-slot` must be deleted.

**Target state:**
- `videoStrategy.mountPropsBar(tool, slot, ctx)` lazily constructs the `MpiToolActionBar` for the requested tool, mounts into the passed `slot` (= `#right-top-slot`), returns `{ el, destroy }`. Called by the Block's `setActiveTool` on activate. Previous instance is destroyed before mounting the new one.
- `imageStrategy.mountPropsBar(tool, slot, ctx)` returns `null` (image bars live inside `MpiCanvasViewer` via `barContainer`). Keeps contract symmetric so the Block doesn't branch on strategy type.
- `ctx` passed to `mountPropsBar` includes (as getters or live refs, never snapshots): `getGroup()`, `getCurrentIdx()`, `viewer`, `bar` (channel), `historyTools`, `state`, `_runVideoTool`, `_handleCropSnapshot`, `_handleCropSaveVideo`, `resolveMediaUrl`, `SOCIAL_RATIOS`, `_universalToolIcons`, `loadAssets`.
- `#bottom-slot` element is removed from the block DOM entirely. `_hideAllVideoBars` is deleted. Channel reducer branches that called it are simplified — `setActiveTool` alone drives the mount/unmount.
- **`#right-top-slot` CSS:** `height: auto; min-height: 0; display: flex; flex-direction: column;` so it expands to fit whatever `mountPropsBar` puts inside. Buttons in video bars render at `size: 'sm'` (compact) — existing `MpiToolActionBar` action defs in the Block must be updated accordingly. No horizontal overflow — wrap `leftSlot` (ratio + model dropdown for upscale) using `flex-wrap: wrap` inside the bar if it exceeds `14rem`.
- PromptBox toggle + `--prompt-active` class unchanged from to-do 5.
- **Tool `prompt` has no props bar.** When `_activeTool === 'prompt'`, `setActiveTool` destroys the previous props-bar instance, does NOT call `mountPropsBar`, and relies on CSS to hide `#right-top-slot` via `.mpi-group-history-block--prompt-active #right-top-slot { display: none; }`.

**Files touched:**
- `js/components/Blocks/MpiGroupHistoryBlock/strategies/videoStrategy.js` — add `mountPropsBar`, import `MpiToolActionBar` + `MpiOptionSelector` + `MpiDropdown`.
- `js/components/Blocks/MpiGroupHistoryBlock/strategies/imageStrategy.js` — add `mountPropsBar` stub returning `null`.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — delete `#bottom-slot` creation + all video-bar vars (`_cropBar`, `_ratioSel`, `_upscaleBar`, `_upscaleFactorSel`, `_upscaleModelDd`, `_upscaleModelValue`, `_interpolateBar`, `_interpMultiplierSel`, `_hideAllVideoBars`). Rewrite `setActiveTool` to call `strategy.mountPropsBar(tool, rightTopSlot, ctx)`, track `_propsBarInstance`, destroy on every change. Pass `_runVideoTool`, `_handleCropSnapshot`, `_handleCropSaveVideo` via ctx (move function defs above `setActiveTool` if needed).
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.css` — add `#right-top-slot` height/flex rules + prompt-active hide rule.

**Cancel-button removal scope:** to-do 6 removes `cancel` from **video** bars only (crop/upscale/interpolate). Image tool bars (crop/manual-mask/auto-mask) live inside `MpiCanvasViewer` — their `cancel` buttons are removed in **to-do 7** as part of the mask-tool-group + canvas-viewer bar rework. If you discover a `cancel` still present on any video bar after to-do 6, that's a bug; image-bar cancels are expected until to-do 7.

**Explicit non-goals (do NOT do these — caused prior failures):**
- Do NOT touch `supportsSelection` or `supportsPromptBox` methods.
- Do NOT delete or rename the image strategy's canvas-viewer `barContainer` wiring.
- Do NOT mount image action bars into `#right-top-slot` directly — canvas viewer owns them.
- Do NOT remove the `prompt` tool entry from `toolsFor()`; that's a to-do 7 concern.
- Do NOT add the `mask` tool-group popup — to-do 7.
- Do NOT wire `MpiHistoryTools` disabled states — to-do 7.

**Verify:**
- Open **video group**. Click crop → right-top-slot expands vertically, shows `MpiOptionSelector` (ratio) + `snapshot / apply` buttons at small size, all fit inside `14rem` column (wrap if needed). No `cancel` action. No `#bottom-slot` element anywhere in DOM.
- Click videoUpscale → right-top-slot re-renders with factor selector + model dropdown + `run` button only. Factor selector popup opens and selects a value. Running upscale triggers real generation. Picking a different tool mid-configuration discards state (upscale params) and exits viewer upscale mode via `strategy.onToolDeactivate`.
- Click interpolate → right-top-slot shows multiplier + `run` only. Run triggers real generation. Switching away exits interpolate mode without a cancel button.
- Switch between the three video tools repeatedly → only one bar present at a time; previous bar fully destroyed (inspect DOM + check no listener leaks via `_unsubs.length` stable).
- Cancel in any video tool → bar destroyed, `_activeTool` cleared, `#right-top-slot` empty.
- Open **image group**. Click crop → crop bar appears where canvas viewer's `barContainer` routes it (`#right-top-slot`). Click prompt → bar hidden via `--prompt-active` CSS, PromptBox shown. Switch crop ↔ mask ↔ prompt → no duplicate bars, no flicker.
- `grep -r "#bottom-slot\|bottom-slot\|_hideAllVideoBars" js/ styles/` returns zero hits.
- Navigate group-history → gallery → group-history → `_unsubs.length` stable across re-entries.

> **PIVOT (2026-04-24):** The strategy + channel-bus + `setActiveTool` system built in to-dos 5–6 works but is over-complicated and has produced three bugs in two sessions. To-dos 7–9 are **rewritten below** around a simpler mediator + self-contained `MpiToolOptions*` compounds. Earlier to-do 7 text is preserved for history at the bottom under `## Superseded (pre-pivot) to-dos`. Do NOT implement the superseded version.

### [ ] 7. PIVOT — Rip out strategies + channel bus; per-tool `MpiToolOptions*` compounds; `MpiHistoryTools` is the single source of truth for active mode

**Motivation:** "one of the main goals was less complicated." Current flow hops click → `historyTools.activate` → `strategy.onToolActivate` → `viewer.el.enterMode` → `mode-changed` event → `bar.tool:activated` channel → `setActiveTool` → maybe re-fires back to `tool:deactivated` → clobbers state. Three bugs came from this ping-pong. Replace with a flat mediator.

**New architecture:**

#### 1. `MpiHistoryTools` — self-contained radio with sub-menus
- Owns `_activeMode` internally. Single source of truth for what tool is active.
- Radio: exactly one selected. Re-click on active = no-op.
- Accepts `mode: 'image' | 'video'` prop. Compound builds its own button list internally from this prop (no `toolsFor()` in strategies, no list passed from Block).
- Sub-menu support: tool def can declare `group: [{ mode, icon, label, info? }, ...]`. Grouped tool renders a trigger button; click opens a popup with the sub-options; picking a sub-tool activates that sub-mode and the trigger icon updates to the picked sub-tool's icon (persisted in-memory until workspace unmounts).
- Disabled support: per-button `disabled: boolean` + `disabledReason?: string`. Disabled buttons render grayed, are non-interactive, show tooltip. Block recomputes disabled state from `_opOptions()` + installed models and calls `tools.el.setDisabled({ [mode]: { disabled, reason } })`.
- API:
  - `el.setMode(mode)` — set active mode programmatically (for initial mount + external sync). Emits `activate { mode }` same as user click.
  - `el.setDisabled(map)` — bulk update disabled state.
  - `el.getActiveMode()` — read current mode.
- Emits: `activate { mode }` on any mode change (click or `setMode`). No `deactivate` event — radio switch emits only `activate`.
- Built-in image mode tool list: `prompt`, `crop`, `mask` (group: `maskManual`, `maskAuto`), future additions go here.
- Built-in video mode tool list: `prompt`, `crop`, `videoUpscale`, `interpolate`.

#### 2. Delete `MpiToolActionBar` entirely
- Grep for all usages, remove.
- Apply buttons move **inside** each `MpiToolOptions*` compound. Each options compound is self-contained: controls + apply button in one DOM template.
- Remove preloadStyles entry + types.js typedef.

#### 3. New `MpiToolOptions*` compounds (one per tool)
Path: `js/components/Organisms/MpiToolOptions<Name>/` (tier change from the original plan text — see sub-commit 1b log at top).

Each compound:
- Accepts `{ viewer, onApply }` props.
- On `setup`: enters the viewer's corresponding mode (e.g. `viewer.el.enterCropMode()` for `MpiToolOptionsCrop`). Wires viewer events it cares about.
- Template: own controls + its own apply button (if the tool produces a result). No `cancel` anywhere — switching tools auto-exits via `destroy`.
- On `destroy` (called by mediator on tool switch): exits viewer mode (`viewer.el.exitCropMode()`), cleans up its own subscriptions, removes DOM.
- Emits `apply { ...params }` which the mediator forwards to the Block's handler.
- No cross-talk with other compounds. No channel events. No strategy hooks.

Compounds to create:
- `MpiToolOptionsCrop` — ratio selector (via `MpiOptionSelector`) + apply. Works for both image and video viewers — the viewer knows its own crop implementation; compound only forwards ratio + fires `apply`. Second toolbar button for video-only `snapshot` action optional here.
- `MpiToolOptionsManualMask` — brush/eraser/clear/invert + apply.
- `MpiToolOptionsAutoMask` — detection-model dropdown, box/segment radio, thumbs strip, detect + apply.
- `MpiToolOptionsUpscale` — factor selector + model dropdown + run (apply).
- `MpiToolOptionsInterpolate` — multiplier selector + run (apply).
- `MpiToolOptionsPrompt` — **does not exist.** The PromptBox is not a right-top-slot component; it's shell-managed. Mediator handles `prompt` mode specially (see §4).

Register each compound's CSS in `preloadStyles.js`. Add typedef to `types.js`. Add dev gallery demos.

#### 4. Mediator — lives inside `MpiGroupHistoryBlock`
Flat reducer, ~20 lines:

```js
let _options = null;   // currently-mounted MpiToolOptions* instance
const slot = qs('#right-top-slot', el);

function mountOptions(mode) {
    _options?.destroy?.();
    _options = null;
    slot.innerHTML = '';
    el.classList.toggle('mpi-group-history-block--prompt-active', mode === 'prompt');
    if (mode === 'prompt') { PromptBoxService.show(); return; }
    PromptBoxService.hide();
    if (mode === null) return;
    const Compound = TOOL_OPTIONS_REGISTRY[mode];  // small map in Block
    if (!Compound) return;
    _options = Compound.mount(slot, { viewer, onApply: payload => _handleApply(mode, payload) });
}

historyTools.on('activate', ({ mode }) => mountOptions(mode));
```

Where `TOOL_OPTIONS_REGISTRY`:
```js
{
    crop:         MpiToolOptionsCrop,
    maskManual:   MpiToolOptionsManualMask,
    maskAuto:     MpiToolOptionsAutoMask,
    videoUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
}
```

`_handleApply(mode, payload)` routes to the real generation/crop/etc call already living in the Block (`_runGenerate`, `_runVideoTool`, `_handleCropSaveVideo`, `_handleCropSnapshot`, etc.). Those functions stay — just the plumbing around them simplifies.

#### 5. Delete strategies
- Delete `js/components/Blocks/MpiGroupHistoryBlock/strategies/imageStrategy.js` + `videoStrategy.js`.
- Block directly chooses viewer:
  ```js
  const isVideo = _group.type === 'video';
  const viewer = isVideo
      ? MpiVideoViewer.mount(qs('#centre-slot', el), { fps: 24, controls: true })
      : MpiCanvasViewer.mount(qs('#centre-slot', el), { initialImageUrl: resolveMediaUrl(_group.history[_currentIdx]?.filePath), initialIdx: _currentIdx });
  ```
- The existing `loadInitial` / `loadEntry` / `onGenerationPreview` / `onGenerationComplete` / `onRehydratePreview` logic from strategies moves into small inline helpers in the Block (or into the viewers themselves where obviously owned). 5 helpers × ~4 lines each; simpler than two strategy files + branching.
- `onSelectionChanged` / `onSelectionExited` / `onSelectionDelete` — inline in Block's `historyList.on(...)` handlers with a small `isVideo` branch where needed.

#### 6. Delete channel bus usage for tool state
- `Events.channel('groupHistory')` for `tool:activated` / `tool:deactivated` — delete. `MpiHistoryTools.activate` event is the only signal.
- Keep `selection:enter` / `selection:exit` via channel only if another component outside the Block listens (check with grep — if only the Block listens, delete and inline).

#### 7. Kill `strategy.supportsPromptBox()` — PromptBox gated by active model's ops
- New Block helper `_hasPromptOps()` returns `true` iff `_opOptions()` contains at least one enabled op the PromptBox serves (`i2i`, `inpaint`, `v2v`, `extend-with-prompt`, etc.).
- Mount/claim PromptBox iff `_hasPromptOps()`. Unmount/release if becomes false after model change.
- `prompt` tool button in `MpiHistoryTools` — disabled with `disabledReason: 'No prompt-driven ops available for this model'` when `_hasPromptOps()` is false.
- Subscribe to `Events.onState('s_installedModelIds', ...)`, `Events.onState('s_selectedModelId', ...)`, `Events.on('project:changed', ...)`. On each: recompute `_hasPromptOps()`, call `historyTools.el.setDisabled({ prompt: { disabled: !has, reason: ... } })`, mount/unmount PromptBox as needed.
- Remove `supportsPromptBox` and `supportsSelection` flags entirely.

#### 8. Initial mode on mount
- Image group with `_hasPromptOps()` true → `historyTools.el.setMode('prompt')` on mount → PromptBox visible, slot hidden via `--prompt-active`.
- Image group with `_hasPromptOps()` false → `historyTools.el.setMode('crop')` → crop options in slot.
- Video group: same rule. If video model has prompt ops → `prompt`; else → `crop`.

#### 9. No cancel buttons anywhere
- Radio-style: switching tools destroys prev `MpiToolOptions*` → its `destroy()` exits viewer mode cleanly. No cancel action on any compound.

**Files touched:**
- Delete: `strategies/imageStrategy.js`, `strategies/videoStrategy.js`.
- Delete: `js/components/Compounds/MpiToolActionBar/` (whole directory).
- Create: `js/components/Organisms/MpiToolOptionsCrop/`, `MpiToolOptionsManualMask/`, `MpiToolOptionsAutoMask/`, `MpiToolOptionsUpscale/`, `MpiToolOptionsInterpolate/` (each: `.js` + `.css`).
- Rewrite: `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js` — accept `mode` prop, build internal tool list, sub-menu support via `MpiOptionSelector buttons` variant, `setMode` / `setDisabled` / `getActiveMode` API, emit only `activate`.
- Rewrite: `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — viewer mount inline, mediator replaces `setActiveTool`, strategy imports deleted, channel `tool:*` events deleted, `_opOptions` + `_hasPromptOps` drive PromptBox + prompt-button-disabled.
- Update: `js/shell/preloadStyles.js` — register new `MpiToolOptions*` CSS, drop `MpiToolActionBar`.
- Update: `js/components/types.js` — add typedefs for each `MpiToolOptions*`, drop `MpiToolActionBar`.
- Update: `js/pages/components.js` — dev gallery demos for each new compound.
- Update: `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — the three internal `MpiToolActionBar.mount` calls for crop/mask/autoMask are **deleted**. Canvas viewer no longer owns any bar UI. Options compounds own the bar UI + call `viewer.el.enterCropMode()` etc. Canvas viewer keeps its `enterMode` / `exitMode` + internal canvas state machine.

**Explicit non-goals (do NOT do these):**
- Do NOT keep `MpiToolActionBar`. Options compounds own their apply buttons.
- Do NOT keep strategies. Delete entirely.
- Do NOT keep the channel bus `tool:activated` / `tool:deactivated` events.
- Do NOT add cancel buttons.
- Do NOT let canvas viewer render its own tool bars — bars belong to `MpiToolOptions*`.
- Do NOT mount PromptBox based on strategy type; only `_hasPromptOps()`.

**Verify (end-to-end, image group with prompt-op model):**
- Open → prompt button active, PromptBox visible, slot hidden.
- Click crop → PromptBox gone, slot shows `MpiToolOptionsCrop` (ratio + apply). Crop overlay on image. Click apply → new history entry.
- Click mask → popup with Manual + Auto. Pick Manual → slot shows `MpiToolOptionsManualMask` (brush/eraser/clear/invert + apply). Paint + apply → mask ready.
- Pick Auto → slot shows `MpiToolOptionsAutoMask` (detection dropdown, box/segment radio, thumbs, detect + apply). Detect + apply → mask ready.
- Click prompt → PromptBox back, slot hidden. All canvas overlays gone.
- Re-click active tool → no-op.
- Switch tools rapidly → no duplicate bars, no lingering overlays, `_options?.destroy?.()` runs every switch.

**Verify (video group with video model that has prompt ops):**
- Open → prompt button active, PromptBox visible.
- Click crop → `MpiToolOptionsCrop` with snapshot + apply. Crop overlay on video.
- Click upscale → `MpiToolOptionsUpscale` with factor + model + run. Run fires generation.
- Click interpolate → `MpiToolOptionsInterpolate` with multiplier + run.

**Verify (video group without prompt ops):**
- Open → crop active (prompt disabled, grayed). PromptBox never mounts.

**Verify (cleanup):**
- `grep -r "MpiToolActionBar\|imageStrategy\|videoStrategy\|supportsPromptBox\|supportsSelection\|groupHistory.*channel" js/` → zero hits.
- Navigation in/out 5× — `_unsubs` count stable; no listener leaks.

### [ ] 8. (superseded by pivoted to-do 7 — merged)

Contents moved into to-do 7's §7 and §8. Keep this row marked done after to-do 7 lands.

### [ ] 9. Cleanup sweep — dead code, dead events, `_unsubs` coverage, lint

- `grep -r "MpiSelectionBar\|MpiRatioSelector\|MpiNumberSelector\|MpiToolActionBar\|imageStrategy\|videoStrategy\|supportsPromptBox\|supportsSelection\|selectionbar-slot\|#bottom-slot\|_hideAllVideoBars" js/ styles/` returns zero hits outside intentional new code.
- Run `/mpi-component-audit` (ESLint audit) on `js/components/`. Report violations — fix any in files touched during this refactor.
- Verify every modified component's `setup()` collects subscriptions into `_unsubs[]` and defines `el.destroy`. Add missing destroys.
- Remove dead CSS rules.
- Remove dead types.js typedefs (SelectionBar, Ratio/Number selectors, MpiToolActionBar, strategy-related shapes).

**Verify:** `/mpi-component-audit` output reviewed; app boots clean; `grep` verifications above all return zero. Console on a full workspace visit shows no warnings or errors.

---

### [ ] 7-SUPERSEDED — Rework `MpiHistoryTools` — PromptBox toggle, mask tool-group, disabled-state reactivity (DO NOT IMPLEMENT — kept for history)

Rework the compound. **`MpiHistoryTools` drives tool-group popups by mounting `MpiOptionSelector` in `buttons` variant per grouped tool def — no new popup code, no `MpiPopup` primitive wiring.** Generic + scalable: future tool groups (crop variants, brush variants, selection variants, etc.) add themselves by declaring `group: [...]` and `MpiHistoryTools` forwards that array straight to the `buttons` variant.

- Accept a tool definition list where one entry can be a group: `{ mode: 'mask', icon: 'mask', info: 'Mask', group: [{ mode: 'maskManual', icon: ..., label: 'Manual Mask', info?: '...' }, { mode: 'maskAuto', icon: ..., label: 'Auto Mask', info?: '...' }] }`.
- For each grouped tool def, mount an `MpiOptionSelector` in `buttons` variant. Pass `group` entries as its `buttons` prop (map `mode` → `value`). Trigger button icon = last-used sub-tool's icon (defaults to first entry's icon). Subscribe to its `change` event: activate the selected sub-mode (same flow as a non-grouped activate), then call `optionSelector.el.setTriggerIcon(subTool.icon)` to persist the icon swap for the session.
- For non-grouped tool defs, keep current `MpiButton` render path.
- Activation state: when any sub-tool is active, the grouped `MpiOptionSelector` trigger renders as active (same visual as a non-grouped active tool). When deactivated (user clicks the grouped trigger again or activates another tool), trigger reverts to inactive visual but keeps last-used icon.
- Accept per-tool `disabled: boolean` and `disabledReason?: string` on definitions; disabled buttons render grayed-out, are non-interactive, and show `disabledReason` as tooltip (fallback to normal `info` if absent).
- Add a new top entry for `prompt` (before crop). Its activate/deactivate fire the same `activate`/`deactivate` emits with `mode: 'prompt'`, which the Block's reducer maps to PromptBox visibility.
- `MpiGroupHistoryBlock` builds the tool list per group type and per model availability:
  - Image group with ≥ 1 installed image model for the active operation → prompt enabled; else disabled with reason `Install an image model to enable prompts`.
  - Video group with ≥ 1 installed video model → prompt enabled; else disabled with same-style reason.
  - Image-only tools disabled on video; video-only tools disabled on image (grayed, not removed) — keeps layout stable.
- Subscribe inside the Block to `Events.onState('s_installedModelIds', ...)`, `Events.onState('s_selectedModelId', ...)`, and `Events.on('project:changed', ...)` — on each change, rebuild the tool list via `tools.el.setTools(newList)` (add this imperative setter on `MpiHistoryTools`). Collect unsubs in `_unsubs[]`.
- Update types.js for the new def shape and `setTools` method. Update dev gallery demo to show grouped + disabled states.
- Update `.claude/rules/component-events.md` locally in-memory (actual file edit deferred to to-do 11): track the new emit shape.
- **Remove `cancel` from image tool bars inside `MpiCanvasViewer`** (crop, manualMask, autoMask). Radio-style tools do not need a cancel — switching to another tool via `MpiHistoryTools` triggers `strategy.onToolDeactivate` → `viewer.el.exitMode()` which discards in-progress crop rect / mask strokes / auto-mask selection cleanly. Audit canvas-viewer bar action defs, drop the cancel entries, drop their action-handler branches. Apply-button behaviour unchanged.
- **Kill `strategy.supportsPromptBox()`; PromptBox gated by active model's ops.** New Block-owned helper `_hasPromptOps()` returns `true` iff `_opOptions()` contains at least one enabled op the PromptBox serves (prompt-driven generate/edit ops — e.g. `i2i`, `inpaint`, `v2v`, `extend-with-prompt`). Video groups with a video model exposing such an op render the PromptBox same as image groups. Video groups whose model has no prompt ops → PromptBox never mounted, `prompt` tool disabled with `disabledReason: 'No prompt-driven ops available for this model'`. Remove `supportsPromptBox()` from both strategies. `MpiGroupHistoryBlock` decides PromptBox mount/claim on `_hasPromptOps()` at mount + on every `s_selectedModelId` / `project:changed` / installed-models change.

**Verify:** Open image group with a model installed → prompt button highlighted/active on load; click crop → crop activates, PromptBox hides, props bar shows crop. Click prompt → PromptBox reappears, props bar collapses. Click mask → popup appears with Manual + Auto; pick Auto → button icon updates, mask-auto mode active, props bar shows auto-mask controls. Uninstall all image models (or open a video group with no video model) → prompt button grayed with tooltip; clicking does nothing. Switch between image and video groups → video-only tools visible but disabled on image and vice-versa.

### [ ] 8-SUPERSEDED — Finalise PromptBox visibility toggle + bottom-slot cleanup (DO NOT IMPLEMENT — merged into pivoted to-do 7)

The previous to-dos already toggle PromptBox via the `--prompt-active` class. In this step, make that the single source of truth:
- Remove any remaining imperative `PromptBoxService.hide()` / `show()` calls inside `MpiGroupHistoryBlock` that were part of the old bottom-bar swap. PromptBox visibility is driven purely by the CSS class now.
- Ensure PromptBox claim/release on workspace mount/unmount remains intact (gallery and group-history still claim on enter, release on `destroy`).
- Ensure `el.destroy` on the Block cleans up **all** `_unsubs`, including the new `Events.onState` subscriptions from to-do 7, the channel bus subscriptions, strategy-owned listeners, and child component destroys.
- Initial `activeTool` on mount: `prompt` for image groups with a model installed; `crop` for video groups (no prompt); `null` (nothing active, props bar empty, PromptBox hidden) for image groups with no model installed — PromptBox disabled button grays out, user picks another tool.

**Verify:** Open image group → PromptBox visible, prompt tool active. Switch tools → PromptBox hides crisply via CSS, no flicker. Navigate away (back to gallery) and back → no duplicate subscriptions (add a `console.log('[GroupHistoryBlock] destroy — unsubs:', _unsubs.length)` and confirm the count matches what was registered). Open a video group → crop is the default active tool; PromptBox stays hidden even when the user toggles tools off (prompt tool is disabled). Open image group with zero models → no tool active; PromptBox hidden; prompt button disabled with tooltip.

### [ ] 9-SUPERSEDED — Cleanup sweep (DO NOT IMPLEMENT — replaced by pivoted to-do 9 above)

### [ ] 10. Smoke test matrix + manual regression

Walk through every flow end-to-end and capture pass/fail in this plan file's `## Smoke Test Results` appendix (added at the bottom during this step):

- Image group, model installed: open, prompt active by default, type prompt, generate, entry lands in history, entry shows dimensions. Click crop → crop bar in right-top → apply → new entry. Click mask → popup → Manual → paint mask → generate inpaint. Click mask → popup → Auto → pick auto-mask thumb → generate. Click prompt → PromptBox returns. Ctrl+shift selection in history list. Context menu → Compare → overlay opens. Context menu → Delete → confirm → entries gone.
- Image group, no model installed: prompt disabled; other tools work; PromptBox hidden.
- Video group with video model: crop (ratio + snapshot/apply, no cancel) works; upscale factor+model+run works; interpolate multiplier+run works; switching tools mid-config discards in-progress state cleanly; prompt disabled since there's no PromptBox for video.
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

## Deferred (post-refactor)

- **History card drag → PromptBox.** Additive capability, no structural conflict expected. `MpiHistoryList` entries already live DOM nodes — adding `draggable="true"` + `dragstart` handler works without rework. PromptBox already accepts media drops via `PromptBoxService.injectMedia()` + `MpiMediaDropOverlay` pattern. Selection model (ctrl/shift) from to-do 3 supports future multi-drag. Safety: to-do 3's right-click handler must only bind `contextmenu`, never `mousedown`/`dragstart`.

## Smoke Test Results

_(populated during to-do 10)_
