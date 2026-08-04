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

## Plan item 4 — automated evidence (2026-08-03), awaiting the user's check

**Suite 336 → 340, 0 fail** (`node --test "tests/*.test.cjs"`). `npm run
lint:components` clean — the 3 warnings left in the repo are pre-existing in
`MpiAppLibrary` and `MpiPromptBox`, none in a touched file.

**The route ran for real, not from a test file.** A temp harness at the repo root
mounted ONLY `routes/projects.js` on `:3999` (no app, no port 3000, no Electron),
POSTed a 64×64 blue base with an RGBA overlay, then read the OUTPUT PIXELS back
through Sharp. Deleted afterwards. What it proved:

- painted px(10,10) = `255,0,0`, untouched px(50,50) = `0,0,255` — the layer
  composites by **its own alpha**, with no mask anywhere in the path;
- the edge is exact at px(31,31) red / px(32,32) blue — no smear from a needless
  resample;
- a **half-size** layer (the >4096 source case, where `PAINT_MAX_EDGE` caps the
  layer below the image) stretches back to the base and lands `0,255,0` — and the
  output is the BASE's 64×64, never the layer's;
- `nextSequence` gave `paint_001.png` then `paint_002.png`, the `.meta/<uuid>.json`
  sidecar was written, and the thumbnail was generated;
- all three validation legs 400: `folderPath required`, `paintDataUrl required`,
  `Source file not found`.

**Six negative controls, every one restored byte-identical.** Anchors were literal
substrings, not `\n`-anchored regexes, because the tree is CRLF.
- Renaming `el.applyPaint` → the Apply-button guard fails (the button would render
  permanently disabled and look shipped).
- Dropping `writePaint` from `_persistLayers` → fails (strokes lost on entry switch).
- Dropping `deletePaint` → fails (a cleared layer resurrects on the next visit).
- Breaking `setPaintFromDataURL` in `_restoreLayers` → fails.
- Reverting `mask-temp:delete` to `rmSync(dir, …)` → fails (Clear mask would wipe
  the paint layer).
- Removing the `typeof viewer.el.applyPaint === 'function'` gate → fails.

**One control escaped first, and that is why it was run.** The restore guard matched
the bare substring `setPaintFromDataURL`, which `setPaintFromDataURLZZ` also
contains — the sabotage passed. Tightened to a `(?![A-Za-z0-9_])` lookahead, re-run,
now fails as required.

**A shared primitive changed, so both consumers were swept.** `mask-temp:delete`
used to `rm -rf` the item dir. `paint.png` now lives in that dir, and BOTH callers
of that IPC — `el.clearMask()` and `pasteMaskLayersToEntry()` — would therefore have
silently wiped a paint layer that has nothing to do with either. It now removes
`manual.png`, `subtract.png`, `auto.json` by name; the dir still dies with the
session. The three desktop specs that touch it only assert the mask layers read back
null, so they are unaffected.

**Not run: the desktop suite.** `npm run test:desktop` needs port 3000 free and the
user's app is listening on it. The paint TEMP round-trip through the real Electron
main process is therefore proven only by source-text guards plus handlers that
mirror `write-manual`/`write-subtract` line for line — the user's hands-on check
below is what closes it.

## Round 3 in the app — plan item 4 USER-VERIFIED (2026-08-03)

**"All tests passed."** Per-entry persistence, Clear-mask-keeps-paint, no
resurrection after a clear, Apply producing `paint_001`, and the source entry
keeping its own layer — all confirmed by hand on a real entry.

**The first attempt looked like three failures and was one cause: a stale build.**
`No handler registered for 'mask-temp:write-paint'`, the same for `delete-paint`,
and `POST /project/apply-paint 404` — plus a crop that "errored but still applied"
(the crop landed, then `loadEntry` → `_persistLayers` hit the missing handler and
logged; caught, not thrown). Ctrl+R had reloaded the RENDERER, which is why the new
calls were being made at all, while `main.js` and the Express server still ran the
old code. Proved rather than asserted, before asking for anything: the running
server answered **404** for `/project/apply-paint` and **400** for
`/project/composite-media`, a route that shipped earlier. A full quit and relaunch
cleared all of it. `main.js` changes need a restart, never a reload.

