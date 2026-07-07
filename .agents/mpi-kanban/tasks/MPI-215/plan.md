# Model Library overlay

Move the model manager out of the app slide-over into a full-page **Model
Library** overlay: a dark contact-sheet grid of models with a right-drawer
detail panel. Design is fully approved and frozen as a working reference
mockup — build to match it.

**Reference spec (visual + interaction, authoritative):**
`C:\Users\Fabio\AppData\Local\Temp\claude\c--AI-Mpi-Cubric-Vision\d6c3f9a0-cb79-4e4b-beb8-4f38e1bd7ff8\scratchpad\model-library-B.html`
(open it, click tiles, type in search — the built feature must look and behave like this).

## Current State

- Project mode: **scalable-foundation**.
- `models:open` → `shell.js:344` re-emits `slide-over:open { title:'Models', component: MpiModelManager }`. The manager renders install cards in the narrow `MpiSlideOver` right drawer. Works today (<20 models); won't scale to hundreds.
- `MpiModelManager` (`js/components/Compounds/LandingPages/MpiModelManager/`) owns ALL model logic and it stays the owner: refresh/reSync, install/uninstall/pause/resume/cancel, `download:*` subscriptions, op toggles (MPI-122), size-tier filter + tier→VRAM/RAM trade table (MPI-168), arch weight toggles (MPI-200/209), partial-progress bars, engine-split correctness (MPI-163). Reuse this logic — do NOT reimplement it.
- `MpiOverlay` (`js/components/Primitives/MpiOverlay/`) already provides a full-viewport overlay: `mountTarget:'body'` covers everything incl. status bar, backdrop, built-in X close, Escape-close via `Overlays`, Stash Pattern preserves stashed content. It emits `ui:close-all-popups {reason:'overlay-open'}` on show.
- `MpiSlideOver` appends to `document.body` and is a singleton app drawer (settings/hotkeys/queue). Do NOT hijack its singleton for the detail panel — a body-level drawer can't be guaranteed to stack above the body-mounted overlay, and the app drawer must stay reserved for settings/queue. Reuse its VISUAL chrome only.
- Model data: each `ModelDef` has `mediaType: 'image'|'video'` (`js/data/modelConstants/models.js`), `sizeTier`, `dropdownMeta` (category), `name`, `description`, `image`/`video` preview filename, `supportedOps`. **Image/Video filter reads `model.mediaType` directly** — no data-model change, no op-prefix parsing.
- Stage design system is authoritative: `styles/01_base.css` tokens + `.claude/rules/components.md` § "Stage design baseline". This is a NEW surface → the redesign docs `docs/redesign/PRODUCT.md` + `DESIGN.md` were consulted during design (mono JetBrains Mono, sharp radius, heat theatrical-only, no identical-card-grid → solved via mixed 4:5/16:9 split blocks, darker-than-slide-over ground).
- **Concurrent agent is editing model-installation logic inside `MpiModelManager.js`.** Edit by content anchors, re-read on stale-Edit errors, re-grep after each edit ([[feedback_concurrent_sessions_same_file]]).

## Implementation

