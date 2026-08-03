# MPI-431 - the graph refills the user's mask

Raised by the user 2026-08-03, minutes after MPI-382's Adjust tool shipped.

> "all the workflows close the provided masks. If the user just wants to mask an edge
> around the subject, for example, to fix edge errors, he can't."

## What is actually in the graphs

> **AUDIT SUPERSEDED 2026-08-03.** The original audit below named only
> `InpaintCropImproved` and missed **two thirds of the problem**. The user challenged
> it ("the ones with detailing... or maybe just the workflows that have a mask input")
> and was right. Re-run by tracing every node DOWNSTREAM of the `Input_Mask` node in
> each runtime graph — not by grepping a class name, so nothing graph-internal is
> falsely included and nothing reached indirectly is missed.

### THREE mechanisms, 18 nodes, 15 runtime graphs

| Runtime workflow | Node | Class | Destroying params |
|---|---|---|---|
| `qwen_edit.json` | 243 | InpaintCropImproved | `mask_fill_holes: true`, `mask_expand_pixels: 6` |
| `boogu_edit_balanced.json` / `_high` | 221 | InpaintCropImproved | same |
| `krea2_t2i_sfw.json` / `_nsfw` | 589 | InpaintCropImproved | same |
| `klein_t2i.json` | 276, 581 | InpaintCropImproved | same |
| **`klein_t2i.json`** | **290** | **GrowMaskWithBlur** | **`fill_holes: true`, `expand: 32`** |
| `klein_t2i.json` | 415 | MaskDetailerPipe | `contour_fill: true` |
| `krea2_t2i_sfw.json` / `_nsfw` | 610 | MaskDetailerPipe | `contour_fill: true` |
| `chroma_t2i.json` / `chroma_hyper_t2i.json` | 2725 | MaskDetailerPipe | `contour_fill: true` |
| `detailer_sdxl_realistic.json` | 1534 | MaskDetailerPipe | `contour_fill: true` |
| `detailer_sdxl_nsfw.json` | 1534 | MaskDetailerPipe | `contour_fill: true` |
| `detailer_ill_anime.json` | 1534 | MaskDetailerPipe | `contour_fill: true` |
| `detailer_ill_anime_beauty.json` | 1534 | MaskDetailerPipe | `contour_fill: true` |
| `detailer_pony_mix.json` | 1534 | MaskDetailerPipe | `contour_fill: true` |

**1. `InpaintCropImproved.mask_fill_holes` + `mask_expand_pixels: 6`** — 6 nodes. The
original finding.

**2. `MaskDetailerPipe.contour_fill: true`** — **10 nodes, the largest group and wholly
missed.** This is the detailer's own fill-holes: it fills the mask out to its contour,
so a ring becomes a disc by a completely different code path. Present in all five
`detailer_*` graphs AND in the detail pass inside klein / krea2 / chroma. Any fix that
only touches `InpaintCropImproved` leaves this untouched and the bug still reproduces
on every detailer.

**3. `GrowMaskWithBlur` #290 in `klein_t2i`** — `expand: 32` on top of `fill_holes: true`.
Five times the 6px grow the card was raised over.

### Already clean — leave alone

- `klein_t2i` **#286** (`mask_fill_holes: false`) and **#285** (`contour_fill: false`).
  The user wrote those branches; their masks are built inside the workflow.
- `app_head_swap.json` has **no `Input_Mask` at all** — its mask is graph-internal.
  It matches an `InpaintCropImproved` grep and must NOT be changed. Same category as #286.
- `InpaintStitchImproved` is **innocent** — it takes the stitcher object from Crop and
  carries no mask params. Fixing Crop fixes Stitch. Do not open it.

### `raw/` is the only thing edited — then sync

**The user edits `comfy_workflows/raw/*.json` and runs the sync.** Runtime
`comfy_workflows/*.json` and `scripts/workflow_generation/*_template.json` are
GENERATED; hand-editing them is thrown away on the next sync.

`raw/` is **LiteGraph** — params live in positional `widgets_values` arrays, so a
named-key search (`"contour_fill"`) returns **zero hits there** while finding the API
twin. Indices resolved and cross-checked against the API twins:

| Class | Param | Widget index |
|---|---|---|
| `InpaintCropImproved` | `mask_fill_holes` | **8** |
| `InpaintCropImproved` | `mask_expand_pixels` | **9** |
| `MaskDetailerPipe` | `contour_fill` | **20** (last) |
| `GrowMaskWithBlur` | `expand` / `fill_holes` | **0** / **7** |

