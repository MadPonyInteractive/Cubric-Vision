# MPI-376 — Canvas undo

## State of the world

`grep -rn undo js --include=*.js -i` returns **comments only**. There is no undo
anywhere on the canvas. Masks survive that because a mask is a rough selection and
Detect/Points can regenerate one. Paint (MPI-375) does not: one bad stroke over
twenty good ones and the only recovery is Clear paint and start again.

So paint is the driver, and this card exists so the undo is designed once instead of
being smuggled in as a private stack inside the paint tool.

## Shape

- Command stack owned by `MpiCanvas` (not by any one tool) so paint, composite
  (MPI-373) and possibly masking all share it.
- One stroke = one command. `pointerdown` opens it, `pointerup` closes and pushes it.
- Ctrl+Z undo, Ctrl+Shift+Z redo, bound via `Hotkeys.bind` with ids registered in
  `js/managers/hotkeyRegistry.js`. Never a raw `window.addEventListener('keydown')`.
- Cleared on entry switch and on tool teardown. Undo must never reach across two
  different images.

## Memory is the constraint — decide before coding

Mask/paint layers run to the `MASK_MAX_EDGE = 1536` bound. A full RGBA snapshot at
1536² is ~9MB. A naive 20-deep snapshot stack is ~180MB *per layer*.

Default to **dirty-rect patches**: store the bounding box a stroke touched, before and
after. A brush stroke touches a small fraction of the canvas, so the typical command
costs kilobytes. Keep whole-layer snapshots for layer-wide ops only (Clear, a Detect
result landing, paste).

Measure and record the real per-command cost during the work — the acceptance criteria
ask for a measured number, not an estimate.

## The masking half is conditional — and the condition is a stop rule

Extend to masks **only if it is not a big refactor**. `MaskManager` juggles four things
(`manualCanvas`, `subtractCanvas`, `autoPickMasks`, `selectedAutoPicks`) plus the
layer-ORDER rule fixed during MPI-371: **auto picks union LAST**, so a fresh detection
beats an older erase. Undo has to preserve that ordering, not just restore bitmaps.

If routing every mask mutation through commands means restructuring `MaskManager`:
**stop, split the mask half onto its own card, say why.** Half-wiring undo across some
mask mutations and not others is worse than no mask undo at all — the user learns to
trust it and then loses work at the first unwired path.

## Read first

`docs/masking.md`, `js/components/Primitives/MpiCanvas/managers/MaskManager.js`,
`.claude/rules/components.md` (teardown contract — the stack is state that must die in
`destroy()`), `js/managers/hotkeyRegistry.js`.
