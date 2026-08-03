# MPI-375 — validation

Verify mode: **user-ux** (`plan.md` § Verification). Nothing in this card proves
itself from a test file — it is a hands-on drawing tool.

## Plan items 1–3 — automated evidence (2026-08-03)

**Suite 329 → 334, 0 fail.** `npm run lint:components` clean; every touched file
lints with 0 errors and 0 warnings (the 3 remaining warnings in the repo are
pre-existing in `MpiPromptBox`).

**Real pixels, not source text.** A temp module under `js/` served off the running
`:3000` and imported in Chromium — the `docs/masking-tools.md` § Fill Holes route —
ran **32 assertions, all PASS**, then was deleted. It covered: dab spacing and
interpolation geometry; a paint dab landing the chosen RGBA opaque; the stroke box
spanning the *interpolated* extent rather than the two samples; one stroke booking
exactly one undo entry, undo emptying the layer and redo restoring it; eraser as
`destination-out`; `clear()` as one entry and a no-op on an empty layer; the mask
brush's manual/subtract mirror still exact; and mask and paint layers not touching
each other in either direction.

**Negative-controlled, four times, each restored byte-identical.**
- Disabling the interpolation in `brushDab.js` failed 5 assertions, including the
  no-hole check on **both** the paint layer and the mask brush.
- Pointing `_modeKeepsPromptBox` back at `_isMaskTool` failed the PromptBox guard.
- Stubbing `_viewerModeFor`'s paint branch failed the viewer-bridge guard.
- Dropping `dest: 'paint'` from the strip mount failed the destination guard.

**The CRLF trap fired for real.** The new viewer-bridge guard first failed because
its regex anchored on `;\n` and the tree is CRLF — it read as "the constant was
renamed". Fixed to `;\r?\n` and noted in the test.

**A pre-existing bug fixed on the way through.** `MaskManager.paint()` stamped one
arc per `mousemove` with nothing joining them, so any drag faster than the brush is
wide left holes — 40 image-px at the default size, which a normal flick clears on a
zoomed-out image. It read as a skipping brush, not a missing feature. The shared
interpolation closes it for the mask brush as well as paint. **This is a
user-visible change to a shipped tool** and belongs in the release note as its own
line, not folded into "paint added".

## Round 1 in the app — one HALF-WIRE, found by the user (2026-08-03)

The mask-brush fix landed: **"no skip whatsoever."** But the Paint tool was dead —
no brush ring, drag panned, wheel zoomed. Only `B`/`E` responded, because those go
through the hotkey path rather than the canvas mode.

**Root cause, not the symptom.** `MpiCanvasViewer._enterMode()` carried a hardcoded
`if (crop) … else if (mask) … else → activeMode = 'none'`. `paint` was added to
`MpiCanvas.activeMode`, to the rail, to `TOOL_OPTIONS_REGISTRY` and to
`_viewerModeFor()` — and fell straight through that final `else`. **Nothing failed.**
The button worked, the panel rendered, `setPaintEnabled` was honoured; the canvas
simply never entered paint mode, so `isPaintingMode` stayed false and every branch
that asks "whose brush owns the pointer" answered "nobody". A dead tool that looks
alive — the exact shape the engine-split lessons warn about.

Fixed at the cause: `_enterMode` now consults a `CANVAS_MODES` **set**, so adding a
canvas mode is adding a row. The same sweep found the drop-stale-mode triple
**duplicated** across the two `modechange` subscriptions (initial mount and the
post-preview remount) — a mode added to one would have been forgotten in the other.
Extracted to `_syncModeFromCanvas()`, written once.

**Two new guards, both negative-controlled.** One asserts every mode
`_viewerModeFor` can RETURN is a mode the viewer ACCEPTS — the two ends of the wire,
tied together. The other fails if the modechange sync is ever inlined again. Suite
334 → **336**.

Not a defect: the swatch reading `#D63D64` against a `#e0446b` default is the user
having clicked in the picker — and it persisted, which is the `paint` tool-settings
path working.

## Round 2 in the app — plan items 1-3 USER-VERIFIED (2026-08-03)

The user confirmed, on a real entry, with screenshots: **colour, undo, brush, eraser,
clear, opacity — all working.** The brush ring renders, drag paints, the eraser cuts
back through a stroke leaving the layers underneath intact, and the mask brush's
"no skip whatsoever" from round 1 still holds.

That closes the `user-ux` gate for items 1-3. Items 4 and 5 are not built, so the
card stays `in-progress` rather than moving to `validating`.

## Still to do before this card can be validated

- Plan item 4: per-entry persistence and Apply. **`applyPaint` does not exist yet**,
  so the Apply button renders disabled rather than swallowing its click.
- Plan item 5: `docs/painting.md`, the `docs/masking-undo.md` mutation set, routing.

## The user's check (verify mode: user-ux)

Nothing above proves the tool FEELS right, and no test can. Outstanding.
