# MPI-431 — plan

Compact plan. The card had two halves; **the workflow half is already shipped**
(user-edited raw + agent-run sync, 18 destroying nodes → 0, verified against the runtime
graphs — see `workflow-worklist.md`). This plan covers only the remaining **app half**.

## Goal

A **Fill Holes** action in the Adjust panel. The graphs no longer fill the user's mask,
so the app becomes the only place a hole gets closed — and the place where the user can
SEE what is being filled before committing it.

## Approach

`MaskManager.fillHoles()` mirrors the proven shape of `applyAdjust()` — same undo
discipline, same layer write-back, different transform:

```
_recordUndo()
  → flood-fill the BACKGROUND inward from every border pixel
  → any background pixel the flood never reached is an enclosed hole → set opaque
  → write result to manual, clear subtract, _recomposite()
  → beginAdjust() to re-snapshot the pristine copy
```

**Why a flood fill and not `_morph(+r)` then `_morph(-r)`.** The morphological close
would reuse the existing primitive for free, but it only closes holes smaller than the
radius and it rounds the outline. "Fill holes" means *every* enclosed hole regardless of
size, with the outline untouched. Iterative stack flood fill over the alpha channel,
~25 lines, no recursion (a 1536² mask would blow the stack).

**Clearing subtract is required, not incidental** — same reasoning as `applyAdjust()`:
the fill is computed from `manual AND NOT subtract`, so the erases are already baked into
the result and leaving subtract behind would punch them a second time.

## Decision taken (user-approved 2026-08-03)

**If a slider preview is up when Fill is pressed, it fills what is ON SCREEN** — so Fill
also bakes the pending adjustment, as **one** undo entry. The alternative was silently
discarding the user's preview, which is worse. Ctrl+Z steps back before both.

## Steps

1. `MaskManager.fillHoles()` + the flood fill. → verify: unit test, disc-with-hole.
2. Register `fillHoles` in `MpiCanvas._methods` — the allowlist; a missing name is
   `undefined` on `el` and fails silently. → verify: the registry guard test.
3. `MpiCanvasViewer` passthrough (`el.fillMaskHoles`). → verify: called from the panel.
4. Fill button in `MpiToolOptionsMaskAdjust`'s commit row + one new icon in
   `js/utils/icons.js` (no fill/bucket glyph exists — checked). → verify: in the app.
5. `tests/mask-adjust.test.cjs`. → verify: `node --test "tests/*.test.cjs"` green, and a
   negative control that FIRES (assert the sabotage applied before trusting the run).

## Acceptance

- A disc with a punched hole → Fill → hole gone, **outer radius unchanged**.
- Exactly **1** undo entry; Ctrl+Z restores the hole.
- Fill with no holes present is a no-op that records no undo entry.
- Fill with a slider preview up bakes both, as one entry.
- Leaving the tool without Fill discards nothing permanent (preview contract holds).

## Constraints carried in

- Mask mutations are UNDOABLE — `docs/masking-undo.md`. An unwired mutation is a silent
  hole in Ctrl+Z.
- `MpiCanvas._methods` is an ALLOWLIST.
- Tests run as `node --test "tests/*.test.cjs"` (quoted glob; the directory form dies on
  Node v24).
- Working tree is CRLF — a Node replace using a literal `\n` silently misses. Assert a
  sabotage APPLIED before trusting a negative control.
- Other hands in this tree — commit by explicit pathspec, never `git add -A`.
