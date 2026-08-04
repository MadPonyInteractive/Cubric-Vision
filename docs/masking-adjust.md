# Adjust — grow, shrink, edge band, fill holes (MPI-382, MPI-431, MPI-441)

The methods that operate **over an existing mask** rather than making one: the morphological
primitive behind Grow / Shrink / Edge, and the flood behind Fill. Read before touching
`managers/distanceField.js`, `applyAdjust()`, `fillHoles()` or `MpiToolOptionsMaskAdjust`. Split out
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

**One primitive, three readings.** `signedSquaredDistanceField()` in
`managers/distanceField.js` — grow is `field <= r²`, shrink is `field <= −(e²+1)`, an edge band is
`−in² <= field <= out²`. One **range test**, three readings, and the band is a single pass rather
than a dilate with a `destination-out` erode over it. **MPI-436 points this same primitive at the
paint layer** (and is where OUTLINES belong): note it reads **alpha**, binarised at ≥128 (the
`fillHoles()` convention), and emits a hard edge.

**Why it is not a blur any more (MPI-441).** It was, and the elegance was the bug: a blurred step
edge is the ramp `Φ(d/r)`, so one Gaussian cut at `Φ(-1)` / `Φ(+1)` gave both directions. But a
blur is an **average** and a dilation is a **maximum**. Blur a 15px arm at sigma 50 and its peak
alpha falls under the cut — the arm thins away while the torso grows, and mass bleeds across the
gap between limb and torso and fills it. One averaging pass cannot be both a max and a min filter,
so the design was replaced, not retuned; both alpha thresholds went with it. The measurement below
missed it for two years because it was taken on a **circle** — the single best case for the
approximation.

**Measured, not assumed** — a signed **squared** Euclidean distance field (Felzenszwalb &
Huttenlocher, separable, O(n)). It is exact at every radius, so there is no table to keep: verified
in Chromium at the 1536 working size on a **thin + concave** subject (a 14px arm, an 86px gap to
the torso) — grow 20 puts the arm's edges at exactly 481 and 534, leaves the gap open, and the arm
survives; the 10/10 band spans exactly 591–610; shrink 50 lands the torso edge at exactly 651 and
correctly removes the 14px arm. Squared integers throughout, which is what lets `d > e` be
`d² >= e²+1` and keeps erode strict with no epsilon.

**Cost moved, and moved the right way.** The field describes the pristine shape, not the radius, so
it is built **once** in `beginAdjust()` — **125 ms** at 1536² — and each slider frame is then
**3.5 ms** including `putImageData`, flat in r. The old primitive was free to enter and 8.7 ms per
frame, 17.4 ms for a band, so any real drag is now cheaper; what it buys is a one-time hitch on
tool entry and after each Apply (which re-snapshots). Live preview was kept on those numbers.
`this._adjustImg` is reused across frames — a fresh `ImageData` per tick is a 9 MB allocation.

Outside the canvas counts as **background**, which is what the blur did implicitly (it pulled
transparency in from past the edge), so a mask running off the frame still erodes from that border
instead of being treated as infinitely wide.

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

**Not a dilate by `r` then an erode by `r`.** That close would reuse the primitive above for free,
but it only shuts holes smaller than `r` and it rounds the outline. Fill means *every* enclosed
hole, outline untouched.

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

