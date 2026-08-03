# The canvas tool family

The rail's tool GROUPS, the contract every tool obeys, and how the PromptBox lives inside them.
Split out of [masking.md](masking.md) at its 200-line cap (MPI-382) — that doc keeps the layer
model, the display-vs-export split and the overlay draw. Read this before adding a canvas tool,
or before changing what a tool does when the user leaves it. Architecture and card order:
`.agents/mpi-kanban/tasks/MPI-424/brief.md`.

## The preview contract (MPI-382)

**Every tool is visited, previewed, then applied — or the preview goes away.** An unapplied
preview must not outlive its tool. This is not tidiness: previews that survive stack on each
other, so the user judges a composite he never committed to while the graph receives something
else again.

`mountOptions()` calls `viewer.el.discardPreview()` on every rail switch — **ONE seam**, never a
per-tool branch at that call site. The viewer's own guard decides whether there is anything to
drop, and `MpiHistoryTools._activate()` already returns early on an unchanged mode, so it cannot
re-enter on a re-click.

The discard drops the **whole** preview — auto layers, pick set, thumb strip, persisted entry.
Clearing only the canvas half left the strip advertising selected picks for pixels that no longer
existed, and re-entering Detect rehydrated that stale selection. It never touches `manualCanvas`
or `subtractCanvas`: those are committed pixels. A discard is not an edit, so it records **no**
undo entry.

**MPI-368 (shapes) and MPI-373 (composite) extend `discardPreview` — not the call site.**

This guard exists because the wiring was ABSENT rather than wrong. `_exitAutoMaskMode(false)` was
already correct and simply had no caller, and neither did `commitAutoMask`; so a detection
survived every rail switch, stayed in `maskCanvas`, and was injected into the graph without `Add`
ever being pressed. Nothing failed — that is what made it survive so long, and it is also
MPI-365's open "detected-but-not-applied mask is still injected" item.
`tests/preview-contract.test.cjs` guards every half of it.

## Adjust — grow, shrink, edge band (MPI-382)

A method **over** an existing mask, not another way of making one — so it sits **below Detect**
in the rail, in the order the work happens. A `Grow` / `Edge` **radio GATES the sliders**: only
the live row is on screen, one bidirectional Shrink / Grow or Outward + Inward, never both. That
is a UX fix, not a preference — a visible-but-inert slider is the first thing a user grabs, and
`.mpi-…__slider-row { display: flex }` silently outranks the UA `[hidden] { display: none }`,
which is exactly how the inert row got on screen. **Inward's track is MIRRORED** — zero at the
right, growing leftward, so the pair reads outward-right / inward-left about the mask edge; it is
a negative `min`/`max` rather than a CSS flip, which would leave the keyboard arrows running
backwards. Live preview in the pending green, then explicit **Apply**.
Bake-on-release was rejected by name: dilate-then-erode is a morphological CLOSE (pinholes
filled, corners rounded), so dragging back is **not** a restore.

**One primitive, three readings.** `MaskManager._morph(src, r)` — grow is `r > 0`, shrink is
`r < 0`, an edge band is `dilate(outward)` with `destination-out` `erode(inward)`. Blur once,
threshold the alpha once: a blurred step edge is the ramp `Φ(d/r)`, so cutting it at `Φ(-1)`
puts the edge one sigma out and at `Φ(+1)` one sigma in. Both directions, one blur, radius =
the blur amount.

