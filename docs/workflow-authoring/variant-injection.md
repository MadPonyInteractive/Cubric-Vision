# Variant injection — swapping the diffusion-model / UNETLoader weight

> Part of [workflow-authoring](README.md). **Canonical home** for the runtime-variant
> axis: shipping ONE workflow but loading a **different diffusion-model weight** per
> machine (GPU arch) or per quality — by changing what the `UNETLoader` (or
> `Load Diffusion Model`) node loads. Model/app-agnostic mechanism; model-specific
> weight tables stay in `docs/models/<model>/`.

## The problem it solves

A model may ship the same graph but multiple transformer builds — a Blackwell-native
quant, an Ampere/Ada int8, an fp8 fallback. You do **not** author N workflows and you do
**not** make the user pick a filename. You declare a **variant axis**; the app installs
only the matching weight and points the loader at it.

Two things move together: **which dep installs** and **which file the `UNETLoader` loads**.

## The machinery (shipped, MPI-200 — LTX is the reference)

`js/data/modelConstants/gpuArch.js` returns `'blackwell' | 'modern' | 'legacy'`
(`modern` = Ada / Ampere / Turing / RTX A-series). A model declares a `variants.arch`
block in `models.js`:

```js
variants: {
    arch: {
        options: {
            blackwell: { label: 'RTX 50 Series (Blackwell)', size: '24.1GB',
                         extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
            modern:    { label: 'RTX 40 & Older',            size: '25.2GB',
                         extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8' },
            // legacy → base weight fallback (loads anywhere)
        },
    },
},
```

- `resolveModelDeps.js` § variant axis installs **only** the `extraDeps` matching this
  machine's GPU — the other variants never download.
- `archVariantOptions()` drives the model-manager toggle row (MPI-209).

## Two shapes — pick by whether the GRAPH changes

**Shape A — weight-only swap (NO `workflowSuffix`).** The graph is identical; only the
`UNETLoader.unet_name` differs. This is the common case. Omit `workflowSuffix` — one
runtime workflow file serves every variant, and the app points the loader at the installed
weight. Krea2's arch axis is this shape (`int8_convrot` vs `fp8_scaled` — same graph).

**Shape B — different graph per variant (`workflowSuffix`).** Use only when a variant
needs structurally different nodes (LTX's `_mxfp8`/`_fp8` emit separate workflow files).
`resolveWorkflowFile()` appends the suffix to pick the file. Costs N workflow files — only
pay it when the graph genuinely diverges.

> Decision: does the variant change **only the weight file**, or the **node graph**?
> Weight-only → Shape A (no suffix). Graph changes → Shape B (suffix). When unsure, it's
> almost always A.

## How the loader gets pointed at the right weight

The `UNETLoader` node's `unet_name` is an injection target (`unet_name` is in the
[injection.md](injection.md) target list). The app resolves the variant's installed weight
and injects its filename into the loader by title, same as any other value. So:

- The loader node's `unet_name` == the variant dep's `filename` (minus the
  `diffusion_models/` prefix), == its on-disk path — the **same three-way agreement** as
  any loader (see [../playbooks/add-model/01-workflow-split.md](../playbooks/add-model/01-workflow-split.md)
  § loader paths).
- Each variant is a normal weight **dep** — resource shape in
  [../playbooks/add-model/02-dependencies-r2.md](../playbooks/add-model/02-dependencies-r2.md).

## Traps

- **Not every model has every quant.** A variant option can only reference weights that
  exist. Krea2 Raw has no `mxfp8`/`nvfp4` — its axis degrades to `int8` on `modern` +
  `fp8_scaled` elsewhere. Verify the weight set before declaring options.
- **A Blackwell-only quant cannot rescue low-VRAM non-Blackwell users.** `nvfp4` may be the
  only build that fits 8 GB resident, but if it's Blackwell-only it doesn't help the
  Ampere/Ada 8 GB users who need it. The axis picks by arch, not by VRAM.
- **Same fact, opposite conclusion, different silicon.** INT8 is a win on Ampere (no native
  fp8) and a skip on Blackwell (native fp8). A variant verdict is silicon-specific — don't
  copy one model's arch choice to another without re-checking the target GPUs.

Model-specific weight tables + verdicts: `docs/models/<model>/` (e.g.
[../models/krea2/int8-quant.md](../models/krea2/int8-quant.md) is the worked Krea2 example).
