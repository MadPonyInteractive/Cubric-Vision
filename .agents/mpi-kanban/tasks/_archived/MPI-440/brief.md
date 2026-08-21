# MPI-440 — Canvas tool family umbrella #2: mask and paint parity

Successor to **MPI-424**, which is correctly `done` — its five members (MPI-425 taxonomy →
MPI-382 Adjust → MPI-368 shape gizmo → MPI-375 paint layer → MPI-373 composite) all
shipped, and its acceptance said it closes when the last of them does. This card is NOT a
reopening of that one. It covers the work that arrived *after* the taxonomy existed.

## Why a second umbrella

MPI-424 built the frame: three toolbar groups, two shared engines (one brush, one shape
gizmo) each mounted twice, a preview/discard seam in `mountOptions()`. Everything in this
card is the consequence — **the paint layer got the frame but not the parity.** Mask has
Adjust, alpha brushes are half-built, the two layers cannot exchange content, and the
detection preview still violates the preview contract MPI-382 built the seam for.

## Members

| Card | What | Note |
|---|---|---|
| ~~MPI-426~~ | A detection preview must stay a preview — stop auto-adding SAM3 picks to the live mask | **DONE 2026-08-04**, user-validated in the app. Commit `f64fc75e`; see `tasks/MPI-426/validation.md`. Two things every later member inherits: `hasMask()` now means *baked content only*, and the op strip gates on it |
| MPI-435 | Alpha brush pack — ten procedural brushes for the mask AND paint brush | Lands on the shared brush engine, so both mounts get it at once |
| ~~MPI-436~~ | Adjust for the paint layer — grow / shrink / edge band over RGBA (the outline tool) | **DONE 2026-08-04**, user-validated in the app. Commit `e3cab0f5`; see `tasks/MPI-436/validation.md`. Reuses `distanceField.js`, not the `_morph` the card names — MPI-441 had already deleted that. **It answers the alpha question below**, and its 4K cost became MPI-445 |
| MPI-445 | Paint Adjust stalls ~1.5 s on the first slider move at 4096 | New, 2026-08-04, from the user's own MPI-436 pass. The ceiling MPI-436 shipped with a `ponytail:` comment naming the fix — and the fix spends the exact radius precision MPI-441 bought, so it is a decision, not a tidy-up |
| MPI-439 | Convert mask to paint / paint to mask, from the canvas context menu | New, 2026-08-04 |
| ~~MPI-421~~ | Auto-mask run cost + feedback — cache per-object masks, then queue what is left | **BUILT 2026-08-04**, commit `1028b958`, awaiting the user's in-app pass (`tasks/MPI-421/validation.md`). The graph's `ImpactSEGSPicker` was the whole of MPI-402: it trimmed the masks to the chips selected at dispatch, so the fix was deleting it. Detect now shows an indeterminate bar and a Stop |
| ~~MPI-441~~ | **Grow, Shrink and Edge all round the mask off** — `_morph` is a blur+threshold, i.e. an average where a dilation needs a maximum | **DONE 2026-08-04**, user-validated in the app. `_morph` and both `ADJUST_*` thresholds are deleted; the primitive is now an exact distance field in `managers/distanceField.js`. See `tasks/MPI-441/validation.md`. **MPI-436 is unblocked** |

## Order

1. ~~**MPI-426**~~ — **SHIPPED 2026-08-04.** The fix turned out to be a deletion: dropping
   the auto-pick union from `MaskManager._recomposite()` made all 12
   `hasMaskContent(maskCanvas)` sites baked-only for free, and the op-strip re-gate the
   card feared needed no code at all. Its twin `_buildCompositeFromTemp()` carried the same
   bug and changed with it. **Decision recorded for the rest of the set: a bare detection
   leaves masked ops LOCKED until Add** — that is intended, not an MPI-372 regression.
2. ~~**MPI-421**~~ — **SHIPPED 2026-08-04** (commit `1028b958`), in-app pass still outstanding.
   The pairing below was right for the wrong reason: both cards did land in `exec.onMasks`, but
   the fix was not a rewrite of the chip-toggle path — it was **deleting `ImpactSEGSPicker` from
   the graph**, after which the client half fell out of a `Map` `MaskManager` already had.
   **Decision recorded for the rest of the set:** a non-generation ComfyUI run (a detect) gets
   the status bar, NOT a queue lane — it never enters `generationStore`, because a store job
   raises `generationQueueCount`, which is what disables the detect row and would therefore
   disable its own Stop. It drives `StatusBar.progress.*` directly rather than emitting `tool:*`.
3. ~~**MPI-441**~~ — **SHIPPED 2026-08-04.** It jumped the queue because MPI-436 reuses the same
   primitive, and the primitive was wrong. The replacement is **not** the disc-stamping the card
   floated: a signed squared Euclidean distance field, built ONCE on tool entry because it
   describes the shape and not the radius. Grow, shrink and both halves of the band are one
   inclusive range test over it. **Decisions recorded for the rest of the set:**
   - **The primitive reads ALPHA**, binarised at ≥128 (the `fillHoles()` convention), and emits a
     hard edge. That is a floor under the question below, not an answer to it — MPI-436 still has
     to decide whether grow/shrink over RGBA moves the alpha channel alone or the whole pixel, and
     whether a soft edge survives. What it may NOT do is re-decide *which channel is the shape*.
   - **The cost model inverted.** Entry now costs 125 ms at 1536² and each frame costs 3.5 ms flat
     in r, where the blur was free to enter and 8.7 ms per frame (17.4 for a band). A tool that
     rebuilds the field per frame throws the entire benefit away — build on `beginAdjust()`.
   - **Outside the canvas counts as background**, so a layer running off the frame still erodes
     from that border. Paint must not silently pick the opposite convention.
