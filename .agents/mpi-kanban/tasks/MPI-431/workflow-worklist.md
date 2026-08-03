# MPI-431 — workflow worklist (USER-OWNED, agents do not edit these files)

## ✅ COMPLETE 2026-08-03 — 18 destroying nodes → 0

User edited all 10 raw nodes by hand; agent ran `scripts/sync-raw-workflows.mjs`
(ComfyUI up on 8188), which committed the raw sources as **`ae49f385`** and staged 19
generated files (13 runtime + 6 API templates) for `/mpi-end`.

Verified by re-running the audit against the **runtime** graphs — not the templates —
so the sync is proven to have propagated:

```
total nodes: 20   destroying: 0
```

Every node the user mask reaches now leaves its shape alone. Two deviations from the
plan below, both the user's call:

- **`klein_t2i` #290 `GrowMaskWithBlur`** — listed as leave-alone, user set
  `fill_holes: false` anyway and confirmed it. `expand: 32` kept. This makes #286's
  `mask_fill_holes: false` real rather than cosmetic. **The "deliberate branch, do not
  touch" note in `brief.md` § C is superseded for the `fill_holes` half only.**
- **`mask_expand_pixels: 6`** — deliberately left at 6 on all six
  `InpaintCropImproved`. Still open; revisit if an Adjust shrink reads as swallowed.

The checkboxes below are the record of what was changed.

---


Generated 2026-08-03 by tracing every node **downstream of the `Input_Mask` node** in
each runtime graph, then mapping each hit back to its `raw/` LiteGraph source. So
nothing graph-internal is falsely listed, and nothing reached indirectly is missed.

**Agents: this is a report, not a task.** The user edits `raw/` by hand and then runs the
sync. See `brief.md` § Ownership split.

## Edit `raw/` only, then sync

`comfy_workflows/raw/*.json` is the authoring source (LiteGraph). The runtime
`comfy_workflows/*.json` and `scripts/workflow_generation/*_template.json` are
**generated** — do not hand-edit them, the sync overwrites.

**9 nodes across 6 raw files** covers all 18 runtime hits, because one raw node fans out:

| Raw template | Generates |
|---|---|
| `sdxl_detailer_template.json` | all **5** `detailer_*` |
| `chroma_t2i_template.json` | `chroma_t2i` + `chroma_hyper_t2i` |
| `krea2_t2i_template.json` | `krea2_t2i_sfw` + `_nsfw` |
| `boogu_edit_template.json` | `boogu_edit_balanced` + `_high` |
| `klein_t2i_template.json` | `klein_t2i` |
| `qwen_edit_template.json` | `qwen_edit` |

## A — `InpaintCropImproved`: `mask_fill_holes` → `false`

Widget index **8** (`mask_fill_holes`), index **9** (`mask_expand_pixels`, currently `6`
— your call). Index verified against the API twin: `klein #286` reads `false` at 8 and
its API twin reads `mask_fill_holes: false`.

- [ ] `raw/qwen_edit_template.json` → **#243**
- [ ] `raw/boogu_edit_template.json` → **#221**
- [ ] `raw/krea2_t2i_template.json` → **#589**
- [ ] `raw/klein_t2i_template.json` → **#276**
- [ ] `raw/klein_t2i_template.json` → **#581**

## B — `MaskDetailerPipe`: `contour_fill` — judge each, do not sweep

Widget index **20** (the LAST element). Verified: `klein #285` reads `false` there and
its API twin reads `contour_fill: false`.

All four are downstream of `Input_Mask`, so each needs a look; listing is not a verdict.

- [ ] `raw/sdxl_detailer_template.json` → **#1534** — title `MaskDetailer (SDXL)`. Widest blast radius: 5 runtime detailers.
- [ ] `raw/chroma_t2i_template.json` → **#2725** — title `MaskDetailer`
- [ ] `raw/krea2_t2i_template.json` → **#610** — title `MaskDetailer`
- [ ] `raw/klein_t2i_template.json` → **#415** — title `MaskDetailer`

## C — Explicitly NOT to change

| Target | Why |
|---|---|
| `raw/klein_t2i_template.json` **#290** `GrowMaskWithBlur` (`expand: 32` idx 0, `fill_holes: true` idx 7) | Deliberate branch the user wrote. **Consequence accepted:** it sits between the user mask and #286, so that branch keeps filling + growing regardless of A and B. #286's `mask_fill_holes: false` is cosmetic. |
| `raw/klein_t2i_template.json` **#286**, **#285** | Already `false`. |
| `raw/app_head_swap.json` **#21** | Has `mask_fill_holes: true` but the graph has **no `Input_Mask`** — mask is internal. Matches a class-name grep; must not be touched. |
| `raw/img_auto_mask.json` **#1654 / #1655** | The SAM3 detection despeckle (`ERODE -4` then `DILATE +4 + fill_holes`), self-documented in the node titles. Runs BEFORE the user sees the mask, and the result is visible in the preview and adjustable. Not this bug. |
| `InpaintStitchImproved` (all) | Takes the stitcher object from Crop, carries no mask params. Fixing Crop fixes Stitch. |
| `MpiMaskSquareBbox` #264 / #584 (klein) | Feeds `optional_context_mask` — the context region, not the inpaint mask. Intended. |

## Verify after the sync

From the repo root:

```
node .agents/mpi-kanban/tasks/MPI-431/audit-mask-destroyers.cjs
```

Reads the **runtime** graphs, so it proves the sync propagated. Baseline **18 destroying
/ 20 total**. After A alone: 13. After A + all of B: 3 (klein #290, #415→if kept, etc.
— whatever you chose to keep).

The script BFSes from the `Input_Mask`-titled node and reports any
`InpaintCropImproved` / `MaskDetailerPipe` / `GrowMaskWithBlur` it reaches, so a node
that stops being fed by the user mask drops off the list on its own.