- [ ] Build the Model Library overlay end to end, matching the reference mockup:
  1. **Routing** (`js/shell.js` ~line 344): change the `models:open` handler to open `MpiModelManager` inside a `MpiOverlay` (`mountTarget:'body'`, `closable:true`) instead of emitting `slide-over:open`. Keep `MpiSlideOver` reserved for settings/hotkeys/queue (untouched). Register `MpiOverlay` CSS in `preloadStyles.js` if not already. Ensure the overlay `destroy()`s the manager on close (Observer/teardown contract).
  2. **Library shell + restyle** (`MpiModelManager` template + `.css`): title **"Model Library"** + count line; filters row = **Media (Image/Video)** + existing **Size (Low/Balanced/High)** tier toggles + **live search** input (filter by `name`/`dropdownMeta`, case-insensitive). Dark surfaces as local tokens: `--lib-bg: oklch(0.26 0.020 350)` (overlay ground), `--lib-card: oklch(0.33 0.022 350)`, hover ~`0.37` (final values may be tuned — the mockup's darkness tuner value is the target; confirm with user if it drifted). Everything else via existing Stage tokens; no hardcoded colors.
  3. **Split-block grid**: per section (**Installed** then **Available**), render an **Image** sub-grid then a **Video** sub-grid. Each sub-grid holds one aspect ratio so rows align (no ragged holes): image tiles `aspect-ratio 4/5`, video tiles `16/9`. `grid-template-columns: repeat(auto-fill, minmax(~220px, 1fr))`. Sub-block header shows media icon + count. Media filter shows/hides the matching sub-blocks; empty result → "No models match" message.
  4. **Lean uniform tiles** (replace the current wide `MpiInstalledDisplay` card layout in this view — keep the underlying install logic): preview thumb (image = still from `model.image`; video = `<video muted loop>` that plays on hover, NO persistent play button — mirror the gallery `.frame` hover pattern), name, `category · tier`, media badge, and an **inline state row of FIXED height** (no layout shift): `Installed ✓` / `Install ↓` / a **live progress bar** driven by the existing `download:progress` partial-progress path while downloading. Recently-installed marker = a heat dot positioned **absolute** on the thumb corner (zero layout impact — do NOT add a text line that grows the card). Clicking a tile opens the detail panel for that model.
  5. **Detail panel** = a right drawer rendered **inside the overlay's own container** (child element, `position:absolute` within the overlay — guarantees it stacks above the body-mounted overlay; matches the mockup). Reuse `MpiSlideOver`'s visual chrome (header title + X, scrollable body, footer actions) via CSS, NOT its singleton router. Panel content is the existing card's controls, MOVED here: big preview, name/tier/media badge, **description**, **Operations** toggles (MPI-122 `_opToggles` logic), **GPU-weight arch** toggles for arch-variant models (MPI-200/209 `_archToggles`, shown only when `archVariantOptions(model).length`), **VRAM→RAM trade table** for video/tiered models (MPI-168 tier badge/table logic, inline here instead of a hover popup — there's room now), **disk footprint**, and footer **Install / Update / Uninstall** actions with the existing draft/confirm flow. Panel is data-driven: image models omit arch + VRAM blocks. Open on tile click; close via panel X, backdrop scrim, or Escape.

  **Verify:** launch the real Electron app ([[tool_electron_launch_run_as_node]]), open Models → confirm the full-page Model Library overlay opens (not the slide-over), grid renders installed+available in split Image/Video sub-blocks with correct 4:5 / 16:9 ratios and aligned rows, media/size filters + live search all filter correctly and compose, a video tile plays its preview on hover, clicking a tile opens the right-drawer detail with the correct per-model controls (arch/VRAM only on video/arch models), install/uninstall/download still work (progress bar updates inline on a tile during a real or simulated download), and the whole thing visually matches the reference mockup. Confirm the app-level slide-over still opens Settings/Hotkeys/Queue unchanged. Screenshot the running overlay and compare against `model-library-B.html`.

## Completed

- [x] Build the Model Library overlay end to end (routing, library shell +
  restyle, split-block grid, lean tiles, right-drawer detail panel). Verified in
  the running app via a fresh browser page against :3000: overlay opens full-page
  (not slide-over), split Image/Video sub-grids with correct 4:5 / 16:9 ratios,
  Media/Size/search filters compose, video tiles preview, a tile shows a live
  partial-progress bar, clicking a tile opens the right-drawer detail with
  per-model controls (LTX arch toggles + VRAM table present; image models omit
  them), detail closes cleanly, zero console errors. **Awaiting user UX sign-off.**

## Remaining Work

- User UX verification of the running overlay (verify mode: user-ux), then
  close-out (docs/rules offers + UNRELEASED changelog per Preservation Notes).

## Plan Drift

