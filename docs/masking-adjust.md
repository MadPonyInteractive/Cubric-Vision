# Adjust — grow, shrink, edge band, fill holes (MPI-382, MPI-431)

The methods that operate **over an existing mask** rather than making one: the morphological
primitive behind Grow / Shrink / Edge, and the flood behind Fill. Read before touching
`MaskManager._morph()`, `applyAdjust()`, `fillHoles()` or `MpiToolOptionsMaskAdjust`. Split out
of [masking-tools.md](masking-tools.md) at its 200-line cap, the same way
[masking-sam3.md](masking-sam3.md) and [masking-shapes.md](masking-shapes.md) were. Related:
[masking-tools.md](masking-tools.md) (the tool family and the preview contract this obeys) ·
[masking.md](masking.md) (the layer model) · [masking-undo.md](masking-undo.md) (the one-shot
recording both Apply and Fill use).

## Grow, shrink, edge band

A method **over** an existing mask, not another way of making one — so it sits **below Detect** in
the rail, in the order the work happens. A `Grow` / `Edge` **radio GATES the sliders**: only the
live row is on screen, never both. That is a UX fix, not a preference — a visible-but-inert slider
is the first thing a user grabs, and `.mpi-…__slider-row { display: flex }` silently outranks the
UA `[hidden] { display: none }`, which is exactly how the inert row got on screen. **Inward's
track is MIRRORED** (zero at the right, growing leftward) so the pair reads outward-right /
inward-left about the mask edge — a negative `min`/`max`, not a CSS flip, which would leave the
keyboard arrows running backwards. Live preview in the pending green, then explicit **Apply**;
bake-on-release was rejected by name, because dilate-then-erode is a morphological CLOSE (pinholes
filled, corners rounded) and dragging back is **not** a restore.

**One primitive, three readings.** `MaskManager._morph(src, r)` — grow is `r > 0`, shrink is
`r < 0`, an edge band is `dilate(outward)` with `destination-out` `erode(inward)`. Blur once,
threshold the alpha once: a blurred step edge is the ramp `Φ(d/r)`, so cutting it at `Φ(-1)` puts
the edge one sigma out and at `Φ(+1)` one sigma in — both directions, one blur, radius = the blur
amount. **MPI-436 points this same primitive at the paint layer** (and is where OUTLINES belong).

**Measured, not assumed** (Chromium's blur is a three-box approximation): on a 300px circle at the
1536 working size, r of 1 · 2 · 3 · 5 · 8 · 12 move the edge **exactly** r px both ways; beyond
that CURVATURE costs a little (r=20 → 19/21, r=50 → 47/54), which is why the slider stays in real
pixels rather than carrying a fudge table. **8.7 ms** per pass, 17.2 ms for a band — live at the
working size, so the readback threshold beat needing an SVG `feComponentTransfer`.

**The two traps.** Every frame recomputes from a pristine copy taken on `beginAdjust()`, never
from the frame before it — feeding output back in makes grow-3 three times eat detail exactly
like the MPI-351 double-scale bug. And **Apply is a layer-wide one shot**, so it takes
`_recordUndo()` after the no-op guard, NOT `UndoStack.pendingLayer()`, which is a gesture
facility. Apply writes the result as the new `manualCanvas` and **clears `subtractCanvas`**: the
preview was computed from `manual AND NOT subtract` and already has the erases in it.
`tests/mask-adjust.test.cjs` guards all three.

The preview lives in `adjustCanvas` — allocated on entry, freed on discard, drawn **instead of**
`maskCanvas` so the user never judges the old shape and the proposed one at once. It is never
exported, and `discardPreview()` drops it, which is what makes Adjust the first tool to extend
that seam rather than the call site.

### Fill Holes (MPI-431)

A third button in the commit row, beside Apply and Reset. **The app is now the only thing that
closes a hole**: MPI-431 turned `mask_fill_holes` OFF in every raw template (and the detailers'
`contour_fill` with it), because the graph was silently refilling an edge band into a disc before
the sampler saw it. Audit + the node list: `.agents/mpi-kanban/tasks/MPI-431/`.

**That ruling took a second pass to land (MPI-437, 2026-08-04).** `compositeThroughMask()` in
`services/imageComposite.js` kept a private copy of the old behaviour — `if (fillHoles !== false)`,
i.e. on unless a caller opted out, and no caller ever did — so `/project/composite-media` turned a
ring mask into a disc exactly as the graph used to. It is `=== true` now: the route composites the
mask it was handed, `fillMaskHoles()` stays for an explicit opt-in, and
`tests/mask-composite.test.cjs` guards both directions. If a THIRD copy of this behaviour turns
up, it is the same bug again — the sweep is "who else closes a hole without being asked".

`MaskManager.fillHoles()` **floods the background inward from the border**; whatever the flood
never reaches is enclosed, and that is the definition of a hole — no contour tracing. Iterative
on a typed-array stack, because 1536² blows recursion. The alpha cut is `>= 128`, deliberately
not `> 0`: mask edges are antialiased, and a strict test walls the flood out of a hole it should
enter.

**Not `_morph(+r)` then `_morph(-r)`.** That close would reuse the primitive above for free, but
it only shuts holes smaller than `r` and it rounds the outline. Fill means *every* enclosed hole,
outline untouched.

#### TWO passes, because the hole has an antialiased rim

Punching a hole leaves alpha ramping 255→0 over a pixel or two, and pass 1's threshold classifies
the ramp's **inner half as mask** — so writing only the sub-threshold pixels leaves a
semi-transparent ring where the hole was, plainly visible at the overlay's 70% opacity (reported
2026-08-03). **ComfyUI's own mask editor leaves the same seam**: it is a property of
threshold-then-fill, not of this implementation. Pass 2 fixes it at the definition rather than by
post-blurring — seed from the hole interiors and expand into any neighbour that is neither
`outside` nor **already fully opaque**. Measured on the 512² ring: **437 partial-alpha pixels →
0**, sampled before at `220, 176, 132, 88, 61, 48`, the ramp itself.

The `=== 255` wall must not be relaxed to a threshold: solid mask stops the flood, so it can never
escape a hole and reach the mask's **outer** rim, whose annulus keeps **1098 → 1098** partial
pixels. Fill removes the hole seam and leaves the outline's antialiasing exactly as it was.

It fills **what is on screen** — the live preview when one is up, the composite otherwise — so
pressing Fill mid-adjustment bakes both as **one** undo entry rather than silently dropping the
preview. Same one-shot discipline as Apply. Measured at 512² (a disc r=150, r=60 hole): the hole
closes (centre 0 → 255), **the outer edge does not move** (149 → 149), and it books exactly 1
undo entry. A solid mask returns `false`; a notch cut through to the border is correctly not a hole.

