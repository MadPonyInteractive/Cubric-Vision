# MPI-447 — validation

Fixed 2026-08-05. Two of three reports fixed and verified; the third could not be reproduced and is
open pending one detail from the user.

## Reset — fixed and clicked

`resetBtn.on('click', _reset);` restored in `MpiToolOptionsMaskAdjust`, with the comment naming what
Reset IS (the in-tool half of the preview contract) so the next rewrite of that block has a reason
not to drop it again.

Measured in Chromium by mounting the real panel on a real `MpiCanvas` and clicking the real button:

| | slider after click | preview after click | layer |
|---|---|---|---|
| before the fix | `15` | still up | untouched |
| after the fix | `0` | torn down | untouched |

`tests/mask-adjust.test.cjs` gains **every button in the commit row is WIRED** — one assertion per
button. It is the only test shape that could have caught this: the button mounted, rendered and
destroyed cleanly for two shipped cards while doing nothing.

## mask → paint colour — fixed at the source of truth

The Block now resolves `getToolSettings(state.currentProject || {}, 'paint', {}).color` and pushes it
through `setPaintColor()` before converting, so the conversion uses the colour the picker shows even
when no paint tool has been mounted in this canvas' lifetime. Guarded in
`tests/layer-convert.test.cjs`.

Not fixed inside `PaintManager` on purpose: the manager's `color` is correct as *layer* state, and
making the manager reach for project settings would put a data-layer dependency in a pixel manager.
The Block is where the other tool-settings reads already live.

## Apply — not reproduced, still open

Green at all three levels: managers (`applyAdjust` grows both layers, twice in one visit), panel
wiring (the click calls `applyPaintAdjust` / `applyMaskAdjust`), and end to end on a real canvas —
paint ink `125676 → 151892`, slider back to `0`, preview down. `evaluateMask()` — the only step the
mask's Apply takes that the probes bypassed — is read-only and cannot revert a bake.

**Open question for the user:** nothing happens, the layer reverts, or the result is wrong — and on
the mask or the paint destination? Until that is answered this card stays in `doing`.

`npm test` green — **430/430**. `eslint` clean on both changed files.

## User pass, 2026-08-05 — closed

Reset and the conversion colour both confirmed working in the app. **Apply works too on the
restarted build**, which settles report 3 the way the brief guessed: with Reset dead, Apply's own
feedback (sliders snapping to 0, the preview replaced by an identical baked layer) read as nothing
happening. No Apply change was made, and none was needed.

One follow-up from the same pass — *"converting mask to paint, the opacity doesn't match"* — is
**not an opacity bug and needs no pixel change.** The conversion is a COPY, and the mask draws OVER
the paint (`_renderOverlay` step 1 paint, step 2 mask), so the new colour is being seen through the
70% white mask overlay: `#c41c24` at 93% ≈ (200,42,48), under white at 70% = (238,191,193) — the
pale pink in the screenshot, against a vivid red where the user painted outside the mask. Clearing
or hiding the mask shows the real colour. The toast now says *"Converted to paint — mask kept on
top"* so the copy is visible in words rather than only in pixels.
