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
| `Mask` | binary mask layers | brush · detect · adjust (382) · shapes (368) | brush, gizmo | keeps it |
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
