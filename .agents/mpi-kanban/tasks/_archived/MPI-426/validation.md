# MPI-426 — validation

## The decision this card was blocked on

`task.json` said "re-gate the op strip on baked content"; `brief.md` said "unlock on ... a
detection exists". Opposite answers to the same question, and `brief.md` flagged the fix
shape as *not yet decided*.

**User chose, 2026-08-04: baked content only.** A bare detection leaves the masked ops
locked until Add.

Why the alternative was rejected: the op strip gates on `hasMask()` — the *same* signal
that decides what gets sent. Unlocking on a live detection would offer a masked op while
`getCurrentMaskDataURL()` returned the empty baked mask, so the op would run unmasked
while the UI implied the detection counted. That is the same class of bug this card
exists to remove, relocated to dispatch time.

**Consequence: the op strip needed NO new code.** `_opOptions()` already reads
`hasMask()`, so re-gating happened for free once `maskCanvas` stopped carrying picks. The
MPI-372 regression the card feared is not one — the strip staying locked until Add is the
intended behaviour under this decision.

## Root cause

`maskCanvas` answered two questions at once: *what is on screen* and *what gets sent*.
`MaskManager._recomposite()` unioned `selectedAutoPicks` into it, and all 12
`hasMaskContent(maskCanvas)` sites in `MpiCanvasViewer.js` plus `getURL()` read that one
canvas.

## The fix — a deletion, not an addition

1. `MaskManager._recomposite()` — dropped the pick-union step. Mask is now
   `manual AND NOT subtract`. Every one of the 12 consumers flipped to baked-only for
   free; none needed editing.
2. `MpiCanvasViewer._buildCompositeFromTemp()` — the twin. It unioned *persisted* picks
   into the composite that becomes `_previewMaskCache`, which `getCurrentMaskDataURL()`
   returns while the live canvas is torn down. Same bug, second door. Fixed in the same
   pass.
3. Comments at both sites and at `exec.onMasks` rewritten — the old one stated the
   now-reversed MPI-372/384 contract as fact.

**Display verified unaffected.** `MpiCanvas._renderOverlay()` already draws `autoCanvas`
recoloured on top (MPI-361), and that recolour is opaque — it never mattered that white
sat underneath. Pixel-identical before and after.

Not touched, deliberately: `bakeAutoPicksInto()` (writes manual/subtract directly, always
correct), pick persistence (still saved and restored — it rehydrates the preview and the
thumb strip across entry switches, it just stops counting as content).

## Proof

Real-pixel probe driving the actual `MaskManager` in Chromium (temp module under `js/`,
imported off :3000, deleted after). **12/12 PASS.**

Asserted: painted pixel is content · un-Added detection absent from `maskCanvas` **and**
from the export · painted pixel still exported alongside it · detection present on
`autoCanvas` with `hasAutoLayer` set · Add bakes it into both · auto layer emptied after
Add · Add-then-Subtract punches it back out.

**Sabotage control run** (the union restored, page closed and reopened to defeat
Chromium's module cache): **2 FAILED** — exactly the two assertions that describe the bug
(`un-Added detection is NOT in maskCanvas — alpha=255`, and the export twin). The probe
can fail, so green means something.

`node --test "tests/*.test.cjs"` → **392/392**. eslint on both changed files → 0 errors,
0 new warnings. `tests/desktop/mask-persist-roundtrip.spec.js` asserts persistence and
`selectedAutoPicks.size`, neither of which this change touches.

## NOT verified

No live click-through in the app — the probe drives the manager directly, not the Detect
button and the op strip together. The gating logic is unchanged code reading a changed
value, so the risk is low, but "detect, see the strip stay locked, press Add, see it
unlock" has not been watched happen.

## Docs

`docs/masking.md` — layer table + new § "A detection is NOT mask content until Add",
replacing the stale § on composite order. `docs/masking-tools.md` — the MPI-372 bullet now
excludes detections. `docs/masking-sam3.md` — added to § "Behaviour you must not fix",
since a locked strip after a detect reads as a bug.
