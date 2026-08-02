# Adjust — grow/shrink and edge band over an existing mask

Step 2 of the MPI-424 canvas-tool umbrella, next after MPI-425 shipped the group
frame. Architecture: `tasks/MPI-424/brief.md`. Mount shape and paid-for traps:
`tasks/MPI-425/plan.md` § Completed.

## Current State

Project mode: scalable-foundation.

**The layer model.** `_recomposite()` (`MaskManager.js:295`) builds the display as
`(manual AND NOT subtract) ∪ ⋃selectedAutoPicks`, and **the picks union LAST** — the
MPI-371 order rule. Only `manualCanvas` + `subtractCanvas` are real; `maskCanvas` and
`autoCanvas` are derived. Working size is capped at `MASK_MAX_EDGE` 1536.

> **STATUS 2026-08-02: step 1 is SHIPPED and user-verified — the defect described below is
> FIXED.** It is kept as written because it is the reasoning that shaped the design and the
> reason step 2 is simple. See `## Completed` and `## Plan Drift` for what actually landed.

**The pick-lifecycle defect this card fixes first.** An unapplied detection is supposed
to be a preview, but nothing discards it. `_exitAutoMaskMode(apply)`
(`MpiCanvasViewer.js:713`) does exactly the right thing on `false` — drops the auto layer,
preserves manual + subtract, clears the pick entry, then emits `mask-ready` / `mask-clear`
so the op strip re-evaluates — and **it has no caller**. `commitAutoMask` (line 1352) has
none either. `mountOptions()` (`MpiGroupHistoryBlock.js:395`) destroys the outgoing options
compound on every rail switch and never touches the picks. So today a detection survives a
tool switch, stays in `maskCanvas`, and is injected into the graph without Add ever being
pressed. That is MPI-365's "detected-but-not-applied mask is still injected — product
decision pending", and the user settled it on 2026-08-02: **green means preview, and a
preview dies when you leave the tool.**

Fixing it first is not scope creep, it is what makes Adjust designable. With picks gone by
the time Adjust is active, Adjust only ever sees `manual − subtract`, and the union-last
order rule cannot interact with a shrink at all.

**THE PREVIEW CONTRACT — family-wide, stated by the user 2026-08-02.** Every canvas tool is
*visited, previewed, then applied — or the preview goes away.* An unapplied preview must
never outlive its tool. The reason is not tidiness: previews that survive stack on top of
each other, and the user is then judging a composite of three things he never committed to
while the graph receives something else again. Detect is merely the one that exists today;
Adjust is the second; MPI-368 Shapes and MPI-373 Composite will each add another. This
belongs in `tasks/MPI-424/brief.md` § Standing constraints so the remaining cards inherit it
instead of re-deciding it.

**Consequence, accepted by the user:** Add becomes mandatory. Detect, switch to Prompt
without pressing Add, and the mask is gone — generation runs unmasked and the op strip
relocks.

**Card text that is stale and gets healed, not obeyed.** `acceptance[0]` says the control
lives "in MpiMaskStrip" and `acceptance[4]` says the result is "baked ONCE, on release".
Both predate the 2026-08-01 MPI-424 re-scope on the same card, which made Adjust its own
button with live preview and explicit Apply/Reset. The re-scope wins. Same for the card's
"use `UndoStack.pendingLayer()` for the drag-start snapshot" note: `pendingLayer()` is a
`begin()`/`commit()` gesture facility, and Apply is not a gesture — Adjust holds its own
pristine copy and Apply is a layer-wide one-shot.

## Implementation

- [ ] **Enforce the preview contract on tool switch.** Expose
      `el.discardAutoMask = () => _exitAutoMaskMode(false)` beside the existing
      `commitAutoMask`, and call it from `mountOptions()` before the outgoing compound is
      destroyed. Unconditional on every mode change — picks only exist while a detect-family
      tool is active, so no mode bookkeeping is needed and none may be added. Make this the
      **seam** the later cards hang their own discard on, not a Detect special case: one
      "drop any unapplied preview" call in `mountOptions()`, which Adjust joins in step 2 and
      MPI-368 / MPI-373 join when they land. Record the contract in
      `tasks/MPI-424/brief.md` § Standing constraints and in `docs/masking.md`.
      **Verify:** detect on any tool → switch rail tool → green gone, manual strokes intact,
      op strip relocks when nothing else remains; press Add first → the bake survives the
      switch. New test in `tests/` asserting the switch path calls the discard and that
      `manual` + `subtract` are untouched by it.

- [ ] **Build the Adjust tool.** New `MpiToolOptionsMaskAdjust` organism in the Mask group:
      one bidirectional Grow / Shrink slider, an Edge button that swaps that one row for
      Outward + Inward, plus Apply and Reset. Mounts `MpiMaskStrip` with `brush: false`
      (pans on drag). Register in `TOOL_OPTIONS_REGISTRY`, `_MASK_TOOLS`, the tool-label map
      (`MpiGroupHistoryBlock.js:506`), the Mask group in `MpiHistoryTools.js:91`,
      `js/shell/preloadStyles.js` and `js/components/types.js`; add an icon to
      `js/utils/icons.js` if none fits.
      **One primitive, three readings** — grow is dilate, shrink is erode, an edge band is
      `dilate(outward) − erode(inward)`. Write it once.
      **Live preview, no bake on release.** Render into a new `adjustCanvas` on `MaskManager`
      and tint it with the existing `_recolorMaskLayer(..., MASK_AUTO_FILL)` seam
      (`MpiCanvas.js:823`), suppressing the normal mask fill while a preview is up so the
      user does not see both. Every frame recomputes from a pristine copy taken when the
      tool is entered — never from the previous frame, or grow-3 applied three times eats
      detail exactly like MPI-351.
      **Apply** calls `mask._recordUndo()` (layer-wide one-shot, after any no-op guard),
      writes the adjusted result into `manualCanvas`, clears `subtractCanvas`, resets the
      sliders to zero and re-evaluates. **Reset** and leaving the tool both discard.
      **Verify:** see `## Verification`.