Verified by negative example: `klein #286` reads `false` at index 8 and its API twin
reads `mask_fill_holes: false`; `klein #285` reads `false` at index 20 and its API twin
reads `contour_fill: false`.

**9 raw nodes across 6 files cover all 18 runtime hits** — one raw node fans out
(`sdxl_detailer_template` → 5 detailers; `chroma`/`krea2`/`boogu` → 2 each). Full list
with checkboxes: `workflow-worklist.md`.

### Original audit (kept as the record — incomplete)

`InpaintCropImproved` is the masked-edit branch of every master template, and every
instance of it carries `mask_fill_holes: true` and `mask_expand_pixels: 6`:

| Template | Node |
|---|---|
| `comfy_workflows/qwen_edit.json` | 243 |
| `comfy_workflows/klein_t2i.json` | 276, 581 (**286 already has `fill_holes: false`**) |
| `comfy_workflows/boogu_edit_balanced.json` / `_high` | 221 |
| `comfy_workflows/krea2_t2i_sfw.json` / `_nsfw` | 589 |

So an Adjust edge band - a ring - is filled back into a disc before it reaches the
sampler, and any mask is silently grown 6px on top of whatever the user dialled in.

## OWNERSHIP SPLIT — DECIDED 2026-08-03 (supersedes the "both halves" split below)

**AGENTS DO NOT EDIT WORKFLOW JSON ON THIS CARD.** The user, verbatim: *"You're not
gonna edit any workflows. That's why I ask you for a list. I'll check and update."*
The audit above is the deliverable to him; the graph edits are his, by hand, because
some `contour_fill` nodes genuinely need the fill and are **independent of the input
mask** — a distinction a blanket sweep cannot make and he can.

| Half | Owner | Status |
|---|---|---|
| Every `comfy_workflows/` change (runtime, `raw/`, `scripts/workflow_generation/`) | **User, manually** | ✅ **DONE 2026-08-03** — 18 destroying nodes → **0**, verified against the runtime graphs. Raw committed `ae49f385`; 19 generated files staged for `/mpi-end`. Detail: `workflow-worklist.md`. |
| The in-app Fill button in the Adjust panel | Agent — this card's implementation | Not started |

**Superseded by the outcome:** `klein_t2i` #290 `GrowMaskWithBlur` was listed
leave-alone; the user set `fill_holes: false` on it and confirmed. `expand: 32` kept, so
that branch still grows the mask 32px but no longer fills it — and #286's
`mask_fill_holes: false` is now real rather than cosmetic. `mask_expand_pixels: 6` left
at 6 everywhere, still open.

So this card's CODE scope is **the app half only**. The workflow half is tracked as the
user-owned worklist below and is not a blocker on the app work.

### Decisions taken against the corrected audit

- **`MaskDetailerPipe.contour_fill`** — user handles manually, node by node. Some nodes
  need contour fill and do not sit on the user-mask path. No blanket change.
- **`klein_t2i` #290 `GrowMaskWithBlur`** — **LEAVE IT.** Deliberate branch the user
  wrote. Consequence, accepted and recorded: because #290 (`fill_holes: true`,
  `expand: 32`) sits between the user mask and #286, that klein branch keeps filling and
  growing the user's mask no matter what else changes. #286's `mask_fill_holes: false`
  is cosmetic there. Do not "fix" this later thinking it was an oversight.
- **`mask_expand_pixels: 6`** — user's call during his manual pass. Not settled here.

## The original "both halves" decision (still the direction, but see the ownership split above)

**Both halves.** Fill the holes **in the app**, and turn `mask_fill_holes` **off** in the
workflows. The app is where the user can see what he is filling; the graph must stop making
that choice for him.

**`klein_t2i` node 286 stays as it is.** The user wrote that branch and its mask is built
INSIDE the workflow, where the fill is intended. Only the nodes fed by the **user** mask
change - which is why the audit names nodes instead of saying "every `InpaintCropImproved`".

**Still open: `mask_expand_pixels: 6`.** The user's words: *"I think that's a necessary
feature, but now that we have this system, it's probably a good idea to remove it."* A lean,
not a decision - settle it in planning. The 6px grow exists because a tight mask stitches
badly; the counter-argument is that Adjust now lets the user add exactly the margin he wants
and SEE it. Whatever is chosen, **an Adjust shrink must not be silently undone by the graph.**

## Constraints inherited

- Template/runtime dual-file discipline: `raw/`, `scripts/workflow_generation/` and the
  runtime JSON move together, through a DECLARED injectable control. Read
  `docs/workflow-authoring/README.md` first.
- Part of the **MPI-424** umbrella. MPI-382 made the mask shape that exposed this;
  MPI-368 (shapes) will make more of them.
