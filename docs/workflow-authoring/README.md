# Workflow authoring & injection — the cross-cutting contract

> **What this is.** The model/app-**agnostic** contract for building a ComfyUI
> workflow that Cubric Vision can drive: how the app injects values into a graph,
> the MpiNodes pack you build the graph from, and the generator patterns that turn
> one authored template into the runtime files the app fetches.
>
> This is **shared ground**. Both onboarding a **model**
> ([../playbooks/add-model/](../playbooks/add-model/README.md)) and building an
> **Flow** ([../flows.md](../flows.md)) sit on top of it. Read the file for the thing
> you're doing; you don't need all of it.

---

## 📌 AGENTS: keep this folder GROWING — do not monolith it

This folder is meant to accumulate. Every time you learn a new injection quirk, a
new control, a new generator pattern, or a new MpiNode worth knowing → **write it
into the matching file below**, or add a new small file. Rules:

- **One subject per file.** Do NOT dump everything into this README or into one
  giant page. If a topic doesn't fit an existing file, make a new short one and add
  a row to the index below.
- **Model/Flow-agnostic only.** Model-specific tuning goes to `docs/models/<model>/`;
  Flow-specific wiring goes to `docs/flows.md`. This folder is the machinery both reuse.
- **≤200 lines per file** (the repo-wide doc rule). Split before it bloats.
- The `/mpi-end` close-out reminds you to file what you learned — this banner is the
  standing home for *where* it goes.

---

## Index

| File | Covers |
|---|---|
| [mpi-nodes.md](mpi-nodes.md) | **MpiNodes is our own node pack** (`C:\AI\Mpi\ComfyUi-MpiNodes`, ~60 nodes). What's in it, and that we can add a new node any time we need one. |
| [injection.md](injection.md) | How the app writes values into a graph: the `Input_*`/`Output_*` title law, the injector target-input list, and the traps (silent title-miss, LoRA objects, media params). |
| [generator-patterns.md](generator-patterns.md) | Template → runtime files: the orchestrate/registry/handler system, and the **selector→N-files** pattern (boolean split, `input_tier` 1/2/3 → three files). |
| [media-inputs.md](media-inputs.md) | **Media-input path→string contract (MPI-272)** — image/mask/video/audio are path-reading loaders (`MpiLoadImageFromPath`/`MpiLoadAudio`/`MpiLoadVideo`) that self-gate on empty `string`; no placeholder. Only `LoadLatent` still stages a default. Path source law + reuse-404 soft-error. |
| [style-rack.md](style-rack.md) | **Style LoRAs — `MpiStyleSelector` + chained `MpiStyleLoras`** (MPI-359). One index + one strength drive the LoRA AND its trigger line, injected per-widget via the dotted `Input_Style_Selector.selector` / `.strength_model` keys. |
| [variant-injection.md](variant-injection.md) | **Diffusion-model / UNETLoader variant axis** — ship one graph, load a different transformer weight per GPU arch or quality (`variants.arch`, weight-only swap vs `workflowSuffix`). |

## The one-paragraph model

A Cubric workflow is a normal ComfyUI **API-format** graph (id-keyed
`{"101": {inputs, class_type, _meta}}`) with two conventions layered on:

1. **The naming law (MPI-116).** Any node the app reads or writes is titled
   `Input_<Name>` (app injects into it) or `Output_<Name>` (app captures from it).
   Node **ids** are never used for lookup — they change on every re-export. Title is
   the contract. → [injection.md](injection.md).
2. **Template vs runtime.** You author ONE `*_template.json`; a **generator** bakes
   it into the per-op / per-tier runtime files the app actually fetches. The app does
   not switch a baked selector at runtime. → [generator-patterns.md](generator-patterns.md).

Everything else — which control injects which title, whether a node is one of ours
or upstream, how many runtime files a template yields — hangs off those two.

## Changing an EXISTING workflow — edit `raw/`, then sync

**`comfy_workflows/raw/*.json` is the only thing anyone edits.** Both other copies are
GENERATED and a hand-edit to either is thrown away by the next sync:

| Path | What it is |
|---|---|
| `comfy_workflows/raw/` | **authoring source — LiteGraph**, params in positional `widgets_values` arrays |
| `comfy_workflows/scripts/workflow_generation/` | generated API template (named keys) |
| `comfy_workflows/*.json` | generated runtime, what the app fetches |

**`raw/` is READ-ONLY to everything but the user.** Never write, move, convert-in-place or
`git checkout` a file under it. Overwriting a raw file with API JSON is unrecoverable without
a backup, and it has happened: MPI-272 found `raw/krea2_turbo_t2i_template.json` in API format
after a manual **Export (API)** mis-click in ComfyUI (that button only appears in dev mode — the
user-side prevention is to turn dev mode off). No script did it — the converters hard-refuse any
output resolving inside `raw/` (`assertNotInRaw()` in sync, the outDir check in
`workflow-to-api.mjs`, commit `f918c907`); do not weaken those guards. The ComfyUI browser's own
library (`engine/.../user/default/workflows/`) is stale junk, not a source of truth: the user
Exports to `raw/` rather than Saving to the library.

Then `node scripts/sync-raw-workflows.mjs` — it converts the git-changed raw files,
gates on `validate-injection-rules.mjs`, bakes the runtime files via `orchestrate.py`,
commits `raw/` and leaves the generated files staged. Needs a running ComfyUI (widget
names come from `/object_info`).

**Convert against the ENGINE, not the bench — `COMFY_URL=http://127.0.0.1:48188`.**
The default is `8188`, which is the authoring bench (`G:\ComfyUi`) and runs AHEAD of
what ships: measured 2026-08-07, bench `0.30.2` vs engine `0.30.0`. The engine's
schema is the one the graph has to satisfy at run time, so it is the one to convert
with. (The bench is still where you author — only the conversion needs the engine.)

**A V3 union widget type is one comma-joined string** — `"FLOAT,INT"`, not an array.
`workflow-to-api.mjs` used to classify that as a SOCKET, so the input was skipped AND
consumed no positional value, shifting every later widget on the node by one:
`LTXVEmptyLatentAudio` shipped `batch_size: 24` when 24 was the frame rate. **ComfyUI
rejects a MISSING required input but silently accepts a SHIFTED one**, so half of it
was invisible. Fixed (MPI-466): a union is a widget only when EVERY member is
primitive — `IMAGE,MASK` stays a socket.

`convert()` now self-checks every emitted node against the same `/object_info` it
converted with and ABORTS on a missing required input, naming the nodes. That is the
only place this class of slip is loud. A dynamic group (`COMFY_AUTOGROW_V3`) satisfies
it via its `<name>.<sub>` entries. It also catches a muted node that severed a link —
see [media-inputs.md](media-inputs.md) § MUTE severs a link.

Full procedure and its traps:
[../playbooks/add-model/01-workflow-split.md](../playbooks/add-model/01-workflow-split.md)
— it applies to editing an existing workflow, not just onboarding a new model.

**Two consequences worth knowing before you go looking for a node.** A named-key search
(`"contour_fill"`) hits the API template and returns **zero** in `raw/`, so quote raw
params by widget INDEX and cross-check the index against the API twin. And **one raw node
fans out** — `sdxl_detailer_template` → 5 runtime detailers, `chroma`/`krea2`/`boogu` → 2
each — so a runtime-shaped list is both wrong to edit and needlessly long. Verify a change
against the **runtime** graphs afterwards; that is what proves the sync propagated.
