# MPI-447 — Adjust's dead Reset, and the conversion's default colour

Member of **MPI-440**. Opened from the user's in-app pass over MPI-445 and MPI-439:

> "for adjust, Reset stopped working. Applied did too. Converting mask to paint does not
> acquire the current colour of the paint."

Three reports, two confirmed regressions, one that does not reproduce.

## 1. Reset — a mounted button with no handler

**Root cause, found in the diff, not guessed:** `e3cab0f5` (MPI-436) rewrote the commit row for
two destinations and deleted `resetBtn.on('click', _reset);` while inserting the comment above
`_children.push(...)`. `git show e3cab0f5 -- …MpiToolOptionsMaskAdjust.js` shows the line removed
with nothing replacing it.

Why nothing caught it: the button still mounted, still went into `_children`, still destroyed
cleanly, and every existing test in `mask-adjust.test.cjs` asserts *manager* behaviour. A control
that renders and does nothing is invisible to all of them. **The guard added here is per-button
and checks the handler exists** — the only shape of test that could have failed.

Proven by clicking the real button in a mounted panel in Chromium: before the fix the slider stayed
at 15 with the preview still up; after it, slider `0`, `hasPaintAdjustPreview() === false`, layer
untouched.

## 2. mask → paint painted `#e0446b`

`PaintManager.color` is **panel state**. It is only ever set by a paint-family panel's `setup()`
(`viewer.el.setPaintColor(startColor)`) or its picker's `change`. Reach the context menu from a
mask tool — the normal way — and no paint panel has run in that canvas' lifetime, so the layer
still holds the module default. A canvas remount (entry switch) resets it the same way.

**The durable "current colour" is the project's `paint` tool setting**, which is exactly what both
pickers read on mount and write on change. The Block resolves it there before converting, and pushes
it through `setPaintColor` so the layer and the panels stay in step.

## 3. Apply — did NOT reproduce

Driven at three levels, all green:

- **Managers** — `previewAdjust` then `applyAdjust` grows the layer on both mask and paint, and a
  second Apply in the same visit works too.
- **Panel wiring** — clicking the real Apply button calls `applyPaintAdjust` / `applyMaskAdjust`
  (stub viewer recording calls).
- **End to end** — the real panel on a real `MpiCanvas`: paint ink `125676 → 151892`, slider back to
  `0`, preview torn down. `evaluateMask()`, the one thing the mask's Apply does that the probes
  bypassed, is read-only — it cannot revert a bake.

So the report needs one detail before anything is changed: **what does "Apply stopped working" look
like — nothing happens, the layer reverts, or the result is wrong — and on the mask or the paint
destination?** A plausible reading is that it was Reset's death being felt twice: with Reset dead,
Apply's own behaviour (slider snaps to 0, preview replaced by an identical baked layer) is easy to
read as "nothing happened". Do not close this on that theory without the user's word.
