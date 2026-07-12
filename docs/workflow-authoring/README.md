# Workflow authoring & injection — the cross-cutting contract

> **What this is.** The model/app-**agnostic** contract for building a ComfyUI
> workflow that Cubric Vision can drive: how the app injects values into a graph,
> the MpiNodes pack you build the graph from, and the generator patterns that turn
> one authored template into the runtime files the app fetches.
>
> This is **shared ground**. Both onboarding a **model**
> ([../playbooks/add-model/](../playbooks/add-model/README.md)) and building an
> **app** ([../apps.md](../apps.md)) sit on top of it. Read the file for the thing
> you're doing; you don't need all of it.

---

## 📌 AGENTS: keep this folder GROWING — do not monolith it

This folder is meant to accumulate. Every time you learn a new injection quirk, a
new control, a new generator pattern, or a new MpiNode worth knowing → **write it
into the matching file below**, or add a new small file. Rules:

- **One subject per file.** Do NOT dump everything into this README or into one
  giant page. If a topic doesn't fit an existing file, make a new short one and add
  a row to the index below.
- **Model/app-agnostic only.** Model-specific tuning goes to `docs/models/<model>/`;
  app-specific wiring goes to `docs/apps.md`. This folder is the machinery both reuse.
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
| [media-inputs.md](media-inputs.md) | **Media-input placeholder rule** — any `LoadImage`/`LoadAudio`/`LoadLatent` on an optional input needs `placeholder.png`/`ltx_silence.wav` baked **and** staged. Required-vs-optional, the staging gate, the guard. Agents miss this. |
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
