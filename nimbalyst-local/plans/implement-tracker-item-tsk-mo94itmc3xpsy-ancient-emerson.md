# MpiPromptBox Refactor — Plan

Tracker: `tsk_mo94itmc3xpsyi`

## Context

MpiPromptBox currently packs media drop zone, copy button, model+operation dropdowns, gear, download, negative toggle, run button, and op-specific controls all inside the box. Layout issues:

- Internal drop area wastes space. Dropped media should live **above** box; a drag-over overlay should hint drop target.
- Copy button sits over the textarea scrollbar (right: 0.25rem).
- Textarea scrollbar renders with white/light track — inconsistent with app globals (`var(--bg)` / `var(--surface-3)` from `styles/01_base.css:145-168`). Root cause: textarea background is `var(--bg-recessed)` (`MpiPromptBox.css:58`) but no local scrollbar override.
- Bottom area is crowded. Only generate button + negative toggle should remain. Other controls (model dropdown, gear, download, operation dropdown, op-specific controls) move into a popup triggered by a badge that shows `{model} · {operation}` dynamically.

Outcome: cleaner prompt box, external media chips, visible scrollbar, consolidated settings behind a single badge-triggered popup (pattern mirrors `MpiRatioSelector`).

## Critical files

- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — main refactor target
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.css` — markup + scrollbar styles
- `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` — existing op-specific controls (reused as-is inside popup)
- `js/shell/promptBoxService.js` — service owning MpiPromptBox; will render media chips above box
- `js/components/Primitives/MpiPopup/MpiPopup.js` — reused (template + portal)
- `js/components/Primitives/MpiBadge/MpiBadge.js` — reused as trigger label
- Reference pattern: `js/components/Compounds/MpiRatioSelector/MpiRatioSelector.js:144-332` (badge+popup+portal+hover-close)

## Changes

### 1. Remove internal drop area, render media above box

**MpiPromptBox.js**
- Delete `.mpi-prompt-box__media-zone`, `.mpi-prompt-box__media-chips`, `.mpi-prompt-box__drop-hint` from template (lines 61-69).
- Remove `_syncDropHint`, chip-in-box DOM ops. Keep `_mediaItems`, `_tryAddMedia`, `_removeItem`, `injectMedia`, `clearMedia`, `getMediaItems`, `media-change`/`media-imported` emissions — they remain the source of truth, DOM rendering moves out.
- Drag events: keep `dragenter/over/leave/drop` on `el`, but apply new overlay class `mpi-prompt-box--drag-over` on root. Remove media-zone classList toggles.
- Add template element inside `.mpi-prompt-box`: `<div class="mpi-prompt-box__drop-overlay"><span>Drop here</span></div>` — hidden by default, shown via `--drag-over` modifier.

**MpiPromptBox.css**
- Delete media-zone + drop-hint rules (lines 143-176). Keep chip styles for reuse OR move them to parent. **Decision:** move `.mpi-prompt-box__media-chip*` styles to service scope (new class `.mpi-prompt-box-media-strip__chip`) in `promptBoxService.js` inline CSS or a new CSS file.
- Add `.mpi-prompt-box__drop-overlay`: absolute-fills box, `display:none`, centered text, semi-transparent glass bg, colored border; `.mpi-prompt-box--drag-over .mpi-prompt-box__drop-overlay { display:flex; }`.

**promptBoxService.js**
- Render a `.mpi-prompt-box-media-strip` element above the MpiPromptBox mount point (inside the existing `#prompt-box-mount` container, above the box). Populate from `media-change` event. Each chip uses the same remove-on-click → calls `instance.el.clearMedia` or new `instance.el.removeMedia(id)` public API.
- Add to MpiPromptBox public API: `el.removeMedia(id)` (thin wrapper over internal `_removeItem`) so the external strip can remove items.

### 2. Move copy button 5px left (off scrollbar)

**MpiPromptBox.css** line 80: change `right: 0.25rem;` → `right: calc(0.25rem + 5px);` (equivalent `right: 0.5625rem;` — keep calc for clarity of intent).

### 3. Scrollbar consistent with app

**MpiPromptBox.css**: add scoped rules so textarea scrollbar matches recessed surface:

```css
.mpi-prompt-box .mpi-input__field--textarea::-webkit-scrollbar-track { background: var(--bg-recessed); }
.mpi-prompt-box .mpi-input__field--textarea::-webkit-scrollbar-thumb { background: var(--surface-3); border: 2px solid var(--bg-recessed); }
.mpi-prompt-box .mpi-input__field--textarea::-webkit-scrollbar-thumb:hover { background: var(--primary-dim); }
.mpi-prompt-box .mpi-input__field--textarea { scrollbar-color: var(--surface-3) var(--bg-recessed); }
```

### 4. Move controls into MpiBadge-triggered popup

