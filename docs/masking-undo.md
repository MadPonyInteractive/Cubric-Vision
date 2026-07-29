# Undo on the canvas — `UndoStack` (MPI-376)

The command stack behind Ctrl+Z / Ctrl+Shift+Z. Split out of
[masking.md](masking.md) at the 200-line cap. Read before touching
`js/components/Primitives/MpiCanvas/managers/UndoStack.js`, the stroke lifecycle in
`InputController`, or anything that mutates a mask layer.

---

## What it stores, and why that is the whole trick

`MpiCanvas` owns **one** stack for the whole canvas — not one per tool — so MPI-375's paint
layer plugs into the same entries instead of growing a second stack. Nothing in `UndoStack`
knows what a mask is: an entry is a list of rectangular pixel patches over arbitrary 2D
contexts.

**Only `manualCanvas` + `subtractCanvas` are stored.** `maskCanvas` and `autoCanvas` are
derived, so an undo restores those two and calls `_recomposite()`. That is why **the
auto-picks-union-LAST order cannot be broken by an undo** — order lives in the compositor,
not in the snapshot. Restore the inputs, re-derive, done. This is the reason the card's
"is this a `MaskManager` restructure?" stop-rule never fired.

Scope is deliberately **pixels only**. `autoPickMasks` / `selectedAutoPicks` are the last
detect run (re-runnable) and points are individually removable by clicking a dot, so neither
is restored — undoing a bake brings the pixels back, not the thumbs.

The undoable units are the **complete mutation set** of those two layers, enumerated from
the code rather than guessed: `paint()`, `clear()`, `bakeAutoPicksInto()`, plus
`setManual/SubtractFromDataURL()` and `init()` — the last two are **loads**, deliberately
not recorded.

---

## 🔴 The contract — read this before adding ANY layer mutation

If you write code that mutates `manualCanvas` or `subtractCanvas` (or, later, a paint
layer), **you must record an undo entry**. There are exactly three shapes:

| Your mutation | What to call |
|---|---|
| **Layer-wide, one shot** — a bake, a Clear, a grow/shrink release | `this._recordUndo()` **before** mutating, and **after** any early-return guard so a no-op cannot push an empty entry |
| **A gesture** — a stroke, a drag with a start and an end | `undo.begin(mask.undoLayers())` at the start · accumulate the dirty box · `undo.commit(mask.takeStrokeBox())` at the end · `undo.abort()` if it produced nothing |
| **A LOAD that replaces the layers** — `setManual/SubtractFromDataURL`, `init` | record **nothing**, and clear the stack. A load is not an edit the user could have undone |

Then make sure the change reaches the UI: an undo must end up firing `onMaskStrokeEnd`
(`MpiCanvas._applyUndo()` already does) or the op strip never re-evaluates.

**Why this is not optional:** undo that covers some edits and not others is worse than no
undo at all — the user learns to trust it and then loses work at the first unwired path.
A new mutation that skips the stack is a silent hole, and nothing will fail loudly.

Cards that will hit this next: **MPI-382** (grow/shrink — layer-wide, and it also needs
`pendingLayer()` for its pristine drag-start copy), **MPI-368** (shapes — Add/Subtract bakes),
**MPI-375** (paint — plugs its RGBA layer into this same stack, does not build a second one).

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
- **`pendingLayer(i)`** exposes the pristine pointerdown capture for MPI-382's grow/shrink,
  which must derive every drag frame from drag-start state or the effect compounds.

`tests/undo-stack.test.cjs` covers the arithmetic (clamping, swap ordering, budget eviction,
redo invalidation, byte credit). The wiring above was verified live — see the MPI-376 card.
