# MPI-384 Plan — Text masking (SAM3 open vocabulary)

Compact plan. One coherent flow: graph branch → executor params → viewer state →
organism → registry → tests → doc.

Read `brief.md` first — it holds the six measured traps this plan assumes.

---

## Current State

- `comfy_workflows/raw/img_auto_mask.json` carries three detector branches behind
  two lazy `MpiIfElse` gates: `Input_Box` (YOLO box vs YOLO segment) and
  `Input_Points_Mode` (SAM3 points vs YOLO). Everything rejoins one picker chain
  (`ImpactSEGSPicker` → `ImpactSEGSToMaskList` → `MaskToImage` → `Output_image`).
- Node `1658 CheckpointLoaderSimple "SAM3 Model"` is already in the graph and its
  **CLIP output is unwired** — the whole reason this card is cheap.
- The rail mask family is `maskBrush` / `maskPoints` / `maskDetect`.

Verified while planning (source read, not assumed):

- `SAM3_Detect.execute` with `individual_masks=True` returns `[N_obj, H, W]`.
- Impact `mask_to_segs` **loops `mask.shape[0]`**, so a `[N_obj,H,W]` batch into
  `MaskToSEGS(combined=True)` yields **one SEG per object** — exactly the chips
  contract. (`make_2d_mask`'s `squeeze(0)` is a no-op when `N_obj > 1`.)
- `_parse_prompts` confirms the `name:N` trap: without `:N`, `len(parsed) <= 1 and
  parsed[0][1] == 1` falls through to the single-detection path.
- `CLIPTextEncode` is **not** in `comfyController`'s `PATH_MEDIA_CLASSES`, and the
  dotted injection form (`Title.widget`, MPI-359) writes one named widget. So the
  prompt injects straight into the encoder — no `MpiText` relay node needed, and
  trap 4 is sidestepped rather than worked around.
- ComfyUI is live on `127.0.0.1:8188`, so the raw→API converter can run.

---

## Remaining Work

### 1. Graph — `comfy_workflows/raw/img_auto_mask.json`

Add four nodes and one gate:

```
CheckpointLoaderSimple#1658 .CLIP
  -> CLIPTextEncode "Input_Text_Prompt"
  -> SAM3_Detect "SAM3 Text" (image from Reroute#1597, individual_masks TRUE,
                              refine_iterations 2, threshold 0.5)
  -> MaskToSEGS (combined=True)  # one SEG per object
  -> MpiIfElse "Input_Text_Mode" (true = text SEGS, false = MpiIfElse#1657 output)
  -> ImpactSEGSPicker#1593 + SEGSPreview#1571
```

- A **second** `SAM3_Detect` node, not a reuse of `#1661`: conditioning on the
  points node would make every points run `has_text` (trap 2).
- No bboxes wired into the text node (trap 2).
- No erode/dilate pair on this branch — the detector's masks are already clean.
  `ponytail:` add the `-4/+4` cleanup only if specks show up in practice.
- `threshold` stays the node default (0.5) and is **not** exposed. Not asked for;
  add a dial only if detection quality demands one.
- Convert with the EXPLICIT path (trap 6):
  `node scripts/workflow-to-api.mjs comfy_workflows/raw/img_auto_mask.json`

**Verify:** `git status` shows exactly the two `img_auto_mask.json` files changed
(no stray templates); the API JSON has two `SAM3_Detect` nodes, the text one with
`individual_masks: true` and a `conditioning` link.

### 2. Executor — `js/services/commandExecutor.js`

In `runAutoMask`'s params object:

```js
Input_Text_Mode:        textMode,
'Input_Text_Prompt.text': textMode ? payload.textPrompt : '',
```

`payload.textPrompt` arrives already stamped as `name:N` — the executor does not
build it (the count lives in the UI).

**Verify:** `tests/auto-mask-inject-titles.test.cjs` passes.

### 3. Viewer — `MpiCanvasViewer.js`

- `let _textMode = false;` beside `_pointsMode` (same reason: survives the
  swapToPreview/swapToCanvas remount).
- `el.setMaskTextMode(enabled)` — mirrors `setMaskPointsMode`: clears thumbs,
  picks and the stored auto entry, since the old result belongs to the old method.
- `el.setMaskTextPrompt(str)` — the already-stamped `name:N` string.
- Empty-prompt gate inside `_runAutoMaskWorkflow` (trap 5), the same shape as the
  points zero-dot gate: toast + return.
- Text mode uses the NORMAL detect flow (`populateThumbs`, no auto-pick-0) —
  N objects means there is something to choose between.
- Check whether `exec.onMasks` already unlocks the op strip; if it does not,
  `el.evaluateMask?.()` there (shared with the Detect tool, one line).

### 4. Organism — `MpiToolOptionsMaskText`

New `js/components/Organisms/MpiToolOptionsMaskText/` (`.js` + `.css`), modelled
on `MpiToolOptionsMaskPoints`:

- `MpiInput` text — the object name; `MpiInput` number — how many to find
  (default 1, min 1, max 20).
- Stamps `name:N` per comma-separated category on change, pushes to the viewer.
- Persists under the SINGLE `mask` tool key (`textPrompt`, `textCount`) like the
  Detect tool's `model` / `useBox`.
- Mounts `MpiMaskDetectRow` + `MpiMaskStrip { brush: false }`.
- `setup`: `enterMode('mask')`, `setMaskPointsMode(false)`, `setMaskTextMode(true)`.
- `destroy`: `setMaskTextMode(false)`, `evaluateMask()`, `exitMode()`, children.
- Register the CSS in `js/shell/preloadStyles.js`; document props in
  `js/components/types.js`.

### 5. Registry — three places, two files

- `MpiHistoryTools.js`: `{ mode: 'maskText', icon: 'text', info: 'Text' }` in the
  Mask group.
- `MpiGroupHistoryBlock.js`: `TOOL_OPTIONS_REGISTRY.maskText`, `_MASK_TOOLS`,
  and the `TOOL_LABELS` entry.

### 6. Tests

- `tests/mask-tool-registry.test.cjs`: add the new organism to the `brushless`
  list. The rail-driven assertions pick `maskText` up automatically.
- `tests/auto-mask-inject-titles.test.cjs`: the SAM3 lookup uses
  `find(n => n.class_type === 'SAM3_Detect')` — with two such nodes that is a
  coin flip. Re-anchor it on the `SAM3 Points` title, then add a text-branch
  assertion: the text `SAM3_Detect` has a `conditioning` link from the
  `Input_Text_Prompt` encoder, `individual_masks === true`, and no `bboxes`.

### 7. Doc — `docs/masking.md`

At EXACTLY its 200-line cap: trim before adding (the Roadmap block loses the
MPI-361-Phase-B line, which this card supersedes). Add a short Text section
covering the `name:N` contract, `individual_masks`, the three-way branch, and
why text and box cannot share a node.

---

## Verification

**Verify mode:** user-ux

Automated (must pass before handing over):

- `node --test tests/auto-mask-inject-titles.test.cjs tests/mask-tool-registry.test.cjs`
- Full suite: compare against the KNOWN 9 pre-existing failures — check the
  failure LIST, not the count.
- `git status` proves the converter did not spray stray templates.

In the app (the user's eyes):

1. Mask group → the new **Text** icon. Type `bikini`, count `2`, press Detect.
2. Two chips come back; clicking one shows that mask green; Add bakes it.
3. Empty prompt + Detect → toast, no run.
4. Swap Text → Points → Text: the mask is not cleared, right-click still works
   on the image, and the typed text/count come back.

---

## Completed

(nothing yet)