- 2026-07-07: **Routing implemented as self-hosting, not shell-owned.** Plan step 1
  said shell.js opens `MpiModelManager` inside a `MpiOverlay`. Instead
  `MpiModelManager` now SELF-HOSTS its own `MpiOverlay(mountTarget:'body')` +
  detail drawer (mirrors the existing `MpiModelSettings` / `MpiCompareOverlay`
  pattern). shell.js `models:open` just mounts the manager once (lazy singleton)
  and calls `el.open()`. Same end behavior (overlay not slide-over); keeps all
  model + overlay lifecycle in one component. Also updated the two other callers
  that opened models via `slide-over:open` — `js/shell/projectUI.js` (landing
  "Models" link) and `js/pages/components.js` (dev gallery) — to emit
  `models:open`, and dropped their now-unused `MpiModelManager` imports.
- 2026-07-07: **Detail-panel controls** — the old `MpiInstalledDisplay` card was
  fully replaced by lean tiles + the drawer; `MpiInstalledDisplay` / `MpiPopup`
  imports removed from the manager. The op/arch/VRAM/install LOGIC is preserved
  verbatim; only the render layer changed. The VRAM trade table moved from a
  hover popup to an inline block in the drawer.
- 2026-07-07: **z-index fix** — the overlay's own X (top-right) overlapped the
  detail drawer's X. Scoped the overlay X to `z-index:35` (above grid/scrim z-30,
  below drawer z-40) via a `:has(.mpi-model-library)` override so the drawer's own
  X owns the corner when open. MpiOverlay.css (shared) left untouched.
- 2026-07-07: **Full-bleed override** — `MpiOverlay` pads its root + caps
  `.mpi-overlay__container` at 600px (built for centered settings cards). Added a
  scoped `:has(.mpi-model-library)` override in MpiModelManager.css to strip the
  padding/cap so the Library fills the viewport. Shared primitive untouched.
- 2026-07-07 (post-UX round 1, user feedback): four refinements —
  (a) **Name clamp**: tile name is 2-line `-webkit-line-clamp` + `min-height` so a
  long name ("NVIDIA PiD Upscaler", future "… V2") never grows the tile / breaks
  row alignment. (b) **Drawer preview true-aspect**: image + video previews size to
  the asset's REAL dimensions (no square-crop / no letterbox) — media is
  `object-fit:contain`, JS sets `thumb.style.aspectRatio` from natural dims on load,
  `max-height:46vh` caps tall portraits, `flex:none` so aspect-ratio drives height in
  the flex-column body. Tiles keep uniform cover-crop (user chose uniform over
  ragged). (c) **Drawer video autoplays** (muted/loop) so quality is judgeable
  without hovering. (d) **Drawer video click → native `requestFullscreen()`**
  (unmute + native controls in FS; Escape exits FS only, leaves the drawer open;
  `document` `fullscreenchange` restores muted/no-controls). Grid-tile videos stay
  HOVER-play (NOT autoplay) — user flagged that autoplaying many previews will not
  scale to hundreds of models (the gallery already lags on hover-play). All verified
  live in the browser (fullscreen enter/exit state asserted, 0 console errors).

## Verification

**Verify mode:** user-ux

This card is a UI/UX surface. Self-verify what is mechanically checkable
(routing, filter logic, no console errors, install/download still fire, tests
green), THEN stop for the user to look at the running overlay and confirm it
matches the approved mockup and feels right before the card is done. The
approved reference is `model-library-B.html` — drive the app, screenshot the
overlay + an open detail panel, and compare.

## Preservation Notes

- **Docs/rules (ask before writing, per CLAUDE.md doc-drift rule):** this changes component wiring — `models:open` now opens an overlay, and the detail panel is a new sub-surface. On completion, offer to update `.claude/rules/component-mounts.md` (MpiModelManager now overlay-hosted, not slide-over; new detail drawer), `.claude/rules/component-events.md` (models:open → overlay), and `.claude/rules/component-state.md` if new state keys are added (e.g. a media-filter set or active-detail-model). Update the note in `component-mounts.md` line ~43 that currently says the manager is a slide-over content component.
- **Concurrency:** re-grep `MpiModelManager.js` after the concurrent install-logic agent finishes; reconcile if both touched the same regions. Commit by explicit pathspec, never `git add -A` ([[feedback_shared_tree_commit_hygiene]]).
- **Changelog:** add an UNRELEASED entry for the Model Library.
- No data-model/schema change; no model version bump.
