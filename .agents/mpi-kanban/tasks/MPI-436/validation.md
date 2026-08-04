# MPI-436 — validation

## The card text was stale before a line was written

It specs `MaskManager._morph(src, r)`, "blur-then-threshold over a canvas ALPHA channel". **MPI-441
deleted `_morph`** the day before. The reuse the card asked for is unchanged in substance and is
now `managers/distanceField.js` — one module, imported by both managers. Everything else in the
card's SHAPE OF THE WORK section survived contact.

## Acceptance, item by item

- [x] **ONE primitive drives both layers.** `PaintManager` imports
      `signedSquaredDistanceField` / `rangeFor` / `writeRange`; there is no second dilate anywhere.
      Guarded by `tests/paint-adjust.test.cjs` — the test also fails if a local `_morph(` or a
      `function …Distance…` reappears in the file.
- [x] **Grow fills the new ring in the current colour and leaves existing pixels their own.**
      Region = original ∪ ring, filled flat through `source-in`, original drawn back on top.
- [x] **Shrink eats the edge inward and changes no surviving pixel's colour.** The region CLIPS
      the original (`source-in` with `drawImage`), so nothing is repainted — no `fillStyle` in that
      branch at all, which is what the test asserts.
- [x] **Edge band produces an OUTLINE in the current colour.** The band alone; it REPLACES the
      scribble, exactly as mask Edge replaces the mask. See "the one judgment call" below.
- [x] **Live preview then explicit Apply, every frame off the pristine copy.** `_ensureAdjustField()`
      reads `_adjustPristine` and never `adjustCanvas`; `beginAdjust()` invalidates.
- [x] **Discarded by `discardPreview()`, recording no undo.** Extends the ONE seam
      (`MpiCanvasViewer.el.discardPreview`), never the `mountOptions()` call site. `init()` drops it
      too — a preview must not outlive the pixels it previewed.
- [x] **Apply records exactly ONE `UndoStack` entry**, layer-wide one shot, `_recordUndo()` after
      the no-op guard and before the write. Not `pendingLayer()`, which is a gesture facility.
- [x] **In `_PAINT_TOOLS` and `TOOL_OPTIONS_REGISTRY`, mask Adjust unchanged.** The existing
      generic scrapes in `tests/mask-tool-registry.test.cjs` cover the new mode; 37/37 still pass.

## Evidence

- [x] `node --test "tests/*.test.cjs"` — **417/417**, including the 9 new ones in
      `tests/paint-adjust.test.cjs`
- [x] `npx eslint js/` — 0 errors (19 pre-existing warnings, the MPI-442 baseline, none in the
      touched files)
- [x] **Real-pixel probe, Chromium, a two-colour square so a repaint cannot hide** — 28/28. The
      probe module was temporary and is deleted; it is reproducible from this table.

  | Reading | Expected | Measured |
  |---|---|---|
  | shrink 10, x=59 / x=60 | gone / kept **RED** | gone / kept RED |
  | shrink 10, interior | red and blue untouched | untouched |
  | shrink 10, x=139 / x=140 | kept BLUE / gone | kept BLUE / gone |
  | grow 10, x=39 / x=40 | outside / **GREEN** ring | outside / GREEN |
  | grow 10, x=50 | original RED survives | RED |
  | grow 10, x=159 / x=160 | ring / outside | ring / outside |
  | band 5/5, x=44 / 45 / 54 / 55 | out / green / green / out | exact |
  | band 5/5, interior x=100 | empty — the scribble is replaced | empty |
  | Apply | bakes ring + keeps red, preview dropped, field re-invalidated | all three |
  | re-adjust after Apply | grows off the BAKED shape (x=30 green, x=29 out) | exact |
  | zero slider | no preview AND no field built | both |
  | scale, 8192 source | layer 4096, 20 image px = 10 layer px (x=990 green, x=989 out) | exact |

- [x] **Cost measured, not estimated** — first slider move, then each later frame:
      **2048² → 247 ms then 7 ms**; **4096² → 1563 ms then 64 ms**. The mask is 125 ms / 3.5 ms at
      1536². The second row is a real ceiling and is written down in the code
      (`ponytail:` comment), `docs/masking-adjust.md` and below.

## The one judgment call, and one ceiling — both for the user

1. **Edge REPLACES the scribble with its outline**, because that is what the card specified
   ("dilate(outward) minus erode(inward), filled in the current colour") and what mask Edge already
   does. If "outline my scribble" was meant to mean *keep the scribble AND add an outline*, that is
   a different fill — one extra `drawImage`, not a redesign.
2. **A source over 4096 px freezes for ~1.5 s on the first slider move.** Not fixed: the fix caps
   the field at 1536 and upscales the region mask, which pays back the exact radius precision
   MPI-441 was written to buy. Deliberately deferred until someone reports it.

## Not covered here

No in-app pass yet — every reading above is from the real `PaintManager` in Chromium, not from the
rail. The user's pass is the outstanding half: mount **Paint → Adjust**, check the colour picker
drives the ring, and confirm the band reads as an outline on a real scribble.