**Measured, not assumed** (Chromium's blur is a three-box approximation): on a 300px circle at
the 1536 working size, r of 1 · 2 · 3 · 5 · 8 · 12 move the edge **exactly** r px both ways.
Beyond that CURVATURE costs a little — r=20 gives 19/21, r=50 gives 47/54 — which is why the
slider stays in real pixels instead of carrying a fudge table. **8.7 ms** per pass, 17.2 ms for
a band: live at the working size with room to spare, so the readback threshold beat needing an
SVG `feComponentTransfer`.

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

`MaskManager.fillHoles()` **floods the background inward from the border**; whatever the flood
never reaches is enclosed, and that is the definition of a hole — no contour tracing. Iterative
on a typed-array stack, because 1536² blows recursion. The alpha cut is `>= 128`, deliberately
not `> 0`: mask edges are antialiased, and a strict test walls the flood out of a hole it should
enter.

**Not `_morph(+r)` then `_morph(-r)`.** That close would reuse the primitive above for free, but
it only shuts holes smaller than `r` and it rounds the outline. Fill means *every* enclosed hole,
outline untouched.

#### TWO passes, because the hole has an antialiased rim

Punching a hole leaves alpha ramping 255→0 across a pixel or two. Pass 1's threshold classifies
the ramp's **inner half as mask**, so writing only the sub-threshold pixels leaves a
semi-transparent ring exactly where the hole used to be — plainly visible at the overlay's 70%
opacity, and reported by the user 2026-08-03. **This is the same seam ComfyUI's own mask editor
leaves**, so it is a property of threshold-then-fill, not of this implementation.

Pass 2 fixes it at the definition rather than by post-blurring: seed from the hole interiors and
expand into any neighbour that is neither `outside` nor **already fully opaque**. Measured on the
512² ring: **437 partial-alpha pixels → 0**, sampled before at `220, 176, 132, 88, 61, 48` — the
ramp itself.

The `=== 255` wall is doing double duty and must not be relaxed to a threshold: solid mask stops
the flood, so it can never escape a hole and reach the mask's **outer** rim. Measured: the outer
annulus keeps **1098 → 1098** partial pixels, i.e. Fill removes the hole seam and leaves the
outline's antialiasing exactly as it was.

It fills **what is on screen** — the live preview when one is up, the composite otherwise — so
pressing Fill mid-adjustment bakes both as **one** undo entry rather than silently dropping the
user's preview. Same one-shot discipline as Apply: `_recordUndo()` after the no-op guard, result
replaces `manualCanvas`, `subtractCanvas` cleared, pristine re-snapshotted.

Measured against real pixels at 512² (a disc r=150 with an r=60 hole punched): the hole closes
(centre alpha 0 → 255), **the outer edge does not move** (149 → 149), no partial-alpha pixel
survives inside it, and it books exactly 1 undo entry. A solid mask returns `false` and books
none. A notch cut through to the border is correctly **not** a hole.

## Add / Subtract — the commit half

App-side, via `bakeAutoPicksInto()` — no `AddMask`/`SubtractMask` nodes, no extra round trip.
Shown for **both** sources: a run renders green and waits to be committed either way.
`el.bakeAutoPicks()` clears thumbs, pick store and points together — mode-agnostic by design.
**Add is mandatory since MPI-382**: skip it and leaving the tool discards the detection.

## Canvas tool taxonomy (MPI-425)

Groups are **by artifact**, not by feature; engines are shared ACROSS groups, so a new
destination never means a new engine. Order + cards: `tasks/MPI-424/brief.md`.

| Group | Artifact | Buttons | Engine | PromptBox |
|---|---|---|---|---|
| `Mask` | binary mask layers | brush · detect · adjust · shapes (368) | brush, gizmo | keeps it |
| `Paint` | RGBA paint layer (375) | brush · shapes | the SAME two | keeps it |
| `Composite` | blended image (373) | mask comp · paint comp | one op, two front ends | **no** |

`Paint` keeps the box because paint → mask → detail is one operation; `Composite` ends at its own
Apply and needs the column for its slots. Recorded so MPI-375 / MPI-373 do not re-decide it —
neither branch exists yet and neither may be stubbed in early. **Only working tools ship**: a
method with no panel gets no button, never a greyed placeholder.

**Same job, different engine → one COLLAPSE button.** `Detect` is one rail button that opens
`points` / `text` / `auto` in a floating strip (`MpiPopup`, `position: 'right'`, auto-dismiss on an
unhovered timer). It activates nothing and keeps a fixed icon — never the last-used method's
identity. **The modes underneath are ordinary modes**, still registered in `_MASK_TOOLS` and
`TOOL_OPTIONS_REGISTRY` and still scraped by `mask-tool-registry.test.cjs`. Presentation collapsed;
plumbing did not. Different jobs (brush vs shapes vs adjust) stay separate buttons.

## The tool family (MPI-371, split MPI-381)

Inside the `Mask` group, each tool owns its method-specific parts and mounts the shared
compounds:

| Piece | Owns |
|---|---|
| `MpiToolOptionsMaskBrush` | nothing — it **is** the strip with its brush pair |
| `MpiToolOptionsMaskAdjust` | the Grow/Edge mode radio, its one slider row, Apply + Reset |
| `MpiToolOptionsMaskPoints` | click instructions, Clear points |
| `MpiToolOptionsMaskText` | the object name + how many to find (stamped `name:N`) |
| `MpiToolOptionsMaskDetect` | model radio (Face / Hand / Person) + Box / Segment |
| `MpiMaskDetectRow` | thumbs · Detect · Add / Subtract, blocked as a unit while Cue is busy |
| `MpiMaskStrip` | paint / erase (**optional**) · invert · B/W view · clear · opacity |

**One job each.** Only the Brush tool paints. `brush: false` is not cosmetic — the strip forwards
it to `setMaskPaintEnabled()`, so a brushless tool pans on drag, zooms on wheel and keeps its
cursor. The flag lives on the **viewer**: a canvas rebuild would otherwise restore the manager
default (`true`) and silently re-arm the brush. Settings persist under the **one** `mask` tool key
and survive a tool swap. Three things must stay true through any further split:

- **`destroy()` calls `setMaskPointsMode(false)`** — points mode owns the right mouse button;
  without it the image context menu stays dead after leaving the tool.
- **A tool swap must not clear the mask.** `manualCanvas` + `subtractCanvas` are the user's work;
  only the auto layer is disposable. Nothing on a mount path may call `clearMask()` —
  `_exitMode()` only sets `activeMode = 'none'`.
- **Every mask tool is registered in `_MASK_TOOLS`** (`MpiGroupHistoryBlock`) — teardown, the
  PromptBox gate and `_viewerModeFor()` (rail mode → the viewer's single `'mask'`) all hang off
  it, and a miss is silent. `tests/mask-tool-registry.test.cjs` guards it.

## The PromptBox is live inside the family (MPI-372)

A mask and a prompt are **one operation**, so every mask tool keeps the PromptBox up.

- **Any path that HIDES the PromptBox must re-show it through the family predicate.**
  `_modeKeepsPromptBox(mode)` = `prompt` OR any mask tool. A bare `getActiveMode() === 'prompt'`
  re-show leaves the box hidden in a mask tool until the rail remounts options — the
  delete-entries and model-switch paths both had it. `mask-tool-registry.test.cjs` guards it.
  Not every `=== 'prompt'` is wrong: the compare paths gate a `swapToCanvas()` and are correct,
  because only `prompt` mode swaps to the lighter preview surface.
- **Mask tools never swap the viewer surface.** `swapToPreview()` frees GPU texture backing by
  destroying `MpiCanvas` for `MpiMaskedImagePreview` — that surface belongs to `prompt` mode,
  where no canvas tool is active. In a mask tool it destroys the canvas mid-mask.
- **Mask state is published as it CHANGES**, from the canvas' stroke-end signal:
  `_endMaskStroke()` → `onMaskStrokeEnd` → `_publishMaskState()` → `evaluateMask()` →
  `mask-ready`, emitting only on a flip. **A tool that makes a mask by any other route — a shape
  commit, a text detection — must emit `mask-ready` itself or call `viewer.el.evaluateMask()`, or
  the op strip never unlocks.**
- **The rail owns which tool is armed.** Both reload paths (`entry-selected`,
  `_reloadViewerWithEntry`) re-arm via `_syncViewerToolMode()`; never clear the mode before
  `loadEntry`, which captures and restores it itself.
- `workspace:set-operation` no longer forces prompt mode — its only emitter is the op strip,
  inside the box. Do not reintroduce the force.

## Roadmap

The taxonomy table above is the roadmap; MPI-424 sequences the cards behind it. Shapes (MPI-368)
mounts `MpiMaskStrip` with `brush: false` and no detect row. **MPI-379 is closed `rejected`**
(2026-08-01) — hover-to-select is not being built and the thumb strip stays; its SAM 1 refiner
swap has no owner. Reasons are on the card.
