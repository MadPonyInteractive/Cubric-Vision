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

## NOT verified — outstanding

- **A real generation.** Everything up to dispatch is proven; the end-to-end run is the
  user's to fire on their GPU (playbook `05-verify.md`). Nothing has yet confirmed the
  padded path reaching `Input_Image` inside ComfyUI, the turbo boolean, or output capture.
- **Reuse across restart** — the code path is the shared one (`flowInputs` keeps the
  original image + rect, `runMediaItems` is stripped in `flowService`), but no restart test
  has been run.
- **Preview art** — no `preview`/`video` on the FlowDef until `/mpi-flow-graphics` runs.
