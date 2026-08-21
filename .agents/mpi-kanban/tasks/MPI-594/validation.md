# MPI-594 — validation

Driven live 2026-08-21 in an isolated instance (`CUBRIC_MODELS_ROOT="G:/CubricModels"
npm run app:isolated`, port 53686, own profile), on a probe project that was deleted
afterwards. Source image: `comfy_workflows/display/flow-head-swap.webp`, 896 × 1120.

## Automated

| check | result |
|---|---|
| `npm test` | **657 pass, 0 fail** (includes the new `flow_outpaint.json` inject-title case and the outpaint any-of arms) |
| `npx eslint` on every touched JS | clean |
| `node --check` on every touched JS + `json.load` on `operation_registry.json` | clean |
| `node scripts/sync-raw-workflows.mjs` | `raw/flow_outpaint.json` → `comfy_workflows/flow_outpaint.json`, injection rules pass |

Runtime graph's injection surface (34 nodes): `Input_Image` (`MpiLoadImageFromPath`,
`block_if_empty: true`), `Input_Positive`, `Input_Negative`, `Input_Seed`,
`Input_is_Turbo`, `Input_Bypass_Filter_Lora`, `Output_Image`.

## Live — the model picker (added 2026-08-21, after titling node 55)

With BOTH weights on disk (`krea2_raw_int8_convrot` 13.5GB, `lustify-v10-krea-raw-int8_convrot`
13.1GB in `G:/CubricModels/diffusion_models`):

- `flowAvailability` → available, `missing: []`; `flowModelChoices` → `[['krea2','krea2-nsfw']]`.
- Library drawer renders the picker, options **"Krea 2" / "Krea 2 NSFW"**.
- `setFlowModel('outpaint', 'krea2')` → `Input_Base_Model: krea2_raw_int8_convrot.safetensors`,
  `Input_Bypass_Filter_Lora.strength_model: 1`.
- `setFlowModel('outpaint', 'krea2-nsfw')` →
  `Input_Base_Model: lustify-v10-krea-raw-int8_convrot.safetensors`, bypass strength `0`.
- Tile renders with NO preview art and degrades to a plain gradient — nothing broken while the
  graphics session is pending.

## Live — the flow

- Flow opens with **three steps**: `01 Inputs · 02 Frame · 03 Generate`.
- Run slide renders exactly two controls: **Turbo** (on by default, bolt icon) and
  **Generate**, with the result pane opposite.

## Live — the crop gizmo

| check | result |
|---|---|
| contain-seed, landscape 16:9 | `1991 × 1120` = exactly `1120 × 16/9`, image centred, bars both sides |
| contain-seed, portrait 1:1 | `1120 × 1120` on an 896-wide source — bars left and right, nothing cropped |
| orientation flip | ratio list transposed BY INDEX, selected shape kept |
| ratio-locked drag (right edge) | `1120²` → `1382²`; ratio held, anchored left, grown both ways in y — CropManager's own edge-handle geometry |
| **edge snapping** | pulled to `x = -165`, dragged back to ≈ `-17`, **landed exactly `x = 0`** |
| hit-testing | `ew-resize` cursor on the edge handle, `default` off it |
| fill | black drawn inside the rect, under the source — visible in the step, not just at run |

## Live — what the graph would receive

`composePaddedImage` on the reported rect `{x: -547, y: 0, w: 1991, h: 1120}`:

- PNG is **1991 × 1120** — the rect exactly.
- Left bar `0,0,0`, right bar `0,0,0`, centre = real source pixels.
- A **negative origin** needs no clamping: the source draws at `(-x, -y)`.
- Placed via `POST /project-media/:id/place-preview-asset` →
  `Media/.preview-assets/20b99261…abe6.png` (content-addressed, deduped).

## Two cosmetic defects found and fixed in the same pass

1. Ratio grid at `columns: 5` took two rows and **clipped the step's title and hint off the
   slide**. Now one row of ten (`columns: 10`), stage height `min(42vh, 460px)`, hint trimmed.
2. Handles on the union's edge were flush against the stage. `_refit` now insets by
   `HANDLE_SLACK` (14px).

## Live — TWO REAL GENERATIONS (2026-08-21, Fabio's go-ahead, engine idle first)

Source `mpi-546-smoke/Media/t2i_004.png` (768 × 1344), rect `{x: -160, y: 0, w: 1088, h: 1344}`
— a 160px strip added each side (+21% width). Project `mpi-594-outpaint-proof`.

**Run 1 — and it caught a real bug.** The dispatched graph (read from `/queue`) carried the
padded `.preview-assets` PNG on `Input_Image` ✓, `Input_is_Turbo: true` ✓,
`Input_Base_Model: krea2_raw_int8_convrot.safetensors` ✓ — and
`112 MpiText | Input_Positive | {"string": ""}` ✗. `_buildParams` emits
`Input_Positive: positive || ''` on EVERY run, so a flow with no prompt field injects an empty
string over the graph's baked instruction. It still filled (Krea 2's edit branch is forgiving),
which is exactly why this would have shipped unnoticed.

Fixed the Head Swap way: node 112 re-titled `Outpaint instruction (baked)` in the raw graph, so
injection cannot reach it. **NOT** by teaching the app to skip an empty prompt — a scan of
`comfy_workflows/*.json` shows ~20 graphs carrying a leftover authoring prompt
(`chroma_t2i`, `klein_t2i`, `wan5b_i2v`, `qwen_edit`…) that the empty string is what erases.
`inject-params-titles.test.cjs` now pins the ABSENCE of the title.

The sync script refused (a peer session's `flow_character_sheet.json` was dirty), so the
runtime graph got the one-line title change directly — verified first by converting the raw
file independently (`COMFY_URL=…:48188 node scripts/workflow-to-api.mjs`) and diffing: **34
nodes, one difference, that title.** `validate-injection-rules.mjs` passes.

**Run 2 — with the instruction intact.** Dispatched graph:
`112 MpiText | Outpaint instruction (baked) | {"string": "fill the back areas with the rest of
the image"}` ✓. Same padded input hash `884259df…` as run 1 — the content-addressed store
deduped rather than writing a second copy.

| | run 1 (no instruction) | run 2 (instruction) |
|---|---|---|
| output | `flowOutpaint_001.png`, 928 × 1136 | `flowOutpaint_002.png`, 928 × 1136 |
| the added strips | filled, seamless | filled, seamless — street and building line continue better on the left |

Output is 928 × 1136 rather than 1088 × 1344 because the graph's `ImageScaleToTotalPixels`
normalises to ~1 MP. Expected, not a crop — and DELIBERATE: Fabio put it there so a 4K input
returns a result instead of an OOM.

Both runs landed real gallery cards. Run 2's completion arrived LATE (the page had been
reloaded mid-session, `[concat] SSE stream errored (will auto-reconnect)`) and the backstop
recovered it — app-level, nothing to do with this flow.

## NOT verified — outstanding

- **Reuse across restart** — the code path is the shared one (`flowInputs` keeps the
  original image + rect, `runMediaItems` is stripped in `flowService`), but no restart test
  has been run.
- **The NSFW arm has never RUN through this flow** — only its resolution is proven (right
  filename, bypass 0). Fabio: the lustify weight has been run against this same edit shape and
  prompt style before, so this is not a gap worth a GPU pass.
- **A big extension** — both runs added 21%. The copy's claim that a large one degrades is
  Fabio's, not measured here.
- **Preview art** — no `preview`/`video` on the FlowDef until `/mpi-flow-graphics` runs.
