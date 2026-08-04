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
| MPI-436 | Adjust for the paint layer — grow / shrink / edge band over RGBA (the outline tool) | Reuses mask's `_morph`; the open question is what those ops mean over RGBA rather than coverage |
| MPI-439 | Convert mask to paint / paint to mask, from the canvas context menu | New, 2026-08-04 |
| ~~MPI-421~~ | Auto-mask run cost + feedback — cache per-object masks, then queue what is left | **BUILT 2026-08-04**, commit `1028b958`, awaiting the user's in-app pass (`tasks/MPI-421/validation.md`). The graph's `ImpactSEGSPicker` was the whole of MPI-402: it trimmed the masks to the chips selected at dispatch, so the fix was deleting it. Detect now shows an indeterminate bar and a Stop |
| MPI-441 | **Grow, Shrink and Edge all round the mask off** — `_morph` is a blur+threshold, i.e. an average where a dilation needs a maximum | **NEW, 2026-08-04**, from the user's screenshots. All four readings (grow, shrink, edge outward, edge inward) are one call and change together — he named them. Blocks MPI-436, which points the same primitive at RGBA |

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
3. **MPI-441 — START HERE.** New, and it jumps the queue for one reason: **MPI-436 is Adjust over
   RGBA and reuses `MaskManager._morph`**, which this card says is the wrong primitive (a blur
   averages; a dilation takes a maximum, so thin limbs thin out and concave gaps fill). Build 436
   on it and the outline tool inherits a rounding bug. Fix the primitive, then point it at paint.
4. **MPI-436** — Adjust over RGBA, i.e. the outline tool. Most fully specified card in the
   set (8 acceptance items, all three fills already worked out) and the highest user value.
   It settles the alpha question below. **Blocked on MPI-441** — same primitive.
5. **MPI-439** — inherits 436's answer for free, and is small.
6. **MPI-435** — last. Ten procedural brush presets is polish, it blocks nothing, and the
   `brushDab.js` helper it needs already shipped with MPI-375, so it keeps.

### Why 426 must precede 439 specifically

MPI-426 changes what `hasMask()` MEANS — auto picks stop counting as mask content until the
user presses Add. MPI-439's new menu item gates on `viewer.el.hasMask()`. Land 439 first and
"Convert mask to paint" is offered on an un-Added detection preview and bakes it into the
paint layer — the exact bug 426 exists to kill, reintroduced through a second door.

## The one decision both 436 and 439 need — make it ONCE

Mask is coverage; paint is RGBA. Every remaining card trips on the same question: **does an
operation read paint's alpha, or its luminance, and does it preserve soft edges?**

- MPI-436: does grow/shrink dilate the alpha channel, or the whole RGBA?
- MPI-439: does paint→mask read alpha (assumed) or luminance, and does mask→paint carry the
  mask's alpha through so a soft edge stays soft, or fill flat?

Answer it in whichever card is picked up first, write it here, and the second card inherits
it. Two cards answering it independently is how the layers end up disagreeing.

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
