# Undo on the canvas — `UndoStack` (MPI-376)

The command stack behind Ctrl+Z / Ctrl+Shift+Z. Split out of
[masking.md](masking.md) at the 200-line cap. Read before touching
`js/components/Primitives/MpiCanvas/managers/UndoStack.js`, the stroke lifecycle in
`InputController`, or anything that mutates a mask layer.

---

## What it stores, and why that is the whole trick

`MpiCanvas` owns **one** stack for the whole canvas — not one per tool — which is how MPI-375's
paint layer plugs into the same entries instead of growing a second stack. Nothing in `UndoStack`
knows what a mask is: an entry is a list of rectangular pixel patches over arbitrary 2D
contexts. The consequence is deliberate: **Ctrl+Z inside the Paint tool can walk back into a mask
stroke.** One canvas, one chronological history.

**Only `manualCanvas` + `subtractCanvas` are stored.** `maskCanvas` and `autoCanvas` are
derived, so an undo restores those two and calls `_recomposite()`. That is why **the
auto-picks-union-LAST order cannot be broken by an undo** — order lives in the compositor,
not in the snapshot. Restore the inputs, re-derive, done. This is the reason the card's
"is this a `MaskManager` restructure?" stop-rule never fired.

Scope is deliberately **pixels only**. `autoPickMasks` / `selectedAutoPicks` are the last
detect run (re-runnable) and points are individually removable by clicking a dot, so neither
is restored — undoing a bake brings the pixels back, not the thumbs.

The undoable units are the **complete mutation set** of the recorded layers, enumerated from the
code rather than guessed:

| Layer | Records an entry | Deliberately records NOTHING |
|---|---|---|
| `MaskManager` — `manualCanvas` + `subtractCanvas` | `paint()`, `clear()`, `bakeAutoPicksInto()`, `applyAdjust()`, `fillHoles()`, `commitShape()`, `fillFromPaint()` | `setManual/SubtractFromDataURL()`, `init()` — **loads** |
| `PaintManager` — `paintCanvas` (MPI-375) | `paint()`, `clear(true)`, `commitShape()`, `applyAdjust()`, `fillHoles()`, `fillFromMask()` | `setFromDataURL()`, `init()` (which calls `clear(false)`) — **loads** |
| `CompositeManager` — `holeCanvas` (MPI-373) | `paint()`, `clear(true)` | `setHoleFromDataURL()` (a pasted mask is a load), `init()`, `reset()` — **loads and discards**; see [composite.md](composite.md) |

`commitShape()` (MPI-368) is the same method on both managers because it is the same gizmo:
`ShapeManager` owns the geometry and hands over a path BUILDER, each manager scales it by its
own `_scale` and fills it. Neither the gizmo nor its drag records anything — moving a shape
around changes no pixel. Only the commit does.

`CompositeManager` (MPI-373) is on the same shared stack even though its layer is **scratch** —
a cut is an edit the user is making by hand, so Ctrl+Z has to reach it. Its `reset()` is the
preview contract's discard, not an edit, and records nothing for the same reason `clearShape()`
does not: dropping an uncommitted preview is not something the user could have undone.

`PaintManager.init()` must **not** clear the stack a second time: `MpiCanvas.loadImage()` already
cleared it through `mask.init()`, and clearing again would wipe the history the mask just
re-established. Both are loads, and a load is never an undoable edit. The paint layer's model,
persistence and Apply live in **[painting.md](painting.md)**.

---

## 🔴 The contract — read this before adding ANY layer mutation

If you write code that mutates `manualCanvas`, `subtractCanvas` or the RGBA `paintCanvas`,
**you must record an undo entry**. There are exactly three shapes:

| Your mutation | What to call |
|---|---|
| **Layer-wide, one shot** — a bake, a Clear, a grow/shrink release | `this._recordUndo()` **before** mutating, and **after** any early-return guard so a no-op cannot push an empty entry |
| **A gesture** — a stroke, a drag with a start and an end | `undo.begin(mgr.undoLayers())` at the start · accumulate the dirty box · `undo.commit(mgr.takeStrokeBox())` at the end · `undo.abort()` if it produced nothing |
| **A LOAD that replaces the layers** — `setManual/Subtract/PaintFromDataURL`, `init` | record **nothing**, and clear the stack. A load is not an edit the user could have undone |

