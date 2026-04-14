---
name: gallery-card-info-display
created: 2026-04-14
owner: human
status: in_progress
---

## Goal
Add progressive info display to gallery cards: show/hide toggle in filter bar, model badge, type badge, and a reuse button that injects prompts into the prompt box.

## Investigation Notes

### State + localStorage
- `state` is a Proxy — top-level assignments auto-emit `state:changed`
- No existing boolean key has bidirectional localStorage; closest is `gallerySort` which only syncs to localStorage (never reads back)
- Pattern: add `galleryShowInfo: false` to `_state`, restore from localStorage at startup in shell.js, subscribe to `state:changed` to persist changes
- localStorage stores strings only — store as `'true'`/`'false'` strings

### PromptBox injection
- `MpiPromptBox` holds `positiveValue`, `negativeValue`, `isNegativeMode`, `textareaEl` as **closure variables** in `setup()` — not accessible externally
- Must add `injectPrompts({ positive, negative })` **inside** `setup()` to close over these variables
- Also need to listen for `workspace:inject-prompts` event (pattern follows `workspace:set-operation`) inside MpiPromptBox's setup
- PromptBoxService can get a convenience wrapper, but MpiPromptBox handles the event directly via Events bus

### Card props/events
- `MpiGroupCard` accepts `group`, `selectionMode`, `selected` at mount time
- Events use local `emit` (ComponentFactory) — fires CustomEvent on DOM element AND calls local listeners — NOT the global Events bus
- `MpiGalleryGrid` uses `card.on('event', handler)` to receive events
- Props are captured at mount; `_render()` is not reactive. Need `setShowInfo(val)` public method for post-mount updates
- `MpiButton.mount(container, props)` replaces `container.innerHTML` — use separate wrap elements for each button

### CSS
- Card has `overflow: hidden` — footer can be `position: absolute; transform: translateY(100%)` and animate in cleanly without layout side effects
- Footer transition: `transform + opacity` for GPU compositing
- Selected modifier (`--selected`) overrides footer to solid neon — need to ensure footer visibility works with both hover AND selected states
- `--text-primary` and `--radius-md` used but not defined in `01_base.css` — verify they exist in the component's CSS import chain

## To-Dos

- [ ] **Add `galleryShowInfo` state + localStorage** — `js/state.js` + `shell.js`
  - Add `galleryShowInfo: false` to `_state` object
  - In `shell.js` startup: read localStorage and restore value, subscribe to `state:changed` to persist
- [ ] **Add `injectPrompts` to MpiPromptBox** — `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`
  - Add `el.injectPrompts({ positive, negative })` method inside `setup()` (closes over `positiveValue`, `negativeValue`, `textareaEl`)
  - Subscribe to `workspace:inject-prompts` event (alongside existing `workspace:set-operation` listener)
  - Add cleanup in MutationObserver
- [ ] **Add `injectPrompts` convenience wrapper to PromptBoxService** — `js/shell/promptBoxService.js`
  - `injectPrompts({ positive, negative })` delegates to `PromptBoxService.component?.injectPrompts(...)`
- [ ] **Add info toggle button to filter bar** — `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`
  - Append info icon button to end of tab groups (after filter group)
  - Toggle `state.galleryShowInfo` on click
  - Apply `--active` modifier when `state.galleryShowInfo === true`
- [ ] **Subscribe grid to `galleryShowInfo` state** — `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`
  - Add `Events.on('state:changed', ...)` subscriber for `galleryShowInfo` key
  - When `galleryShowInfo` changes, call `card.el.setShowInfo(newVal)` on each mounted card
- [ ] **Auto-enable info on select mode** — `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`
  - In `_enterSelectionMode()`, set `state.galleryShowInfo = true`
- [ ] **Add `setShowInfo` method to MpiGroupCard** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
  - Expose `el.setShowInfo(val)` to toggle info visibility after mount
  - Show/hide model badge, type badge based on `showInfo` prop
- [ ] **Add model badge and type badge to card template** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
  - Add `.mpi-group-card__badge` span for model name (resolved via `getModelById(modelId)?.name`)
  - Type badge already exists as `.mpi-group-card__type` — show/hide based on `showInfo` prop
  - Update `_render()` to populate model name
- [ ] **Add reuse button to card** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
  - Mount `MpiButton` (icon: `copy`, size: `sm`, variant: `ghost`, `info: 'Inject prompt'`) in a new `__reuse-wrap` element
  - On click: emit `'reuse'` event with `{ positive, negative }` from `selectedItem`
  - Only functional when not in select mode (PromptBox is hidden in select mode anyway)
- [ ] **Handle `reuse` event in MpiGalleryGrid** — `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`
  - In card event handlers, listen for `'reuse'` and emit `Events.emit('workspace:inject-prompts', { positive, negative })`
- [ ] **Update card CSS — footer slide-in** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
  - Change `.mpi-group-card__footer` to `position: absolute; bottom: 0; transform: translateY(100%); opacity: 0;`
  - On `.mpi-group-card:hover` and `.mpi-gallery-grid--selecting .mpi-group-card--selected`: `transform: translateY(0); opacity: 1;`
  - Note: `--selected` modifier already overrides footer bg to solid neon — ensure visibility stacking is correct
- [ ] **Update card CSS — reuse button** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
  - `.mpi-group-card__reuse-wrap`: `position: absolute; bottom: 0.4rem; right: 0.4rem; opacity: 0;`
  - Reveal on `.mpi-group-card:hover`
- [ ] **Update card CSS — model badge pill** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
  - `.mpi-group-card__badge`: pill shape, `--surface-3` bg, `--neon-electric` text, small font
  - Show when `showInfo === true`
- [ ] **Update card CSS — selected state footer** — `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
  - Ensure `.mpi-group-card--selected .mpi-group-card__footer` is visible regardless of hover state (footer always shows when card is selected)
- [ ] **Verify CSS variable definitions** — `--text-primary`, `--radius-md`
  - Confirm these exist in the component's CSS import chain (likely `styles/shell/components.css`)
  - Add fallbacks in component CSS if needed
