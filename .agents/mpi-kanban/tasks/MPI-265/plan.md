# Mascot generating states

## Current State

Generating cards live in `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`. Each card has a lifecycle already wired through three closure methods on `cardEl`:

- `setGenerating(previewUrl)` (line ~1132) — start; shows spinner + `__preview`, sets `_generating = true`.
- `updatePreview(previewUrl)` (line ~1150) — first latent frame arrives ("latency coming in"); enqueues preview frames.
- `setDone(newGroup)` (line ~1168) — finish; sets `_generating = false`, removes generating class.

Card DOM built at line ~318. Spinner lives inside `.mpi-group-card__preview` (line 322). `refreshGroup` (line ~1233) also flips `_generating` false when group no longer generating. Grid `destroy` (line ~1728) calls each card's `destroy`.

Assets exist: `assets/mascot/idle.png`, `assets/mascot/greet.png`, `assets/mascot/happy.png`. CSS at `MpiGalleryGrid.css` (generating state block ~305, spinner ~329). Colors from `styles/01_base.css` tokens only. BEM: `.mpi-group-card__mascot`.

## Implementation

- [ ] **DOM:** add `<img class="mpi-group-card__mascot" alt="">` as a sibling of the spinner inside `.mpi-group-card__preview` in the card `innerHTML` template (line ~318). Grab a `mascot` ref via `qs` next to the existing `spinner` ref (line ~352).

- [ ] **State machine + flip timer (JS):** add per-card closure state (`_mascotFlipTimer`, `_mascotFace`). Helper `_setMascotState(state)` toggles card classes `mpi-group-card--mascot-idle | --mascot-cooking | --mascot-done` (mutually exclusive) and sets the base `src`. Helper `_startMascotFlip()` schedules a `setTimeout` at `4000 + Math.random()*4000` ms that swaps `idle.png`↔`greet.png` (only while not in `done`) and re-arms itself; store the handle. Helper `_stopMascotFlip()` clears + nulls the handle.
  - `setGenerating`: hide spinner (`spinner.style.display = 'none'`), set mascot `idle`, start flip.
  - `updatePreview` first frame only (guard on a `_mascotCooking` latch so it fires once): switch to `cooking` state; flip keeps running.
  - `setDone`: `_stopMascotFlip()`, set mascot `happy` + `done` state (pop center), then after ~1.2s fade the mascot out (add a `--mascot-hidden` class or clear src). Reset the cooking latch.
  - Cleanup: call `_stopMascotFlip()` + clear mascot state on the `refreshGroup` non-generating branch (line ~1235) and in the card's own `destroy` if one exists (else in the closure teardown reached by grid `destroy`). Any path that sets `_generating = false` must stop the timer. **Verify:** grep the file for `_generating = false` and confirm each site stops the flip timer.

- [ ] **CSS (`MpiGalleryGrid.css`):** `.mpi-group-card__mascot` — `position:absolute`, `pointer-events:none`, `z-index` above spinner/preview img, GPU `transform`, `transition: transform .35s ease, opacity .3s ease`. `@keyframes` gentle hover float (translateY loop) applied in idle + cooking. `--mascot-idle` = large, centered. `--mascot-cooking` = `transform: translate(...) scale(~0.4)` bottom-right corner. `--mascot-done` = large centered + a short pop/scale keyframe. `--mascot-hidden` (or done fade) = `opacity:0`. Reuse existing token vars; no hardcoded colors. Keep the spinner rule intact (mascot replaces it via JS display toggle, not by deleting the spinner element).

- [ ] **Verify in running app:** trigger an image gen — mascot idle/center while waiting (no spinner), slides bottom-right + shrinks when preview appears, happy pop center then fades on done. Confirm flip idle↔greet fires. Confirm a second gen on the same card re-arms cleanly (no stuck/duplicate timer), and navigating away mid-gen doesn't leak a timer.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement mascot overlay + state machine + CSS end to end, then verify in the running app.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Pure visual/motion feature — the user must watch a real generation in the running Electron app: idle center (spinner gone) → shrink+slide bottom-right on first preview → happy pop + fade on done, with idle↔greet flips. Also confirm no timer leak across repeat gens / nav-away.

## Preservation Notes

- Assets already in `assets/mascot/` (recolored per `docs/redesign/RECOLOR.md`) — no new assets needed. `greet.png`/`happy.png` filenames here vs `mascot-hi`/`mascot-ho` in RECOLOR.md: use the actual files present (`idle.png`, `greet.png`, `happy.png`).
- Component wiring changed (new DOM node in a card, no new events/props/state keys, no ComfyUI injection) — minor. Ask at session end whether `.claude/rules/` needs a note; likely not (internal decoration, no new contract).
