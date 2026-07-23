# MPI-256 research — Agent D: overlay system / z-order / queue slide-over / status bar

## Q1. Overlay system
- Manager: `js/managers/overlayManager.js` singleton `Overlays`. `request(instance)` → push `_stack[]`, `instance.show()`, fires `ui:close-all-popups {reason:'overlay-open'}`, returns `{depth, zIndex}` (caller applies inline). `release(instance)` splices (no lifecycle). `closeTopOverlay()` = Escape. `reset()` clears all (fires post-navigation).
- MpiOverlay mount modes:
  - `mountTarget:'tool-container'` (default): fills #tool-container only, Stash Pattern for its children. Does NOT cover PromptBox/status bar. CSS `top: var(--titlebar-h); position:fixed`.
  - `mountTarget:'body'`: stashes ALL body children EXCEPT `#titlebar` + `.mpi-toast-stack`. `inset: var(--titlebar-h) 0 0 0`. **Covers status bar (stashes #app-shell).**
- Z-index map: promptbox mount 40 (workspace.css:38) | workspace-topbar 50 | **#shell-info-bar (status bar) 50, sticky bottom (components.css:14, index.html:144)** | **MpiSlideOver (incl. queue) 100 (MpiSlideOver.css:16)** | radial 500 | popups/titlebar 9999 | overlay fallback 10009/10010 | **OverlayManager JS: BASE_Z 10000 + depth*10 ⇒ 1st overlay 10010, 2nd 10020 (overlayManager.js:13-14)** | toast stack 20000.

## Q2. Queue slide-over
- `MpiQueuePanel` (Compounds) = content; chrome = `MpiSlideOver` w/ `extraClasses:'mpi-slide-over--queue'`. Mounted `document.body.appendChild` (MpiSlideOver.js:94). z-100, NOT registered with Overlays.
- `--queue` variant: docks right, `bottom: calc(var(--statusbar-h,32px) + var(--promptbar-h,0px))` (MpiSlideOver.css:87-103).
- Opened by: `Q` hotkey (`queue.toggle` hotkeyRegistry.js:190, bound MpiGalleryBlock.js:90 + MpiGroupHistoryBlock.js:1434) + `generation-queue:open` event → `slide-over:open`. Status bar shows text only, no click-open.
- Survives overlay-open pulse: MpiSlideOver.js:110-112 exempts `reason==='overlay-open'`. **BUT z-100 < overlay z-10010 ⇒ INVISIBLE behind any overlay today. Requirement (b) needs z-order surgery.**
- Module-level singleton close-then-open (MpiSlideOver.js:128-143): `if (_active) {_active.el.close()}` — canonical never-nested pattern.

## Q3. Status bar
- `#shell-info-bar` static in index.html:144, flex child of .main-area, `sticky; bottom:0; z-50`.
- tool-container overlay: sibling — status bar VISIBLE ✓. body overlay: stashed + covered ✗. **Model Library COVERS the status bar (MpiModelManager.js:98 comment "body mode covers status bar too").**

## Q4. Overlay stacking
- Stack-based, multiple simultaneous supported (docs/shell.md). B over A = 10020 over 10010; Escape closes top-first.
- Body-mode stash conflict: B (body) stashes A → nested stash; B close restores A. Works but hairy — prefer close-then-open handoff (our design already does).

## Q5. Gotchas
- Toast-stack stash bug (docs/ui-gotchas.md:70): fixed — MpiOverlay.js:121-122 exempts `.mpi-toast-stack`; toast MutationObserver re-checks 1 rAF later. RULE: never stash toast stack; fire toasts via Events ui:* not direct mount.
- Dropdowns/TreePicker z-11000 paint above overlays fine; `ui:close-all-popups` closes them on overlay open.
- Slide-over below ALL overlays (both modes) at z-100.

## Q6. PromptBox slot
- `#prompt-box-mount` = index.html:141, direct child of .main-area between #tool-container and #shell-info-bar; `relative; z-40` (workspace.css:29-39).
- body overlay covers it (stash + inset); tool-container overlay does NOT (sibling, stays interactive).

## THE TWO FRICTION POINTS + resolutions (agent-proposed)
**(a) App overlay must cover Gallery+PromptBox but NOT status bar — NO existing mode does this.**
- Option 1 (promising): NEW `mountTarget:'workspace'` mode — absolute inset layer inside `.main-area` (position:relative), covers #tool-container + #prompt-box-mount (both children) but NOT sticky #shell-info-bar... wait, sticky z-50 vs overlay z — needs care; agent thinks sticky footer paints on top if overlay z kept below... [verify in design]
- Option 2: keep body mode + exempt `#shell-info-bar` from stash (like titlebar/toast exemptions) + change inset `bottom: var(--statusbar-h)`.

**(b) Queue slide-over above App overlay — does NOT work today (z-100 vs z-10010).**
- Option 1: App overlay sets `--app-overlay-z` on :root; slide-over CSS `z-index: calc(var(--app-overlay-z,0) + 10)`.
- Option 2: register queue slide-over with Overlays while app open (gets 10020).
- Option 3: z-index prop on slide-over open.
- The close-all-popups pulse is NOT a problem (already exempted).

**(c) Library→App handoff:** works with existing close-then-open (release before request); copy MpiSlideOver singleton pattern.