**MpiPromptBox.js template**
- Keep in bottom bar: `--neg` (negative toggle) + `--right` (run button) + new `--settings-badge` area.
- Remove from bottom bar: `--left` (model dropdown, gear, download), `--center` (op dropdown), `--bottom` (op-specific controls).
- Add new slot `#settings``-badge-slot`. Mount an `MpiButton` (variant `ghost`, size `sm`, toggleable) whose `label` is the rendered `MpiBadge.template({ label: "{modelName} · {opLabel}", variant: 'secondary' })` HTML string — this keeps a11y/toggle states from MpiButton while giving the badge look (same pattern as `MpiRatioSelector.js:121-129` where the trigger button carries label text). Click toggles the popup (portal, `positionPopup`, `is-active`, hover-close timer, `ui:close-all-popups` bus). If MpiButton label does not accept HTML, render the badge `<span>` inside the button's label via DOM after mount.

**Popup content** (rendered via `MpiPopup.template({ active, position: 'top' }, innerHtml)` then portaled):
- Header: MpiBadge `label: 'SETTINGS'`.
- Body flex/grid container `.mpi-prompt-box__settings-grid` with children (order preserved, styling out of scope):
  1. Model MpiDropdown (moved from `#bottom``-left-slot` — lines 456-471)
  2. Gear MpiButton (moved from lines 474-480)
  3. Download Manager MpiButton (moved from lines 484-488)
  4. Operation label + MpiDropdown (moved from `#op``-dropdown-slot`, lines 342-379)
  5. Op-specific controls host element `#settings``-op-slot` replacing `#bottom``-bottom-slot` in `_refreshOpSlot`.

**Badge label — dynamic**
- Compute inside helper `_renderBadge()`; called from `setModel`, `setOperation`, and `_refreshOpDropdown`.
- Label format: `${model?.name ?? '—'} · ${commands[activeOperation]?.label ?? activeOperation}`.
- Update badge text by replacing inner `.mpi-badge` text, not full re-render (avoids popup teardown).

**Popup lifecycle**
- Port to `document.body` on setup (same pattern as `MpiRatioSelector.js:160`).
- Wire `mouseenter`/`mouseleave` on both trigger and popup, 300 ms close timer.
- Subscribe to `Events.on('ui:close-all-popups', closePopup)` — push into `_unsubs`.
- MutationObserver-based teardown of portaled popup when MpiPromptBox `el` leaves DOM (match ratio selector lines 168-175).
- In `el.destroy()`: disconnect observer, call `unsub`, remove portaled popup node if still present.

**Radial-menu sync unchanged**: `_onSetOperation` still calls `el.setOperation(key)` → now also updates badge label + re-mounts op-specific controls inside popup instead of bottom slot.

### 5. Parents (no change required)

`MpiGalleryBlock` and `MpiGroupHistoryBlock` call `PromptBoxService.mount(props)` — props are unchanged. Media injection via `Events.emit('media:imported', ...)` / `promptBoxService.injectMedia()` still works; media-strip DOM updates are driven by the existing `media-change` event the service now listens to.

## Verification

1. Run `npm start` (or existing dev launcher). Open app at `http://127.0.0.1:3000/`.
2. **Media above, not inside:** select an image model → no drop zone visible inside box. Drag a gallery card onto prompt box → overlay "Drop here" appears across box → drop → thumbnail shown **above** box, not inside. Remove button on chip clears it.
3. **Native file drop:** drag file from OS → same overlay → drop → chip appears above; history card created (existing `media:imported` flow).
4. **Incompatible media:** drop video onto image-only model → toast, no chip.
5. **Copy button:** click inside textarea enough lines to show scrollbar → copy button sits ~5 px left of scrollbar, not over it.
6. **Scrollbar styling:** textarea scrollbar track uses recessed bg (no white); thumb uses `--surface-3`; matches global scrollbar elsewhere.
7. **Badge + popup:** bottom bar shows only badge ("Flux · Text to Image"), negative toggle, run button. Click badge → popup opens above, portaled to `<body>`, contains model dropdown, gear, download, operation dropdown, op-specific controls (e.g. ratio selector for t2i). Mouse-leave closes after 300 ms.
8. **Radial menu sync:** open radial menu, switch operation → badge label updates immediately; popup (if open) re-renders op-specific controls.
9. **Model change:** open popup, switch model in dropdown → badge label updates; `settings:model:select` still emitted.
10. **Teardown:** navigate away from gallery block → prompt box destroyed → portaled popup node removed from `<body>` (inspect DOM); no orphaned event listeners (check `_unsubs` called via `el.destroy`).
11. **Global popup close:** with popup open, emit `Events.emit('ui:close-all-popups')` from console → popup closes.

## Out of scope

- Grid/flex layout refinement of controls inside popup.
- Re-styling the chips shown in the new media strip beyond functional parity.
- Backlog.md touch-ups.