`mgr` is whichever manager owns the destination — `MaskManager` or `PaintManager`; both expose
`undoLayers()` / `takeStrokeBox()` / `_recordUndo()` with the same meanings, which is what lets
the one stack serve both. The paint brush's gesture is closed by `InputController._endPaintStroke()`,
the mask brush's by `_endMaskStroke()`; they are separate only because a mask stroke publishes
mask state to the op strip and a paint stroke does not.

Then make sure the change reaches the UI: an undo must end up firing `onMaskStrokeEnd`
(`MpiCanvas._applyUndo()` already does) or the op strip never re-evaluates.

**Why this is not optional:** undo that covers some edits and not others is worse than no
undo at all — the user learns to trust it and then loses work at the first unwired path.
A new mutation that skips the stack is a silent hole, and nothing will fail loudly.

**MPI-375 (paint) and MPI-368 (shapes) have both landed** and did exactly this — one RGBA layer
on the same stack ([painting.md](painting.md)), and one gizmo whose commit is a layer-wide one
shot into either destination. Ctrl+Z inside Shapes therefore walks back through mask strokes,
paint strokes and shape commits in the order they happened, which is the one-canvas-one-history
consequence this stack was built around.

---

## Mechanism

- **Swap, not before+after.** One snapshot per entry; applying it writes that snapshot back
  and keeps what it displaced. The same entry drives undo and redo, at half the memory.
- **`clearRect` before `drawImage` in `_apply()` is load-bearing.** These layers are
  white-on-*transparent* and source-over cannot remove a pixel, so without the clear an undo
  leaves the stroke behind.
- **A stroke stores its dirty rect, not the layer.** `begin()` parks a full copy in a reused
  scratch buffer at mousedown, `MaskManager` accumulates the box across dabs, `commit(box)`
  keeps only that box. `abort()` drops a gesture that painted nothing. Layer-wide ops call
  `record()` and pay the full rect.
- **Bounded by a byte budget (96MB), not a count** — cheap strokes go deep, full-layer bakes
  do not. The last entry is never evicted, or a single big op would be silently un-undoable.
- **`bytes` is the RETAINED set (undo + redo)**, since an undone entry still holds its
  pixels. Discarding the redo branch must credit those bytes back; not doing so inflated the
  total on every undo-then-edit-again and evicted live history early (caught in the smoke,
  not by the unit test that now guards it).

### Measured, not estimated — `getUndoStats()`

On a 912×1140 mask layer, read live through `el.getUndoStats()`:

| Entry | Cost |
|---|---|
| brush stroke (dirty rect) | **59–73 KB** |
| layer-wide op (Clear, bake) | **7.93 MB** (`w × h × 4 × 2`) |

A stroke is under **1%** of a full snapshot — the entire justification for the dirty rect.
At the `MASK_MAX_EDGE` (1536) bound a full-layer entry is **18.9MB**, so the budget holds
about five of those, or thousands of strokes.

---

## Wiring and its traps

- **Cleared on any LOAD:** `mask.init()` (so every `loadImage`, i.e. every entry switch) and
  `_restoreLayers()`. The latter matters because the re-seed path `clearMask()`s *without*
  reloading the image — that clear would otherwise sit on the stack as an undo onto pixels
  that no longer exist.
- **Undo fires `onMaskStrokeEnd`**, so the op strip resyncs through the existing
  `_publishMaskState()` → `evaluateMask()` → `mask-ready` path. An undo *is* a mask change.
- **`control+z` is not blocked by `allowWhileTyping: false`.** That gate only stops single
  letters, bare modifiers and text-edit keys. Both registry entries therefore carry
  `when: ({ isTyping }) => !isTyping`, or the manager would `preventDefault` Ctrl+Z inside
  the PromptBox and eat the native text undo. The handlers are *also* gated on
  `mask.isMaskingMode` in `InputController`.
- **Survives a mask-tool swap** (the canvas is not destroyed), but dies on the swap to prompt
  mode, which tears `MpiCanvas` down — matching how the mask itself reloads from TEMP there.
- **`pendingLayer(i)`** exposes the pristine pointerdown capture of a gesture in flight. It has
  **no consumer** — MPI-382's grow/shrink was the intended one until the 2026-08-01 re-scope made
  Apply a layer-wide one shot instead of a drag bake, so Adjust holds its own pristine copy and
  records with `_recordUndo()`. Left in place for the next real gesture; see
  `docs/masking-adjust.md`.

`tests/undo-stack.test.cjs` covers the arithmetic (clamping, swap ordering, budget eviction,
redo invalidation, byte credit). The wiring above was verified live — see the MPI-376 card.
