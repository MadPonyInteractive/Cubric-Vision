# Injection — how the app writes values into a graph

> Part of [workflow-authoring](README.md). The seam between a prompt-box control (or a
> baked op constant) and a node's widget. Model- and app-agnostic.

## The title law (MPI-116)

The app matches a param to a node by **`_meta.title`, case-insensitive** — never by
node id (ids change on every re-export). A node the app writes to is titled
`Input_<Name>`; a node the app captures from is titled `Output_<Name>`.

The injection **key** the control emits must equal that title. `_buildParams`
(`commandExecutor.js`) renames a bare control key to its `Input_` form
(`Batch_Size` → `Input_Batch_Size`) and does **not** abbreviate. Params built outside
`_buildParams` (e.g. `runAutoMask`) must use `Input_*` keys directly.

## The injector target-input list

Once a node is matched by title, `comfyController._inject` (`comfyController.js`,
~line 1223) writes `val` into **every** one of these input fields the node has:

```
value, text, int, float, boolean, string,
ckpt_name, model_name, unet_name, image, mask, picks,
lora_name, strength_model, strength_clip,
denoise, seed, noise_seed, video, audio, latent, select
```

Type coercion is automatic: a numeric widget gets `parseFloat(val)`, a boolean widget
gets `val === true || val === 'true'`, everything else is written as-is.

> **⚠ If your node's target input is NOT in that list, injection silently writes
> nothing.** This is exactly what bit `MpiAnySwitch` (MPI-182): its selector input is
> `select`, which was missing from the list — the title matched, the value never
> landed, the dropdown no-op'd. **When you author a node with a new injectable input
> name, add it to this array** (and record it here). Prefer reusing an existing target
> name (`value`, `int`, `select`) on your MpiNode so you never have to touch the list.

## `Title.widget` — one node, two injected knobs (MPI-359)

A key containing a dot addresses **one widget** on the matched node:
`Input_Style_Selector.selector` writes only `selector`, leaving `strength_model` alone.
Needed as soon as a single node carries two injectable values, which `_inject` cannot
express — it sprays into every recognised name, so the style index would land in both
strengths too.

Additive and backwards-compatible: no plain param key contains a dot, so undotted keys
behave exactly as before. Same silent-miss rule applies one level deeper — a renamed
**widget** drops the write as quietly as a renamed title. First user (and the worked
example): [style-rack.md](style-rack.md).

## Traps (each cost real debugging)

- **Silent title-miss.** A param whose `Input_*` title matches NO node is dropped with
  no error, no log, no toast. Hid `Input_Is_i2i` and `Input_Batch` for four sessions.
  Guard: `tests/inject-params-titles.test.cjs` asserts every `injectParams` title exists
  in every workflow its op can run.
- **`MpiAnySwitch` is 1-INDEXED.** `select` starts at 1. A 0-based control picks the
  wrong branch.
- **LoRA slots take an OBJECT, not a scalar.** A node titled `Input_Lora_N` (or bare
  `Lora_N`) receives `{lora_name, strength_model, strength_clip}` — the injector splits
  it across the node's `lora_name`/`strength_model`/`strength_clip` inputs. Writing the
  whole object into `lora_name` is the MPI-219 `Value not in list: {dict}` 400. Handled
  by the special-case branch in `comfyController` (~line 1171); title the node correctly
  and it just works.
- **Media params carry a KIND.** `Input_Image`→image, `Input_Mask`→mask,
  `Input_Video`→video, `Input_Audio`→audio (`mediaParamKinds`, ~line 1023). `Input_Video`
  /`Input_Audio` may target an `MpiString` fan-out node. All media inputs are
  path→string loaders that self-gate on empty — no placeholder (MPI-272); only
  `LoadLatent` still stages a default. See [media-inputs.md](media-inputs.md).
- **Preview toggle emits ONE key, on a WIDGET.** `Video_Latent.is_preview` →
  `Input_Video_Latent.is_preview` on the `MpiStageLatents` node. The old dual-emit of
  `Preview_Only` / `Input_Preview_Only` (and its `Is_Continue` twin) is DELETED —
  MPI-473, no shipped graph has either node.

## Wiring a control that injects (the app side)

A runtime control = a `PROMPT_BOX_CONTROLS` entry + a `commandRegistry` component +
a `promptControlDefaults` default. The control's `getInjectionParams()` return **key**
must equal the target node's `Input_*` title. Clone an existing control
(`upscaleFactor` = radio → `{Title: value}`; `denoise` = slider) rather than authoring
from scratch. Full walkthrough:
[../playbooks/add-model/04-ops-and-controls.md](../playbooks/add-model/04-ops-and-controls.md).

## Baked op constants (no control needed)

An op can bake a constant with no UI: `commandRegistry.js` `injectParams: { Input_<Name>: true }`.
`_buildParams` merges it before user params, so a control can still override. One line
per op; the injector treats it exactly like a control value.