**Opacity now bakes (user request, same session).** Measured on a white-on-black
probe through the live route: 1 → 255, 0.75 → **191**, 0.5 → **128**, 0.7 → **179**,
absent → 255, non-numeric → 255. Two guards added, both negative-controlled: one
fails if `applyPaint` stops sending the field, one fails if `getPaintOpacity` is
missing from `MpiCanvas._methods` — that allowlist trap would silently bake at 100%
through the optional call, with no error anywhere. Suite 340 → **342**.

**Undo not surviving an entry switch is the documented contract, not a paint bug.**
`docs/masking-undo.md` § lifetime: the stack is cleared on any LOAD — `mask.init()`,
i.e. every `loadImage`, i.e. every entry switch — and again in `_restoreLayers()`.
The mask brush has always behaved this way; paint shares the one stack by design.

## Plan item 5 — docs only, self-verified (2026-08-03)

No code changed. `git status` shows only doc files plus the card workspace, and the
suite is **342/0** — the same number Round 3 left it at, which is the evidence that
nothing executable was touched.

**Written:** `docs/painting.md`, **170 lines** (under the 200 cap). Covers the one-layer
model, `PAINT_MAX_EDGE` 4096 vs the mask's 1536 and why, the shared dab plus the
skipping-brush bug it fixed, the two "not a mask / not a preview" contracts, display
opacity vs the layer-wide Apply bake, session-scoped per-entry persistence including
the write-OR-delete rule and the `mask-temp:delete` narrowing, the sibling Apply route,
the shared undo stack, and the two seams (MPI-435's `stampDab`, MPI-368's rasterise
target with its `_recordUndo`-then-draw shape and the image-px → layer-px scale it must
do itself).

**Routed BOTH ways**, which was the item's own failure mode: a map row in
`docs/README.md` and a Context Router row in `CLAUDE.md`.

**`docs/masking-undo.md`:** the enumerated mutation set is now a two-layer table —
`PaintManager.paint()` and `clear(true)` record, `setFromDataURL()` and `init()` are
loads that record nothing — plus the rule that `paint.init()` must not clear the stack
a second time, the gesture row generalised to `mgr` (either manager), and the "cards
that will hit this" line updated (MPI-375 landed; MPI-368 is next).

**`docs/masking-tools.md`:** the taxonomy's Paint row now links `painting.md` and names
which card owns each button; the ruling paragraph records that MPI-375 shipped on it.
Kept length-neutral — that file is at **211** lines, already over the cap.

**Every identifier in the new doc was grepped back out of source before it was written
down** (18 names: `discardPreview`, `MASK_TEMP_ROOT`, `_endPaintStroke`, `_endMaskStroke`,
`_appendViewerEntry`, `_isCanvasTool`, `_PAINT_TOOLS`, `PAINT_MAX_EDGE`, `DAB_SPACING`,
`strokeDabs`, `stampDab`, `compositeOverlay`, `getPaintOpacity`, `paintEnabled`,
`takeStrokeBox`, `undoLayers`, `_recordUndo`, `nextSequence`) — all present.

**One plan premise was false and is corrected, not repeated.** Item 5 said to write a
separate doc because `docs/masking.md` was at its 200-line cap; it is at **129**. The
split still stands on the other ground (masking.md + ~90 lines of paint would cross the
cap, and paint is its own subsystem), so the doc was written as planned with the wrong
reason dropped. Drift note on the plan.

## The user's check (verify mode: user-ux)

Items 1–4 were verified by hand in the app across Rounds 2 and 3. Item 5 has no UI
surface — there is nothing to click. The card is complete pending the user's close.