**Mechanism — try the cheap one first, measure, then commit to it in the docs.**
Leading candidate is the card's: `ctx.filter = 'blur(Npx)'` then a hard alpha threshold via
an inline SVG filter (`feComponentTransfer` / `feFuncA type="linear"` with a large slope and
`intercept = -slope × t`; `contrast()` will not do it because it acts on colour and these
layers are white-on-transparent). One pass at 1536. The risk is that the dilation radius is
a joint function of blur sigma and threshold, so it needs calibrating against a known
circle before the slider maps to real pixels.
Fallback if that mapping is not stable: circular-offset stamping — draw the layer at N
offsets around a radius-r circle for an exact dilate, and erode by inverting, dilating and
inverting back. More draw calls, no calibration, exact. `sharp` server-side is NOT an
option: a round trip per drag frame is not live.

## Completed

**Step 1 — the preview contract. Shipped and user-verified in the app 2026-08-02.**

- `el.discardPreview()` on `MpiCanvasViewer` is the ONE seam; `mountOptions()` calls it on every
  rail switch, before the outgoing compound is destroyed. Guarded, so a switch between two
  preview-less tools does nothing and does not re-emit mask state.
- `_exitAutoMaskMode(false)` was clearing only THREE QUARTERS of the preview — the canvas auto
  layers and the persisted entry, but not `_autoMaskPicks`, `_lastDetectThumbUrls` or the thumb
  strip. Wiring it as-was would have left the strip advertising selected thumbs for pixels that
  no longer existed, and re-entering Detect would have rehydrated that stale selection. All four
  now drop together.
- `tests/preview-contract.test.cjs` — 5 tests. Three negative-controlled against the real source
  (removed the `mountOptions` call, removed the thumb-strip clear, made the discard branch touch
  `manualCanvas`); each failed as intended, then restored.
- Suite 310 pass / 0 fail (was 305). `npm run lint` and `lint:components`: 0 errors, warnings all
  pre-existing and none in the touched files.
- User check in the app: no flicker, brush strokes survive a switch, undo still correct.

## Remaining Work

- **Step 2 — the Adjust tool.** Not started. The `## Implementation` item above stands as written;
  step 1 removed its layer-order problem, so Adjust now only ever sees `manual − subtract`.

## Plan Drift

- **2026-08-02 — the discard was three-quarters written, not fully written.** The plan said wire
  up the existing `_exitAutoMaskMode(false)`. It turned out that function cleared the canvas auto
  layers and the persisted entry but NOT `_autoMaskPicks`, `_lastDetectThumbUrls` or the thumb
  strip — which is why nobody noticed it had no caller. Wiring it verbatim would have shipped a
  strip advertising picks for pixels that no longer existed. The discard branch was completed
  rather than merely called.
- **2026-08-02 — `docs/masking.md` was SPLIT, not trimmed.** The plan said record the contract
  there, respecting the 200-line cap. The file was already at **211 lines** before this session
  touched it, and the remaining prose is load-bearing — trimming 20 lines would have deleted
  facts. The tool-family half moved to `docs/masking-tools.md` (128 + 124 lines), the third such
  split after `masking-sam3.md` and `masking-undo.md`, with routing updated in `docs/README.md`
  and the CLAUDE.md context router. MPI-368 / 375 / 373 all add to that half, so it now has
  headroom instead of needing a trim per card.

## Verification

**Verify mode:** user-ux

A slider whose whole point is that the user sits on the preview and judges it cannot be
signed off by a test. Before asking for that pass: full `node --test "tests/*.test.cjs"`
green (the directory form dies on Node v24), `npm run lint` and `npm run lint:components`
clean, and `mask-tool-registry.test.cjs` negative-controlled — it fails if `maskAdjust` is
missing from `_MASK_TOOLS` or `TOOL_OPTIONS_REGISTRY`.

Then in the running app:

1. **Live at 1536.** If the drag is not live at the working size, say so with a measured
   number and fall back rather than shipping a laggy drag.
2. **No compounding.** Drag to 3, back to 0, out to 3 again — identical to going straight
   to 3.
3. **Zero is identity.** Returning to centre restores the original mask bit-for-bit.
4. **Any method.** Works on a mask built by brush, points, text or auto — it operates on
   layers, not on a source.
5. **Shrink to empty** relocks the op strip via `evaluateMask()` and throws nothing.
6. **Undo.** One Ctrl+Z after Apply restores the pre-adjust mask, and the MPI-371 order
   rule still holds afterwards.
7. **Discard rule.** The step-1 behaviour above, felt in the app.

## Preservation Notes

- `docs/masking.md` is capped at 200 lines — trim before recording the chosen mechanism and
  the compounding rule (acceptance 9).
- Record the discard rule in `docs/masking.md` too, and close MPI-365's "detected-but-not-
  applied mask is still injected" open item on that card when it ships.
- Heal `acceptance[0]` and `acceptance[4]` on this card to the 2026-08-01 re-scope.
- `docs/masking-undo.md` names MPI-382 as a coming consumer of `pendingLayer()`; the
  re-scope retired that. Correct the line when the mechanism is final.
- MPI-368 / 375 / 373 mount into the same groups — do not re-decide the PromptBox rule,
  it is written down in `tasks/MPI-425/plan.md`.