4. ~~**MPI-436**~~ — **SHIPPED AND USER-VALIDATED 2026-08-04.** Its three fills were right as
   written; what was wrong was the primitive it named (`_morph`, deleted by MPI-441 the day before —
   **check a card's named function still exists before starting it**). The user settled its open
   judgement call by name: **Edge REPLACING the scribble with its outline is wanted** — do not
   revisit it. **Decisions recorded for the rest of the set:**
   - **THE ALPHA QUESTION IS ANSWERED — see below.**
   - **One panel, two destinations.** `MpiToolOptionsMaskAdjust` is registered under BOTH
     `maskAdjust` and `paintAdjust` and picks a `DEST` row off `props.mode`, the MPI-368 / MPI-373
     pattern. The paint row adds a colour picker and drops Fill Holes; nothing else branches.
   - **Paint's Apply must NOT call `onMaskStrokeEnd`.** That is the viewer's one mask publish path
     and it re-gates the op strip; a paint mutation riding it claims a mask that does not exist.
     Same line the shape commit's paint branch already draws.
   - **An unapplied paint ADJUSTMENT is a preview and extends `discardPreview()`** — even though the
     paint LAYER never did. A stroke is committed pixels; a proposed one is not.
   - **Cost is quadratic in the source.** 2048² → 247 ms first frame then 7 ms; 4096² → 1563 ms then
     64 ms. **The user hit the 4K row immediately** and it is now **MPI-445**. MPI-435 should not
     assume the paint layer is cheap to scan whole.
5. **MPI-439 — START HERE.** Inherits 436's alpha answer for free, and is small.
6. **MPI-445** — the 4K stall. Independent of 439 and 435 (they do not touch that path), so it can
   go before or after them; it is the only member that spends a decision rather than adding a
   feature, because the obvious fix gives back MPI-441's exactness.
7. **MPI-435** — last. Ten procedural brush presets is polish, it blocks nothing, and the
   `brushDab.js` helper it needs already shipped with MPI-375, so it keeps.

### Why 426 must precede 439 specifically

MPI-426 changes what `hasMask()` MEANS — auto picks stop counting as mask content until the
user presses Add. MPI-439's new menu item gates on `viewer.el.hasMask()`. Land 439 first and
"Convert mask to paint" is offered on an un-Added detection preview and bakes it into the
paint layer — the exact bug 426 exists to kill, reintroduced through a second door.

## The one decision both 436 and 439 need — ANSWERED by MPI-436, 2026-08-04

Mask is coverage; paint is RGBA. The question was: **does an operation read paint's alpha, or its
luminance, and does it preserve soft edges?**

**The shape of the paint layer is its ALPHA, binarised at ≥128** — the `fillHoles()` cut, the one
`signedSquaredDistanceField()` already applies. **Not luminance**: a dark scribble is as painted as
a light one, and reading luminance would make a black stroke read as background.

**Soft edges: the boundary an operation CREATES is hard; every pixel that boundary does not touch
keeps its own colour AND its own alpha.** That is not a compromise, it is what makes shrink lossless
in the interior and grow's new ring the only flat part. MPI-436's three fills are the worked
example (`docs/masking-adjust.md` § The paint layer).

**MPI-439 inherits this, and must not re-decide it.** paint→mask reads alpha at the same ≥128 cut.
mask→paint is the one direction still open, and it is a fill question, not a channel question: the
mask's own antialiased rim can be carried through as alpha or filled flat — decide it there, but
the CHANNEL is settled.

## Standing constraints — these did not expire with MPI-424

- **THE PREVIEW CONTRACT** (user, 2026-08-02): every tool is visited, previewed, then
  applied — or the preview goes away. An unapplied preview must never outlive its tool.
  MPI-382 built the discard seam in `mountOptions()`; new tools hang their previews on it
  and do not re-decide it. MPI-426 is this contract's outstanding violation.
- **Mask and paint mutations are UNDOABLE.** `docs/masking-undo.md`: layer-wide one shot →
  `_recordUndo()` before mutating and after the no-op guard; a gesture →
  `undo.begin()` / `commit(rect)`. Only `manualCanvas` + `subtractCanvas` (mask) and
  `paintCanvas` (paint) are stored — `maskCanvas` and `autoCanvas` are derived.
- **Layer ORDER rule from MPI-371 holds:** auto picks union last, so nothing baked into
  manual may resurrect an erased region.
- Every new tool registers in `_MASK_TOOLS` (where it is mask family) and in
  `TOOL_OPTIONS_REGISTRY` — the MPI-381 guard test fails if one is missing.
- **Docs are capped at 200 lines each.** Measured 2026-08-04: `masking.md` 146,
  `masking-tools.md` 153, `masking-sam3.md` 128, `masking-adjust.md` 95,
  `masking-shapes.md` 109, `masking-undo.md` 141, `painting.md` 172, `composite.md` 184.
  All under. (MPI-424's brief said `masking-tools.md` was "211 — already over"; that was
  stale by the time this card opened. Re-measure, do not inherit the number.) Write the
  fact to the doc it belongs to; there is no catch-all and none may be created.

## Closing this card

Holds no implementation of its own. Closes when all five members are `done` — or when a
member is explicitly rejected and that decision is recorded here, the way MPI-424 recorded
MPI-379's rejection.
