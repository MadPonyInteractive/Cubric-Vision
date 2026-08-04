# MPI-384 Checklist

Derived from `plan.md`.

- [x] Graph — text branch in `comfy_workflows/raw/img_auto_mask.json` + explicit-path convert
- [x] Executor — `Input_Text_Mode` / `Input_Text_Prompt.text` params in `runAutoMask`
- [x] Viewer — `_textMode`, `setMaskTextMode`, `setMaskTextPrompt`, empty-prompt gate
- [x] Organism — `MpiToolOptionsMaskText` (+ CSS, preloadStyles, types.js)
- [x] Registry — rail entry, `_MASK_TOOLS`, `TOOL_OPTIONS_REGISTRY`, `TOOL_LABELS`
- [x] Tests — registry brushless list; re-anchored + extended the inject-titles guard;
      new `tests/mask-text-prompt.test.cjs` over the `name:N` stamper
- [x] Doc — split out `docs/masking-sam3.md` (masking.md hit 232 lines; the ≤200 rule says
      split, not shred), routed in `docs/README.md`

Deviations from the plan, all cheaper than planned:

- **No `MpiText` relay for the prompt.** `CLIPTextEncode` is not in `PATH_MEDIA_CLASSES`, and
  the dotted `Input_Text_Prompt.text` key writes its `text` widget directly. One node fewer
  than the card assumed, and the media-staging trap is sidestepped rather than worked around.
- **Doc SPLIT instead of trimmed.** The card assumed a trim would fit; the addition was 94
  lines of graph contract. Both SAM3 tools now live in `docs/masking-sam3.md` (105 lines);
  `masking.md` is back to 146 with a pointer.
- **One extra fix, same code path:** `exec.onMasks` set `_hasMask = true` without emitting,
  so picking a chip never unlocked the op strip until Add/Subtract. Now calls
  `el.evaluateMask()` — required by this card's acceptance, and it fixes Detect too.
- **Doc drift corrected in passing:** the points branch was documented as `MpiString`
  (MPI-380 shipped `MpiText`), and the tool-family table still listed a Scope dial MPI-380
  deleted.
